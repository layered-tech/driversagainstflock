const BORDER_AMBIGUITY_METERS = 500;
const METERS_PER_DEGREE_LATITUDE = 111320;

const featureBoundsCache = new WeakMap();

function normalizeCoordinate(coordinate) {
    const longitude = Number(coordinate?.[0]);
    const latitude = Number(coordinate?.[1]);

    if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

function getFeaturePolygons(feature) {
    if (feature?.geometry?.type === 'Polygon') {
        return [feature.geometry.coordinates];
    }

    return feature?.geometry?.type === 'MultiPolygon' &&
        Array.isArray(feature.geometry.coordinates)
        ? feature.geometry.coordinates
        : [];
}

function longitudeNearPoint(longitude, pointLongitude) {
    let adjusted = longitude;

    while (adjusted - pointLongitude > 180) {
        adjusted -= 360;
    }

    while (adjusted - pointLongitude < -180) {
        adjusted += 360;
    }

    return adjusted;
}

function pointIsInRing(coordinate, ring) {
    const [pointLongitude, pointLatitude] = coordinate;
    let inside = false;

    for (
        let currentIndex = 0, previousIndex = ring.length - 1;
        currentIndex < ring.length;
        previousIndex = currentIndex, currentIndex += 1
    ) {
        const current = ring[currentIndex];
        const previous = ring[previousIndex];
        const currentLongitude = longitudeNearPoint(
            Number(current?.[0]),
            pointLongitude,
        );
        const previousLongitude = longitudeNearPoint(
            Number(previous?.[0]),
            pointLongitude,
        );
        const currentLatitude = Number(current?.[1]);
        const previousLatitude = Number(previous?.[1]);

        if (
            !Number.isFinite(currentLongitude) ||
            !Number.isFinite(previousLongitude) ||
            !Number.isFinite(currentLatitude) ||
            !Number.isFinite(previousLatitude)
        ) {
            continue;
        }

        const intersects =
            currentLatitude > pointLatitude !==
                previousLatitude > pointLatitude &&
            pointLongitude <
                ((previousLongitude - currentLongitude) *
                    (pointLatitude - currentLatitude)) /
                    (previousLatitude - currentLatitude || Number.EPSILON) +
                    currentLongitude;

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function pointIsInPolygon(coordinate, polygon) {
    if (
        !Array.isArray(polygon?.[0]) ||
        !pointIsInRing(coordinate, polygon[0])
    ) {
        return false;
    }

    return !polygon.slice(1).some((hole) => pointIsInRing(coordinate, hole));
}

function featureContainsCoordinate(feature, coordinate) {
    return getFeaturePolygons(feature).some((polygon) =>
        pointIsInPolygon(coordinate, polygon),
    );
}

function getFeatureBounds(feature) {
    const cached = featureBoundsCache.get(feature);

    if (cached) {
        return cached;
    }

    const coordinates = getFeaturePolygons(feature).flat(2);
    const longitudes = coordinates
        .map((coordinate) => Number(coordinate?.[0]))
        .filter(Number.isFinite);
    const latitudes = coordinates
        .map((coordinate) => Number(coordinate?.[1]))
        .filter(Number.isFinite);
    const bounds = {
        east: Math.max(...longitudes),
        north: Math.max(...latitudes),
        south: Math.min(...latitudes),
        west: Math.min(...longitudes),
    };

    featureBoundsCache.set(feature, bounds);

    return bounds;
}

function featureCouldContainCoordinate(feature, coordinate) {
    const [longitude, latitude] = coordinate;
    const bounds = getFeatureBounds(feature);

    return (
        latitude >= bounds.south &&
        latitude <= bounds.north &&
        longitude >= bounds.west &&
        longitude <= bounds.east
    );
}

function pointToSegmentDistanceMeters(point, segmentStart, segmentEnd) {
    const averageLatitudeRadians =
        ((point[1] + segmentStart[1] + segmentEnd[1]) / 3) * (Math.PI / 180);
    const metersPerDegreeLongitude = Math.max(
        1,
        METERS_PER_DEGREE_LATITUDE * Math.cos(averageLatitudeRadians),
    );
    const pointX = point[0] * metersPerDegreeLongitude;
    const pointY = point[1] * METERS_PER_DEGREE_LATITUDE;
    const startX = segmentStart[0] * metersPerDegreeLongitude;
    const startY = segmentStart[1] * METERS_PER_DEGREE_LATITUDE;
    const endX = segmentEnd[0] * metersPerDegreeLongitude;
    const endY = segmentEnd[1] * METERS_PER_DEGREE_LATITUDE;
    const deltaX = endX - startX;
    const deltaY = endY - startY;

    if (Math.abs(deltaX) < 1e-9 && Math.abs(deltaY) < 1e-9) {
        return Math.hypot(pointX - startX, pointY - startY);
    }

    const projection = Math.min(
        1,
        Math.max(
            0,
            ((pointX - startX) * deltaX + (pointY - startY) * deltaY) /
                (deltaX * deltaX + deltaY * deltaY),
        ),
    );

    return Math.hypot(
        pointX - (startX + projection * deltaX),
        pointY - (startY + projection * deltaY),
    );
}

function distanceToFeatureBoundaryMeters(feature, coordinate) {
    let minimumDistance = Number.POSITIVE_INFINITY;

    for (const polygon of getFeaturePolygons(feature)) {
        for (const ring of polygon) {
            for (let index = 1; index < ring.length; index += 1) {
                const start = normalizeCoordinate(ring[index - 1]);
                const end = normalizeCoordinate(ring[index]);

                if (!start || !end) {
                    continue;
                }

                const adjustedStart = [
                    longitudeNearPoint(start[0], coordinate[0]),
                    start[1],
                ];
                const adjustedEnd = [
                    longitudeNearPoint(end[0], coordinate[0]),
                    end[1],
                ];
                minimumDistance = Math.min(
                    minimumDistance,
                    pointToSegmentDistanceMeters(
                        coordinate,
                        adjustedStart,
                        adjustedEnd,
                    ),
                );
            }
        }
    }

    return minimumDistance;
}

export function getStateCodeForCoordinate(
    coordinate,
    boundaryCollection,
    { borderAmbiguityMeters = BORDER_AMBIGUITY_METERS } = {},
) {
    const normalizedCoordinate = normalizeCoordinate(coordinate);
    const features = Array.isArray(boundaryCollection?.features)
        ? boundaryCollection.features
        : [];

    if (!normalizedCoordinate || features.length === 0) {
        return null;
    }

    const matches = features.filter(
        (feature) =>
            featureCouldContainCoordinate(feature, normalizedCoordinate) &&
            featureContainsCoordinate(feature, normalizedCoordinate),
    );

    if (matches.length !== 1) {
        return null;
    }

    const match = matches[0];
    const matchBoundaryDistance = distanceToFeatureBoundaryMeters(
        match,
        normalizedCoordinate,
    );

    if (matchBoundaryDistance <= borderAmbiguityMeters) {
        const isNearAnotherStateBoundary = features.some((feature) => {
            if (feature === match) {
                return false;
            }

            const bounds = getFeatureBounds(feature);
            const latitudePadding = borderAmbiguityMeters / 111320;
            const longitudePadding =
                borderAmbiguityMeters /
                Math.max(
                    1,
                    111320 *
                        Math.cos((normalizedCoordinate[1] * Math.PI) / 180),
                );

            if (
                normalizedCoordinate[1] < bounds.south - latitudePadding ||
                normalizedCoordinate[1] > bounds.north + latitudePadding ||
                normalizedCoordinate[0] < bounds.west - longitudePadding ||
                normalizedCoordinate[0] > bounds.east + longitudePadding
            ) {
                return false;
            }

            return (
                distanceToFeatureBoundaryMeters(
                    feature,
                    normalizedCoordinate,
                ) <= borderAmbiguityMeters
            );
        });

        if (isNearAnotherStateBoundary) {
            return null;
        }
    }

    const stateCode = match?.properties?.stateCode;

    return typeof stateCode === 'string' && /^[A-Z]{2}$/.test(stateCode)
        ? stateCode
        : null;
}
