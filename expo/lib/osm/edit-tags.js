import {
    CAMERA_MANUFACTURER_OPTIONS,
    CAMERA_MOUNT_OPTIONS,
    CAMERA_MOUNT_TAG_VALUES,
    CAMERA_TYPE_OPTIONS,
    getCameraDirectionTagValue,
    getCameraManufacturerTags,
    getCameraManufacturerValue,
    getCameraSurveillanceTags,
    normalizeCameraDegrees,
} from './camera-schema.js';

export const EDIT_CAMERA_TYPE_OPTIONS = CAMERA_TYPE_OPTIONS;
export const EDIT_MANUFACTURER_OPTIONS = CAMERA_MANUFACTURER_OPTIONS;
export const EDIT_MOUNT_OPTIONS = CAMERA_MOUNT_OPTIONS;

export const REMOVAL_REASONS = [
    { comment: 'gone from pole', label: 'Gone from pole', value: 'gone' },
    {
        comment: 'never existed',
        label: 'Never existed',
        value: 'never-existed',
    },
    { comment: 'duplicate node', label: 'Duplicate', value: 'duplicate' },
    { comment: 'no longer present', label: 'Other', value: 'other' },
];

/** Form fields that own one or more OSM tags on a surveillance node. */
const EDITABLE_DETAIL_FIELDS = [
    'directions',
    'isActive',
    'manufacturer',
    'mount',
    'operator',
    'type',
];

function parseDirectionTagValue(directionValue) {
    if (typeof directionValue === 'number') {
        const normalizedDegrees = normalizeCameraDegrees(directionValue);

        return normalizedDegrees === null ? [] : [normalizedDegrees];
    }

    if (typeof directionValue !== 'string') {
        return [];
    }

    return directionValue
        .split(';')
        .map((token) => token.trim())
        .filter((token) => token !== '')
        .map((token) => normalizeCameraDegrees(Number(token)))
        .filter((degrees) => degrees !== null);
}

/**
 * Maps a node's OSM tags onto the edit form's fields.
 *
 * @param {Record<string, string>} tags
 * @returns {{ directions: number[], isActive: boolean, manufacturer: 'flock'|'motorola'|'other', mount: string|null, operator: string, type: 'alpr'|'cctv'|'gantry' }}
 */
export function parseNodeDetails(tags = {}) {
    const safeTags = tags && typeof tags === 'object' ? tags : {};
    const surveillanceType =
        typeof safeTags['surveillance:type'] === 'string'
            ? safeTags['surveillance:type'].toLowerCase()
            : '';
    const mountTagValue = safeTags['camera:mount'];
    const type =
        mountTagValue === 'gantry'
            ? 'gantry'
            : surveillanceType === 'alpr'
              ? 'alpr'
              : 'cctv';

    return {
        directions: parseDirectionTagValue(safeTags.direction),
        isActive: safeTags['disused:man_made'] !== 'surveillance',
        manufacturer: getCameraManufacturerValue(safeTags.manufacturer),
        mount: CAMERA_MOUNT_TAG_VALUES.includes(mountTagValue)
            ? mountTagValue
            : null,
        operator: safeTags.operator ?? '',
        type,
    };
}

/**
 * Builds the full tag set for the next node version. Existing tags are kept
 * verbatim unless their owning form field is dirty. Omitting `dirtyFields`
 * applies the complete form for callers that intentionally rebuild all tags.
 */
export function buildUpdatedNodeTags(
    existingTags,
    details = {},
    { dirtyFields = EDITABLE_DETAIL_FIELDS } = {},
) {
    const tags = { ...(existingTags ?? {}) };
    const dirtyFieldSet = new Set(dirtyFields);

    const { directions, isActive, manufacturer, mount, operator, type } =
        details;

    if (dirtyFieldSet.has('isActive')) {
        delete tags['disused:man_made'];
        delete tags.man_made;

        if (isActive === false) {
            tags['disused:man_made'] = 'surveillance';
        } else {
            tags.man_made = 'surveillance';
        }
    }

    if (dirtyFieldSet.has('type')) {
        delete tags['camera:type'];
        delete tags.surveillance;
        delete tags['surveillance:type'];
        delete tags['surveillance:zone'];
        Object.assign(tags, getCameraSurveillanceTags(type));
    }

    if (dirtyFieldSet.has('manufacturer')) {
        delete tags.manufacturer;
        delete tags['manufacturer:wikidata'];

        const manufacturerTags = getCameraManufacturerTags(manufacturer);

        if (manufacturerTags) {
            Object.assign(tags, manufacturerTags);
        }
    }

    if (dirtyFieldSet.has('operator')) {
        delete tags.operator;

        const trimmedOperator =
            typeof operator === 'string' ? operator.trim() : '';

        if (trimmedOperator) {
            tags.operator = trimmedOperator;
        }
    }

    if (dirtyFieldSet.has('directions')) {
        delete tags.direction;

        const directionTagValue = getCameraDirectionTagValue(directions);

        if (directionTagValue) {
            tags.direction = directionTagValue;
        }
    }

    if (dirtyFieldSet.has('mount')) {
        delete tags['camera:mount'];

        if (CAMERA_MOUNT_TAG_VALUES.includes(mount)) {
            tags['camera:mount'] = mount;
        }
    }

    if (dirtyFieldSet.has('type') && type === 'gantry') {
        tags['camera:mount'] = 'gantry';
    }

    return tags;
}

export function buildEditChangesetComment(details = {}) {
    const typeLabel =
        details.type === 'cctv'
            ? 'CCTV'
            : details.type === 'gantry'
              ? 'gantry'
              : 'ALPR';

    return `Updated ${typeLabel} camera details`;
}

export function buildRemovalChangesetComment(reasonValue) {
    const removalReason = REMOVAL_REASONS.find(
        (reason) => reason.value === reasonValue,
    );

    return `Removed ALPR camera (${removalReason?.comment ?? 'no longer present'})`;
}
