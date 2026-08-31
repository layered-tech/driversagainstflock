const EARTH_RADIUS_METERS = 6371008.8;
const DEFAULT_TIE_TOLERANCE_METERS = 0.5;
const DEFAULT_MAXIMUM_BACKWARD_DISTANCE_METERS = 25;
const ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES = 0.02;
const METERS_PER_DEGREE_LATITUDE = (EARTH_RADIUS_METERS * Math.PI) / 180;
const ROUTE_PROJECTION_INDEX_MAXIMUM_CELL_COUNT = 20000;

function getFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeLongitude(longitude) {
    const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;

    return normalized === -180 && longitude > 0 ? 180 : normalized;
}

export function normalizeRouteProjectionCoordinate(value) {
    const longitude = getFiniteNumber(
        Array.isArray(value)
            ? value[0]
            : (value?.longitude ?? value?.coords?.longitude),
    );
    const latitude = getFiniteNumber(
        Array.isArray(value)
            ? value[1]
            : (value?.latitude ?? value?.coords?.latitude),
    );

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

    return [normalizeLongitude(longitude), latitude];
}

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function metersToLatitudeDegrees(meters) {
    return meters / METERS_PER_DEGREE_LATITUDE;
}

function metersToLongitudeDegrees(meters, latitude) {
    const maximumLatitude = Math.min(
        89,
        Math.abs(latitude) + metersToLatitudeDegrees(meters),
    );
    const metersPerDegreeLongitude =
        METERS_PER_DEGREE_LATITUDE *
        Math.max(0.01, Math.cos(degreesToRadians(maximumLatitude)));

    return meters / metersPerDegreeLongitude;
}

function createRouteProjectionSpatialIndex(segments) {
    if (
        !segments.length ||
        segments.some(
            (segment) =>
                Math.abs(segment.end[0] - segment.start[0]) > 180 ||
                Math.max(
                    Math.abs(segment.start[1]),
                    Math.abs(segment.end[1]),
                ) >= 85,
        )
    ) {
        return null;
    }

    const cellSegmentIndexes = new Map();
    let cellCount = 0;

    for (const segment of segments) {
        const minimumLongitude = Math.min(segment.start[0], segment.end[0]);
        const maximumLongitude = Math.max(segment.start[0], segment.end[0]);
        const minimumLatitude = Math.min(segment.start[1], segment.end[1]);
        const maximumLatitude = Math.max(segment.start[1], segment.end[1]);
        const minimumCellX = Math.floor(
            (minimumLongitude + 180) / ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
        );
        const maximumCellX = Math.floor(
            (maximumLongitude + 180) / ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
        );
        const minimumCellY = Math.floor(
            (minimumLatitude + 90) / ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
        );
        const maximumCellY = Math.floor(
            (maximumLatitude + 90) / ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
        );
        const segmentCellCount =
            (maximumCellX - minimumCellX + 1) *
            (maximumCellY - minimumCellY + 1);

        cellCount += segmentCellCount;

        if (cellCount > ROUTE_PROJECTION_INDEX_MAXIMUM_CELL_COUNT) {
            return null;
        }

        for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
            for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
                const key = `${cellX}:${cellY}`;
                const segmentsForCell = cellSegmentIndexes.get(key) ?? [];

                segmentsForCell.push(segment);
                cellSegmentIndexes.set(key, segmentsForCell);
            }
        }
    }

    return cellSegmentIndexes;
}

function getRouteProjectionCandidateSegments(
    path,
    target,
    maximumDistanceFromRouteMeters,
) {
    if (
        !path?.spatialIndex ||
        !Number.isFinite(maximumDistanceFromRouteMeters) ||
        maximumDistanceFromRouteMeters < 0
    ) {
        return path?.segments ?? [];
    }

    const latitudeDelta = metersToLatitudeDegrees(
        maximumDistanceFromRouteMeters,
    );
    const longitudeDelta = metersToLongitudeDegrees(
        maximumDistanceFromRouteMeters,
        target[1],
    );
    const minimumCellX = Math.floor(
        (target[0] - longitudeDelta + 180) /
            ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
    );
    const maximumCellX = Math.floor(
        (target[0] + longitudeDelta + 180) /
            ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
    );
    const minimumCellY = Math.floor(
        (target[1] - latitudeDelta + 90) /
            ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
    );
    const maximumCellY = Math.floor(
        (target[1] + latitudeDelta + 90) /
            ROUTE_PROJECTION_INDEX_CELL_SIZE_DEGREES,
    );
    const candidateSegments = new Set();

    for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
            const key = `${cellX}:${cellY}`;

            path.spatialIndex
                .get(key)
                ?.forEach((segment) => candidateSegments.add(segment));
        }
    }

    return [...candidateSegments];
}

