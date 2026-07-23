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
const MARKER_DIRECTION_PROPERTY_NAMES = ['direction', 'bearing', 'heading'];
const OSM_DIRECTION_TAG_NAMES = [
    'direction',
    'camera:direction',
    'camera:angle',
    'bearing',
];

export function normalizeDirectionDegrees(value) {
    const numericValue =
        typeof value === 'number' ? value : Number.parseFloat(String(value));

    if (Number.isFinite(numericValue)) {
        return ((numericValue % 360) + 360) % 360;
    }

    const cardinalValue = String(value)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    const cardinalDirections = {
        N: 0,
        NNE: 22.5,
        NE: 45,
        ENE: 67.5,
        E: 90,
        ESE: 112.5,
        SE: 135,
        SSE: 157.5,
        S: 180,
        SSW: 202.5,
        SW: 225,
        WSW: 247.5,
        W: 270,
        WNW: 292.5,
        NW: 315,
        NNW: 337.5,
        NORTH: 0,
        EAST: 90,
        SOUTH: 180,
        WEST: 270,
    };

    return cardinalDirections[cardinalValue] ?? null;
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

export function parseDirectionValues(directionValue) {
    if (
        directionValue === null ||
        directionValue === undefined ||
        directionValue === ''
    ) {
        return [];
    }

    if (Array.isArray(directionValue)) {
        return directionValue.flatMap(parseDirectionValues);
    }

    return String(directionValue)
        .split(/[;,]+/)
        .flatMap((value) => splitHyphenDelimitedDirection(value.trim()))
        .map(normalizeDirectionDegrees)
        .filter((value) => value !== null);
}

export function getMarkerDirectionValue(marker) {
    return (
        marker?.properties?.direction ??
        marker?.properties?.bearing ??
        marker?.properties?.heading
    );
}

export function getMarkerDirectionValues(marker) {
    const markerProperties = marker?.properties ?? {};

    for (const propertyName of MARKER_DIRECTION_PROPERTY_NAMES) {
        const directions = parseDirectionValues(markerProperties[propertyName]);

        if (directions.length > 0) {
            return directions;
        }
    }

    const osmNodes = Array.isArray(markerProperties.osm_nodes)
        ? markerProperties.osm_nodes
        : [];
    const directions = [];

    for (const node of osmNodes) {
        const tags = node?.tags;

        if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
            continue;
        }

        for (const tagName of OSM_DIRECTION_TAG_NAMES) {
            const tagDirections = parseDirectionValues(tags[tagName]);

            if (tagDirections.length > 0) {
                directions.push(...tagDirections);
                break;
            }
        }
    }

    return directions;
}

export function formatMarkerDirectionLabel(marker) {
    return getMarkerDirectionValues(marker)
        .map((degrees) => {
            const cardinalIndex =
                Math.round(degrees / 22.5) % CARDINAL_DIRECTIONS.length;
            const degreesLabel = Number.isInteger(degrees)
                ? String(degrees)
                : String(Number(degrees.toFixed(1)));

            return `${degreesLabel} deg - facing ${CARDINAL_DIRECTIONS[cardinalIndex]}`;
        })
        .join('; ');
}
