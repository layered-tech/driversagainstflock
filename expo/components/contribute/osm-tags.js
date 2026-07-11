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

const CAMERA_MOUNT_TAG_VALUES = [
    'building',
    'gantry',
    'pole',
    'traffic_signals',
];

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

function normalizeDegrees(degrees) {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
        return null;
    }

    return ((Math.round(degrees) % 360) + 360) % 360;
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

export function buildNodeTags(details = {}) {
    const { directions, manufacturer, mount, operator, type } = details;
    const tags = {
        man_made: 'surveillance',
        ...(type === 'cctv' ? CCTV_SURVEILLANCE_TAGS : ALPR_SURVEILLANCE_TAGS),
    };
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
    const normalizedDegrees = normalizeDegrees(degrees);

    if (normalizedDegrees === null) {
        return '';
    }

    const cardinalIndex =
        Math.round(normalizedDegrees / 22.5) % CARDINAL_DIRECTIONS.length;

    return CARDINAL_DIRECTIONS[cardinalIndex];
}

export function formatBearingChip(degrees) {
    const normalizedDegrees = normalizeDegrees(degrees);

    if (normalizedDegrees === null) {
        return '';
    }

    return `${normalizedDegrees}° · ${degreesToCardinal(normalizedDegrees)}`;
}