function getLongitudeDeltaDegrees(fromLongitude, toLongitude) {
    let delta =
        normalizeLongitude(toLongitude) - normalizeLongitude(fromLongitude);

    if (delta > 180) {
        delta -= 360;
    } else if (delta < -180) {
        delta += 360;
    }

    return delta;
}

function getCoordinateDistanceMeters(firstCoordinate, secondCoordinate) {
    const firstLatitudeRadians = degreesToRadians(firstCoordinate[1]);
    const secondLatitudeRadians = degreesToRadians(secondCoordinate[1]);
    const latitudeDelta = degreesToRadians(
        secondCoordinate[1] - firstCoordinate[1],
    );
    const longitudeDelta = degreesToRadians(
        getLongitudeDeltaDegrees(firstCoordinate[0], secondCoordinate[0]),
    );
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(firstLatitudeRadians) *
            Math.cos(secondLatitudeRadians) *
            Math.sin(longitudeDelta / 2) ** 2;
    const clampedHaversine = Math.min(1, Math.max(0, haversine));

    return (
        2 *
        EARTH_RADIUS_METERS *
        Math.atan2(Math.sqrt(clampedHaversine), Math.sqrt(1 - clampedHaversine))
    );
}

export function interpolateRouteCoordinate(start, end, progress) {
    const longitude =
        start[0] + getLongitudeDeltaDegrees(start[0], end[0]) * progress;

    return [
        normalizeLongitude(longitude),
        start[1] + (end[1] - start[1]) * progress,
    ];
}

export function createRouteProjectionPath(rawCoordinates) {
    const coordinates = (Array.isArray(rawCoordinates) ? rawCoordinates : [])
        .map(normalizeRouteProjectionCoordinate)
        .filter(Boolean);
    const cumulativeDistances = [0];
    const segments = [];

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const start = coordinates[index];
        const end = coordinates[index + 1];
        const lengthMeters = getCoordinateDistanceMeters(start, end);

        if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) {
            cumulativeDistances[index + 1] = cumulativeDistances[index] ?? 0;
            continue;
        }

        const distanceBeforeSegmentMeters = cumulativeDistances[index] ?? 0;

        segments.push({
            distanceBeforeSegmentMeters,
            end,
            index,
            lengthMeters,
            start,
        });
        cumulativeDistances[index + 1] =
            distanceBeforeSegmentMeters + lengthMeters;
    }

    return {
        coordinates,
        cumulativeDistances,
        segments,
        spatialIndex: createRouteProjectionSpatialIndex(segments),
    };
}

function projectCoordinateOntoSegment(segment, target, allowNegativeStart) {
    const { start, end } = segment;
    const originLatitudeRadians = degreesToRadians(
        (start[1] + end[1] + target[1]) / 3,
    );
    const metersPerDegreeLatitude = (EARTH_RADIUS_METERS * Math.PI) / 180;
    const metersPerDegreeLongitude =
        metersPerDegreeLatitude * Math.cos(originLatitudeRadians);
    const segmentX =
        getLongitudeDeltaDegrees(start[0], end[0]) * metersPerDegreeLongitude;
    const segmentY = (end[1] - start[1]) * metersPerDegreeLatitude;
    const pointX =
        getLongitudeDeltaDegrees(start[0], target[0]) *
        metersPerDegreeLongitude;
    const pointY = (target[1] - start[1]) * metersPerDegreeLatitude;
    const squaredSegmentLength = segmentX ** 2 + segmentY ** 2;

    if (squaredSegmentLength < 0.000001) {
        return null;
    }

    const rawFraction =
        (pointX * segmentX + pointY * segmentY) / squaredSegmentLength;
    const fraction = Math.min(1, Math.max(0, rawFraction));
    const projectedX = segmentX * fraction;
    const projectedY = segmentY * fraction;
    const distanceAlongSegmentMeters =
        segment.lengthMeters *
        (allowNegativeStart && segment.index === 0 && rawFraction < 0
            ? rawFraction
            : fraction);

    return {
        coordinate: interpolateRouteCoordinate(start, end, fraction),
        distanceAlongRouteMeters:
            segment.distanceBeforeSegmentMeters + distanceAlongSegmentMeters,
        distanceFromRouteMeters: Math.hypot(
            pointX - projectedX,
            pointY - projectedY,
        ),
        segmentFraction: fraction,
        segmentIndex: segment.index,
    };
}

