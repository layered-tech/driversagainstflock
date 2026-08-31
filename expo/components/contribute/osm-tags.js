import {
    CAMERA_MOUNT_TAG_VALUES,
    getCameraDirectionTagValue,
    getCameraManufacturerTags,
    getCameraSurveillanceTags,
    normalizeCameraDegrees,
} from '../../lib/osm/camera-schema.js';

const CARDINAL_DIRECTIONS = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
];

export function buildNodeTags(details = {}) {
    const { directions, manufacturer, mount, operator, type } = details;
    const tags = {
        man_made: 'surveillance',
        ...getCameraSurveillanceTags(type),
    };
    const manufacturerTags = getCameraManufacturerTags(manufacturer);

    if (manufacturerTags) {
        Object.assign(tags, manufacturerTags);
    }

    const trimmedOperator = typeof operator === 'string' ? operator.trim() : '';

    if (trimmedOperator) {
        tags.operator = trimmedOperator;
    }

    const directionTagValue = getCameraDirectionTagValue(directions);

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

function normalizeChangesetHashtags(hashtags) {
    if (typeof hashtags !== 'string') {
        return '';
    }

    return hashtags
        .split(/[\s,;]+/)
        .map((token) => token.replace(/^#+/, ''))
        .filter(Boolean)
        .map((token) => `#${token}`)
        .join(';');
}

export function buildChangesetTags({ comment, hashtags, source } = {}) {
    const tags = {
        comment: typeof comment === 'string' ? comment.trim() : '',
    };
    const trimmedSource = typeof source === 'string' ? source.trim() : '';

    if (trimmedSource) {
        tags.source = trimmedSource;
    }

    const normalizedHashtags = normalizeChangesetHashtags(hashtags);

    if (normalizedHashtags) {
        tags.hashtags = normalizedHashtags;
    }

    return tags;
}

export function degreesToCardinal(degrees) {
    const normalizedDegrees = normalizeCameraDegrees(degrees);

    if (normalizedDegrees === null) {
        return '';
    }

    const cardinalIndex =
        Math.round(normalizedDegrees / 22.5) % CARDINAL_DIRECTIONS.length;

    return CARDINAL_DIRECTIONS[cardinalIndex];
}

export function formatBearingChip(degrees) {
    const normalizedDegrees = normalizeCameraDegrees(degrees);

    if (normalizedDegrees === null) {
        return '';
    }

    return `${normalizedDegrees}° · ${degreesToCardinal(normalizedDegrees)}`;
}
