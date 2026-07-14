const EARTH_RADIUS_METERS = 6371008.8;
const DEFAULT_ACCURACY_CIRCLE_SEGMENTS = 48;

export const NAVIGATION_PUCK_ACCURACY_FEATURE_KIND = 'navigation-puck-accuracy';
export const NAVIGATION_PUCK_SHADOW_FEATURE_KIND = 'navigation-puck-shadow';

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
}

function normalizeLongitude(longitude) {
    if (longitude >= -180 && longitude <= 180) {
        return longitude;
    }

    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function getFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function getLocationGroundValues(location) {
    const latitude = getFiniteNumber(
        location?.latitude ?? location?.coords?.latitude,
    );
    const longitude = getFiniteNumber(
        location?.longitude ?? location?.coords?.longitude,
    );
    const accuracy = getFiniteNumber(
        location?.accuracy ?? location?.coords?.accuracy,
    );

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return {
        accuracy,
        coordinate: [normalizeLongitude(longitude), latitude],
    };
}

function getDestinationCoordinate(coordinate, distanceMeters, bearingRadians) {
    const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
    const latitudeRadians = degreesToRadians(coordinate[1]);
    const longitudeRadians = degreesToRadians(coordinate[0]);
    const destinationLatitude = Math.asin(
        Math.sin(latitudeRadians) * Math.cos(angularDistance) +
            Math.cos(latitudeRadians) *
                Math.sin(angularDistance) *
                Math.cos(bearingRadians),
    );
    const destinationLongitude =
        longitudeRadians +
        Math.atan2(
            Math.sin(bearingRadians) *
                Math.sin(angularDistance) *
                Math.cos(latitudeRadians),
            Math.cos(angularDistance) -
                Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
        );

    return [
        normalizeLongitude(radiansToDegrees(destinationLongitude)),
        radiansToDegrees(destinationLatitude),
    ];
}

function unwrapLongitude(longitude, referenceLongitude) {
    let unwrappedLongitude = longitude;

    while (unwrappedLongitude - referenceLongitude > 180) {
        unwrappedLongitude -= 360;
    }

    while (unwrappedLongitude - referenceLongitude < -180) {
        unwrappedLongitude += 360;
    }

    return unwrappedLongitude;
}

function unwrapRingLongitudes(ring, referenceLongitude) {
    let previousLongitude = referenceLongitude;

    return ring.map(([longitude, latitude]) => {
        const unwrappedLongitude = unwrapLongitude(
            longitude,
            previousLongitude,
        );
        previousLongitude = unwrappedLongitude;

        return [unwrappedLongitude, latitude];
    });
}

function getLongitudeBoundaryIntersection(from, to, boundaryLongitude) {
    const progress = (boundaryLongitude - from[0]) / (to[0] - from[0]);

    return [boundaryLongitude, from[1] + (to[1] - from[1]) * progress];
}

function clipRingAtLongitude(ring, boundaryLongitude, keepLowerLongitudes) {
    const vertices = ring.slice(0, -1);

    if (vertices.length < 3) {
        return [];
    }

    const isInside = ([longitude]) =>
        keepLowerLongitudes
            ? longitude <= boundaryLongitude
            : longitude >= boundaryLongitude;
    const clippedVertices = [];
    let previousVertex = vertices.at(-1);
    let previousVertexIsInside = isInside(previousVertex);

    for (const vertex of vertices) {
        const vertexIsInside = isInside(vertex);

        if (vertexIsInside !== previousVertexIsInside) {
            clippedVertices.push(
                getLongitudeBoundaryIntersection(
                    previousVertex,
                    vertex,
                    boundaryLongitude,
                ),
            );
        }

        if (vertexIsInside) {
            clippedVertices.push(vertex);
        }

        previousVertex = vertex;
        previousVertexIsInside = vertexIsInside;
    }

    if (clippedVertices.length < 3) {
        return [];
    }

    return [...clippedVertices, [...clippedVertices[0]]];
}

function shiftRingLongitude(ring, longitudeOffset) {
    return ring.map(([longitude, latitude]) => [
        longitude + longitudeOffset,
        latitude,
    ]);
}

function makeAccuracyGeometry(ring, referenceLongitude) {
    const unwrappedRing = unwrapRingLongitudes(ring, referenceLongitude);
    const longitudes = unwrappedRing.map(([longitude]) => longitude);
    const minimumLongitude = Math.min(...longitudes);
    const maximumLongitude = Math.max(...longitudes);

    if (maximumLongitude > 180) {
        const westernRing = clipRingAtLongitude(unwrappedRing, 180, true);
        const easternRing = shiftRingLongitude(
            clipRingAtLongitude(unwrappedRing, 180, false),
            -360,
        );

        return {
            type: 'MultiPolygon',
            coordinates: [[westernRing], [easternRing]],
        };
    }

    if (minimumLongitude < -180) {
        const easternRing = clipRingAtLongitude(unwrappedRing, -180, false);
        const westernRing = shiftRingLongitude(
            clipRingAtLongitude(unwrappedRing, -180, true),
            360,
        );

        return {
            type: 'MultiPolygon',
            coordinates: [[easternRing], [westernRing]],
        };
    }

    return {
        type: 'Polygon',
        coordinates: [unwrappedRing],
    };
}

function makeAccuracyPolygonFeature(coordinate, accuracy, segmentCount) {
    const ring = Array.from({ length: segmentCount }, (_, index) =>
        getDestinationCoordinate(
            coordinate,
            accuracy,
            (index / segmentCount) * Math.PI * 2,
        ),
    );

    ring.push([...ring[0]]);

    return {
        type: 'Feature',
        properties: {
            accuracyMeters: accuracy,
            kind: NAVIGATION_PUCK_ACCURACY_FEATURE_KIND,
        },
        geometry: makeAccuracyGeometry(ring, coordinate[0]),
    };
}

function makeShadowPointFeature(coordinate) {
    return {
        type: 'Feature',
        properties: {
            kind: NAVIGATION_PUCK_SHADOW_FEATURE_KIND,
        },
        geometry: {
            type: 'Point',
            coordinates: coordinate,
        },
    };
}

export function makeNavigationPuckGroundFeatureCollection(
    location,
    { segmentCount = DEFAULT_ACCURACY_CIRCLE_SEGMENTS } = {},
) {
    const groundValues = getLocationGroundValues(location);

    if (!groundValues) {
        return {
            type: 'FeatureCollection',
            features: [],
        };
    }

    const resolvedSegmentCount = Math.min(
        128,
        Math.max(12, Math.round(Number(segmentCount) || 0)),
    );
    const features = [];

    if (groundValues.accuracy !== null && groundValues.accuracy > 0) {
        features.push(
            makeAccuracyPolygonFeature(
                groundValues.coordinate,
                groundValues.accuracy,
                resolvedSegmentCount,
            ),
        );
    }

    features.push(makeShadowPointFeature(groundValues.coordinate));

    return {
        type: 'FeatureCollection',
        features,
    };
}
