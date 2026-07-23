const CARDINAL_DIRECTION_DEGREES = {
    E: 90,
    EB: 90,
    ENE: 67.5,
    ESE: 112.5,
    EAST: 90,
    N: 0,
    NB: 0,
    NE: 45,
    NNE: 22.5,
    NNW: 337.5,
    NORTH: 0,
    NORTHEAST: 45,
    NORTHWEST: 315,
    NW: 315,
    S: 180,
    SB: 180,
    SE: 135,
    SOUTH: 180,
    SOUTHEAST: 135,
    SOUTHWEST: 225,
    SSE: 157.5,
    SSW: 202.5,
    SW: 225,
    W: 270,
    WB: 270,
    WEST: 270,
    WNW: 292.5,
    WSW: 247.5,
};

const CARDINAL_DIRECTION_LABELS = [
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

export const MAX_MARKER_CONE_DIRECTIONS = 8;

function decodeStructuredValue(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmedValue = value.trim();

    if (
        !(
            (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
            (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))
        )
    ) {
        return value;
    }

    try {
        return JSON.parse(trimmedValue);
    } catch {
        return value;
    }
}

function firstValidDirectionValue(values) {
    for (const value of values) {
        if (parseDirectionValues(value).length > 0) {
            return typeof value === 'string' ? value.trim() : value;
        }
    }

    return null;
}

function directionValueFromTags(tags) {
    const decodedTags = decodeStructuredValue(tags);

    if (
        !decodedTags ||
        typeof decodedTags !== 'object' ||
        Array.isArray(decodedTags)
    ) {
        return null;
    }

    return firstValidDirectionValue([
        decodedTags.direction,
        decodedTags['camera:direction'],
    ]);
}

function splitHyphenDelimitedDirection(value) {
    const directions = [];
    let currentValue = '';

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        const nextCharacter = value[index + 1];
        const isLeadingNegativeNumber =
            character === '-' &&
            currentValue.trim() === '' &&
            /[0-9.]/.test(nextCharacter ?? '');

        if (character === '-' && !isLeadingNegativeNumber) {
            if (currentValue.trim()) {
                directions.push(currentValue.trim());
            }

            currentValue = '';
            continue;
        }

        currentValue += character;
    }

    if (currentValue.trim()) {
        directions.push(currentValue.trim());
    }

    return directions;
}

function normalizeDirectionDegrees(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? normalizeDegrees(value) : null;
    }

    const trimmedValue = String(value ?? '').trim();

    if (trimmedValue === '') {
        return null;
    }

    const numericValue = Number(trimmedValue);

    if (Number.isFinite(numericValue)) {
        return normalizeDegrees(numericValue);
    }

    const cardinalValue = trimmedValue.toUpperCase().replace(/\s+/g, '');

    return CARDINAL_DIRECTION_DEGREES[cardinalValue] ?? null;
}

function normalizeDegrees(value) {
    const normalizedValue = ((value % 360) + 360) % 360;

    return Number(normalizedValue.toFixed(10));
}

function formatDegrees(value) {
    return Number.isInteger(value)
        ? String(value)
        : String(Number(value.toFixed(1)));
}

function cardinalDirection(value) {
    const index = Math.round(value / 22.5) % CARDINAL_DIRECTION_LABELS.length;

    return CARDINAL_DIRECTION_LABELS[index];
}

export function parseDirectionValues(directionValue) {
    if (Array.isArray(directionValue)) {
        return directionValue.flatMap(parseDirectionValues);
    }

    if (
        directionValue === null ||
        directionValue === undefined ||
        directionValue === ''
    ) {
        return [];
    }

    return String(directionValue)
        .split(/[;,]+/)
        .flatMap((value) => splitHyphenDelimitedDirection(value.trim()))
        .map(normalizeDirectionDegrees)
        .filter((value) => value !== null);
}

export function findMarkerDirectionValue(marker) {
    const properties = decodeStructuredValue(marker?.properties) ?? {};
    const directValue = firstValidDirectionValue([
        properties.direction,
        properties.camera_direction,
        properties['camera:direction'],
    ]);

    if (directValue !== null) {
        return directValue;
    }

    const propertyTagValue = directionValueFromTags(properties.tags);

    if (propertyTagValue !== null) {
        return propertyTagValue;
    }

    const osmNodes = decodeStructuredValue(properties.osm_nodes);

    if (Array.isArray(osmNodes)) {
        for (const osmNodeValue of osmNodes) {
            const osmNode = decodeStructuredValue(osmNodeValue) ?? {};
            const nodeValue = firstValidDirectionValue([
                osmNode.direction,
                osmNode.camera_direction,
                osmNode['camera:direction'],
            ]);

            if (nodeValue !== null) {
                return nodeValue;
            }

            const nodeTagValue = directionValueFromTags(osmNode.tags);

            if (nodeTagValue !== null) {
                return nodeTagValue;
            }
        }
    }

    return firstValidDirectionValue([properties.bearing, properties.heading]);
}

export function formatDirectionLabels(directionValue) {
    return parseDirectionValues(directionValue)
        .map(
            (direction) =>
                `${formatDegrees(direction)} deg - facing ${cardinalDirection(direction)}`,
        )
        .join('; ');
}
