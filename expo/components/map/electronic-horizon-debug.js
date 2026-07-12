const EMPTY_ELECTRONIC_HORIZON_DEBUG_FEATURE_COLLECTION = Object.freeze({
    features: Object.freeze([]),
    type: 'FeatureCollection',
});

export const ELECTRONIC_HORIZON_DEBUG_PRIMARY_PATH_COLOR = '#1FBF6B';

const ELECTRONIC_HORIZON_DEBUG_BRANCH_COLORS = [
    '#2E8BFF',
    '#FFB02E',
    '#7A5CFF',
    '#FF4D4F',
    '#00A6B2',
    '#E36D9C',
];

function getFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function normalizeCoordinate(coordinate) {
    if (!Array.isArray(coordinate)) {
        return null;
    }

    const longitude = getFiniteNumber(coordinate[0]);
    const latitude = getFiniteNumber(coordinate[1]);

    if (
        longitude === null ||
        latitude === null ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

function normalizeCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    const normalizedCoordinates = coordinates.map(normalizeCoordinate);

    return normalizedCoordinates.some((coordinate) => coordinate === null)
        ? []
        : normalizedCoordinates;
}

function getSegmentDistance(coordinate, nextCoordinate) {
    const latitudeRadians = (coordinate[1] * Math.PI) / 180;
    const nextLatitudeRadians = (nextCoordinate[1] * Math.PI) / 180;
    const latitudeDelta = nextLatitudeRadians - latitudeRadians;
    const longitudeDelta =
        (((nextCoordinate[0] - coordinate[0] + 540) % 360) - 180) *
        (Math.PI / 180);
    const sinLatitude = Math.sin(latitudeDelta / 2);
    const sinLongitude = Math.sin(longitudeDelta / 2);
    const a =
        sinLatitude * sinLatitude +
        Math.cos(latitudeRadians) *
            Math.cos(nextLatitudeRadians) *
            sinLongitude *
            sinLongitude;

    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeLongitude(longitude) {
    return ((longitude + 540) % 360) - 180;
}

export function getElectronicHorizonPathMidpoint(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return null;
    }

    if (coordinates.length === 1) {
        return coordinates[0];
    }

    const segmentDistances = [];
    let totalDistance = 0;

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const distance = getSegmentDistance(
            coordinates[index],
            coordinates[index + 1],
        );

        segmentDistances.push(distance);
        totalDistance += distance;
    }

    if (totalDistance === 0) {
        return coordinates[Math.floor((coordinates.length - 1) / 2)];
    }

    const midpointDistance = totalDistance / 2;
    let traversedDistance = 0;

    for (let index = 0; index < segmentDistances.length; index += 1) {
        const segmentDistance = segmentDistances[index];

        if (traversedDistance + segmentDistance < midpointDistance) {
            traversedDistance += segmentDistance;
            continue;
        }

        const start = coordinates[index];
        const end = coordinates[index + 1];
        const segmentProgress =
            segmentDistance === 0
                ? 0
                : (midpointDistance - traversedDistance) / segmentDistance;
        const longitudeDelta = ((end[0] - start[0] + 540) % 360) - 180;

        return [
            normalizeLongitude(start[0] + longitudeDelta * segmentProgress),
            start[1] + (end[1] - start[1]) * segmentProgress,
        ];
    }

    return coordinates.at(-1) ?? null;
}

export function formatElectronicHorizonProbability(probability) {
    const numericProbability = getFiniteNumber(probability);

    if (numericProbability === null || numericProbability < 0) {
        return null;
    }

    const percent =
        numericProbability <= 1 ? numericProbability * 100 : numericProbability;

    return `${Math.round(Math.min(percent, 100))}%`;
}

function getBranchColor(branchIndex, level) {
    const numericLevel = getFiniteNumber(level);
    const normalizedLevel =
        numericLevel !== null ? Math.max(0, Math.floor(numericLevel)) : 0;
    const colorIndex =
        (normalizedLevel + Math.max(0, branchIndex)) %
        ELECTRONIC_HORIZON_DEBUG_BRANCH_COLORS.length;

    return ELECTRONIC_HORIZON_DEBUG_BRANCH_COLORS[colorIndex];
}

function makePathFeatures({
    color,
    coordinates,
    id,
    level,
    probability,
    role,
}) {
    if (coordinates.length < 2) {
        return [];
    }

    const probabilityLabel = formatElectronicHorizonProbability(probability);
    const properties = {
        color,
        debugRole: role,
        level: getFiniteNumber(level),
        probability: getFiniteNumber(probability),
        probabilityLabel,
    };
    const features = [
        {
            type: 'Feature',
            id: `${id}-path`,
            geometry: {
                type: 'LineString',
                coordinates,
            },
            properties: {
                ...properties,
                debugGeometry: 'path',
            },
        },
    ];
    const midpoint = probabilityLabel
        ? getElectronicHorizonPathMidpoint(coordinates)
        : null;

    if (midpoint) {
        features.push({
            type: 'Feature',
            id: `${id}-probability`,
            geometry: {
                type: 'Point',
                coordinates: midpoint,
            },
            properties: {
                ...properties,
                debugGeometry: 'probability',
            },
        });
    }

    return features;
}

export function makeElectronicHorizonDebugFeatureCollection(
    electronicHorizon,
    visible,
) {
    if (visible !== true || !electronicHorizon) {
        return EMPTY_ELECTRONIC_HORIZON_DEBUG_FEATURE_COLLECTION;
    }

    const features = [];
    const primaryPath =
        electronicHorizon.primaryPath ?? electronicHorizon.mostProbablePath;
    const primarySegments = Array.isArray(primaryPath?.segments)
        ? primaryPath.segments
        : [];
    const primaryPathParts = primarySegments.length
        ? primarySegments
        : [
              {
                  coordinates: primaryPath?.coordinates,
                  edgeId: 'primary-path',
                  probability: primaryPath?.probability,
              },
          ];

    primaryPathParts.forEach((segment, segmentIndex) => {
        features.push(
            ...makePathFeatures({
                color: ELECTRONIC_HORIZON_DEBUG_PRIMARY_PATH_COLOR,
                coordinates: normalizeCoordinates(segment?.coordinates),
                id: `electronic-horizon-primary-${segment?.edgeId ?? 'edge'}-${
                    segmentIndex
                }`,
                level: 0,
                probability: segment?.probability,
                role: 'primary-path',
            }),
        );
    });

    if (Array.isArray(electronicHorizon.branches)) {
        electronicHorizon.branches.forEach((branch, branchIndex) => {
            const coordinates = normalizeCoordinates(branch?.coordinates);

            features.push(
                ...makePathFeatures({
                    color: getBranchColor(branchIndex, branch?.level),
                    coordinates,
                    id: `electronic-horizon-branch-${
                        branch?.edgeId ?? 'edge'
                    }-${branchIndex}`,
                    level: branch?.level,
                    probability: branch?.probability,
                    role: 'branch',
                }),
            );
        });
    }

    return features.length
        ? {
              type: 'FeatureCollection',
              features,
          }
        : EMPTY_ELECTRONIC_HORIZON_DEBUG_FEATURE_COLLECTION;
}
