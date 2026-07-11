export const EDIT_CAMERA_TYPE_OPTIONS = [
    { label: 'ALPR', value: 'alpr' },
    { label: 'CCTV', value: 'cctv' },
    { label: 'Gantry', value: 'gantry' },
];

export const EDIT_MANUFACTURER_OPTIONS = [
    { label: 'Flock', value: 'flock' },
    { label: 'Motorola', value: 'motorola' },
    { label: 'Other', value: 'other' },
];

export const EDIT_MOUNT_OPTIONS = [
    { label: 'Pole', value: 'pole' },
    { label: 'Gantry', value: 'gantry' },
    { label: 'Building', value: 'building' },
    { label: 'Traffic light', value: 'traffic_signals' },
];

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

const CAMERA_MOUNT_TAG_VALUES = EDIT_MOUNT_OPTIONS.map(
    (option) => option.value,
);

const ALPR_SURVEILLANCE_TAGS = {
    'camera:type': 'fixed',
    surveillance: 'public',
    'surveillance:type': 'ALPR',
    'surveillance:zone': 'traffic',
};

const CCTV_SURVEILLANCE_TAGS = {
    'camera:type': 'fixed',
    surveillance: 'public',
    'surveillance:type': 'camera',
};

const MANUFACTURER_TAGS = {
    flock: {
        manufacturer: 'Flock Safety',
        'manufacturer:wikidata': 'Q108485435',
    },
    motorola: {
        manufacturer: 'Motorola Solutions',
        'manufacturer:wikidata': 'Q634815',
    },
};

const MANUFACTURER_TAG_VALUES = {
    'Flock Safety': 'flock',
    'Motorola Solutions': 'motorola',
};

/**
 * Tag keys this app manages on a surveillance node. Everything else on the
 * node is preserved verbatim when publishing a new version (OSM etiquette).
 */
const MANAGED_TAG_KEYS = [
    'camera:mount',
    'camera:type',
    'direction',
    'disused:man_made',
    'man_made',
    'manufacturer',
    'manufacturer:wikidata',
    'operator',
    'surveillance',
    'surveillance:type',
    'surveillance:zone',
];

function normalizeDegrees(degrees) {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
        return null;
    }

    return ((Math.round(degrees) % 360) + 360) % 360;
}

function parseDirectionTagValue(directionValue) {
    if (typeof directionValue === 'number') {
        const normalizedDegrees = normalizeDegrees(directionValue);

        return normalizedDegrees === null ? [] : [normalizedDegrees];
    }

    if (typeof directionValue !== 'string') {
        return [];
    }

    return directionValue
        .split(';')
        .map((token) => token.trim())
        .filter((token) => token !== '')
        .map((token) => normalizeDegrees(Number(token)))
        .filter((degrees) => degrees !== null);
}

function getDirectionTagValue(directions) {
    if (!Array.isArray(directions)) {
        return '';
    }

    return directions
        .map(normalizeDegrees)
        .filter((degrees) => degrees !== null)
        .join(';');
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
        manufacturer: MANUFACTURER_TAG_VALUES[safeTags.manufacturer] ?? 'other',
        mount: CAMERA_MOUNT_TAG_VALUES.includes(mountTagValue)
            ? mountTagValue
            : null,
        operator: safeTags.operator ?? '',
        type,
    };
}

/**
 * Builds the FULL tag set for the next version of an existing node: every
 * unmanaged existing tag is preserved untouched, all managed keys are
 * stripped, and the managed vocabulary for `details` is applied on top.
 */
export function buildUpdatedNodeTags(existingTags, details = {}) {
    const tags = {};

    for (const [key, value] of Object.entries(existingTags ?? {})) {
        if (!MANAGED_TAG_KEYS.includes(key)) {
            tags[key] = value;
        }
    }

    const { directions, isActive, manufacturer, mount, operator, type } =
        details;

    if (isActive === false) {
        tags['disused:man_made'] = 'surveillance';
    } else {
        tags.man_made = 'surveillance';
    }

    Object.assign(
        tags,
        type === 'cctv' ? CCTV_SURVEILLANCE_TAGS : ALPR_SURVEILLANCE_TAGS,
    );

    const manufacturerTags = MANUFACTURER_TAGS[manufacturer];

    if (manufacturerTags) {
        Object.assign(tags, manufacturerTags);
    }

    const trimmedOperator = typeof operator === 'string' ? operator.trim() : '';

    if (trimmedOperator) {
        tags.operator = trimmedOperator;
    }

    const directionTagValue = getDirectionTagValue(directions);

    if (directionTagValue) {
        tags.direction = directionTagValue;
    }

    if (CAMERA_MOUNT_TAG_VALUES.includes(mount)) {
        tags['camera:mount'] = mount;
    }

    if (type === 'gantry') {
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