export function routeProjectionCandidateIsPreferred({
    candidate,
    current,
    maximumBackwardDistanceMeters = DEFAULT_MAXIMUM_BACKWARD_DISTANCE_METERS,
    previousDistanceAlongRouteMeters = null,
    tieToleranceMeters = DEFAULT_TIE_TOLERANCE_METERS,
}) {
    if (!current) {
        return true;
    }

    if (
        candidate.distanceFromRouteMeters <
        current.distanceFromRouteMeters - tieToleranceMeters
    ) {
        return true;
    }

    if (
        Math.abs(
            candidate.distanceFromRouteMeters - current.distanceFromRouteMeters,
        ) > tieToleranceMeters
    ) {
        return false;
    }

    if (Number.isFinite(previousDistanceAlongRouteMeters)) {
        const minimumAllowedDistance =
            previousDistanceAlongRouteMeters - maximumBackwardDistanceMeters;
        const candidateIsWithinContinuityWindow =
            candidate.distanceAlongRouteMeters >= minimumAllowedDistance;
        const currentIsWithinContinuityWindow =
            current.distanceAlongRouteMeters >= minimumAllowedDistance;

        if (
            candidateIsWithinContinuityWindow !==
            currentIsWithinContinuityWindow
        ) {
            return candidateIsWithinContinuityWindow;
        }

        const candidateProgressDelta = Math.abs(
            candidate.distanceAlongRouteMeters -
                previousDistanceAlongRouteMeters,
        );
        const currentProgressDelta = Math.abs(
            current.distanceAlongRouteMeters - previousDistanceAlongRouteMeters,
        );

        if (candidateProgressDelta !== currentProgressDelta) {
            return candidateProgressDelta < currentProgressDelta;
        }
    }

    return (
        candidate.distanceAlongRouteMeters > current.distanceAlongRouteMeters
    );
}

export function projectCoordinateOntoRoute(
    pathOrCoordinates,
    rawTarget,
    {
        allowNegativeDistanceBeforeStart = false,
        maximumBackwardDistanceMeters = DEFAULT_MAXIMUM_BACKWARD_DISTANCE_METERS,
        maximumDistanceFromRouteMeters = null,
        previousDistanceAlongRouteMeters = null,
        tieToleranceMeters = DEFAULT_TIE_TOLERANCE_METERS,
    } = {},
) {
    const path = Array.isArray(pathOrCoordinates)
        ? createRouteProjectionPath(pathOrCoordinates)
        : pathOrCoordinates;
    const target = normalizeRouteProjectionCoordinate(rawTarget);

    if (!path?.segments?.length || !target) {
        return null;
    }

    let closestProjection = null;

    const candidateSegments = getRouteProjectionCandidateSegments(
        path,
        target,
        maximumDistanceFromRouteMeters,
    );

    for (const segment of candidateSegments) {
        const candidate = projectCoordinateOntoSegment(
            segment,
            target,
            allowNegativeDistanceBeforeStart,
        );

        if (
            candidate &&
            routeProjectionCandidateIsPreferred({
                candidate,
                current: closestProjection,
                maximumBackwardDistanceMeters,
                previousDistanceAlongRouteMeters,
                tieToleranceMeters,
            })
        ) {
            closestProjection = candidate;
        }
    }

    if (!closestProjection) {
        return null;
    }

    return {
        ...closestProjection,
        alongRouteDistance: closestProjection.distanceAlongRouteMeters,
        coordinateIndex: closestProjection.segmentIndex,
        distanceAheadMeters: closestProjection.distanceAlongRouteMeters,
        distanceFromPathMeters: closestProjection.distanceFromRouteMeters,
        distanceFromRoute: closestProjection.distanceFromRouteMeters,
        candidateSegmentCount: candidateSegments.length,
    };
}

export function getRemainingRouteWaypoints({
    passedToleranceMeters = 25,
    path,
    progressDistanceMeters,
    waypoints,
}) {
    if (!Array.isArray(waypoints) || !Number.isFinite(progressDistanceMeters)) {
        return Array.isArray(waypoints) ? waypoints : [];
    }

    return waypoints.filter((waypoint) => {
        const projection = projectCoordinateOntoRoute(
            path,
            waypoint?.location ?? waypoint,
            { previousDistanceAlongRouteMeters: progressDistanceMeters },
        );

        return (
            !projection ||
            projection.distanceAlongRouteMeters + passedToleranceMeters >=
                progressDistanceMeters
        );
    });
}
