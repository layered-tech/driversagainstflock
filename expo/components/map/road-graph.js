const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362920544;
const KILOMETERS_PER_HOUR_TO_MILES_PER_HOUR = 0.62137119223733;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
}

function getFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeCoordinate(coordinate) {
    const longitude = getFiniteNumber(coordinate?.[0]);
    const latitude = getFiniteNumber(coordinate?.[1]);

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

export function normalizeRoadHeading(value) {
    const heading = getFiniteNumber(value);

    return heading === null ? null : ((heading % 360) + 360) % 360;
}

export function getRoadHeadingDeltaDegrees(fromHeading, toHeading) {
    const normalizedFromHeading = normalizeRoadHeading(fromHeading);
    const normalizedToHeading = normalizeRoadHeading(toHeading);

    if (normalizedFromHeading === null || normalizedToHeading === null) {
        return null;
    }

    return Math.abs(
        ((normalizedToHeading - normalizedFromHeading + 540) % 360) - 180,
    );
}

export function getRoadCoordinateDistanceMeters(fromCoordinate, toCoordinate) {
    const from = normalizeCoordinate(fromCoordinate);
    const to = normalizeCoordinate(toCoordinate);

    if (!from || !to) {
        return null;
    }

    const fromLatitudeRadians = degreesToRadians(from[1]);
    const toLatitudeRadians = degreesToRadians(to[1]);
    const latitudeDelta = degreesToRadians(to[1] - from[1]);
    const longitudeDelta = degreesToRadians(to[0] - from[0]);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.sin(longitudeDelta / 2) ** 2;
    const clampedHaversine = Math.min(1, Math.max(0, haversine));

    return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(clampedHaversine), Math.sqrt(1 - clampedHaversine))
    );
}

export function getRoadCoordinateBearingDegrees(fromCoordinate, toCoordinate) {
    const from = normalizeCoordinate(fromCoordinate);
    const to = normalizeCoordinate(toCoordinate);

    if (!from || !to) {
        return null;
    }

    const fromLatitudeRadians = degreesToRadians(from[1]);
    const toLatitudeRadians = degreesToRadians(to[1]);
    const longitudeDelta = degreesToRadians(to[0] - from[0]);
    const y = Math.sin(longitudeDelta) * Math.cos(toLatitudeRadians);
    const x =
        Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians) -
        Math.sin(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.cos(longitudeDelta);

    return normalizeRoadHeading(radiansToDegrees(Math.atan2(y, x)));
}

export function interpolateRoadCoordinate(start, end, fraction) {
    const normalizedStart = normalizeCoordinate(start);
    const normalizedEnd = normalizeCoordinate(end);

    if (!normalizedStart || !normalizedEnd) {
        return null;
    }

    const clampedFraction = Math.min(1, Math.max(0, Number(fraction) || 0));

    return [
        normalizedStart[0] +
            (normalizedEnd[0] - normalizedStart[0]) * clampedFraction,
        normalizedStart[1] +
            (normalizedEnd[1] - normalizedStart[1]) * clampedFraction,
    ];
}

function coordinateToLocalMeters(coordinate, origin) {
    const latitudeRadians = degreesToRadians((coordinate[1] + origin[1]) / 2);

    return {
        x:
            EARTH_RADIUS_METERS *
            degreesToRadians(coordinate[0] - origin[0]) *
            Math.cos(latitudeRadians),
        y: EARTH_RADIUS_METERS * degreesToRadians(coordinate[1] - origin[1]),
    };
}

export function projectCoordinateOntoRoadSegment(coordinate, segment) {
    const target = normalizeCoordinate(coordinate);
    const start = normalizeCoordinate(segment?.start);
    const end = normalizeCoordinate(segment?.end);

    if (!target || !start || !end) {
        return null;
    }

    const localTarget = coordinateToLocalMeters(target, start);
    const localEnd = coordinateToLocalMeters(end, start);
    const squaredLength = localEnd.x ** 2 + localEnd.y ** 2;

    if (squaredLength <= 0) {
        return null;
    }

    const fraction = Math.min(
        1,
        Math.max(
            0,
            (localTarget.x * localEnd.x + localTarget.y * localEnd.y) /
                squaredLength,
        ),
    );
    const projectedCoordinate = interpolateRoadCoordinate(start, end, fraction);
    const distanceMeters = getRoadCoordinateDistanceMeters(
        target,
        projectedCoordinate,
    );

    if (distanceMeters === null) {
        return null;
    }

    return {
        coordinate: projectedCoordinate,
        distanceMeters,
        fraction,
        segment,
    };
}

function normalizeSpeedLimit(speedLimit) {
    const speed = getFiniteNumber(
        speedLimit?.speed ?? speedLimit?.value ?? speedLimit,
    );

    if (speed === null || speed < 0) {
        return null;
    }

    const unit = String(speedLimit?.unit ?? 'mph')
        .trim()
        .toLowerCase();
    let speedLimitMph;

    if (unit === 'km/h' || unit === 'kmh' || unit === 'kph') {
        speedLimitMph = speed * KILOMETERS_PER_HOUR_TO_MILES_PER_HOUR;
    } else if (unit === 'm/s' || unit === 'mps') {
        speedLimitMph = speed * METERS_PER_SECOND_TO_MILES_PER_HOUR;
    } else {
        speedLimitMph = speed;
    }

    return {
        speed,
        speedLimitMph,
        unit:
            unit === 'kmh' || unit === 'kph'
                ? 'km/h'
                : unit === 'mps'
                  ? 'm/s'
                  : unit,
    };
}

function getWayDirection(way) {
    if (way?.direction === 'backward' || way?.oneWay === -1) {
        return 'backward';
    }

    if (
        way?.direction === 'forward' ||
        way?.oneWay === true ||
        way?.oneway === true
    ) {
        return 'forward';
    }

    return 'both';
}

function createDirectedSegment({
    direction,
    end,
    index,
    sourceNodeId,
    start,
    targetNodeId,
    way,
}) {
    const lengthMeters = getRoadCoordinateDistanceMeters(start, end);
    const bearing = getRoadCoordinateBearingDegrees(start, end);

    if (lengthMeters === null || lengthMeters <= 0 || bearing === null) {
        return null;
    }

    const directionalSpeedLimits = way.speedLimits;
    const hasDirectionalSpeedLimit =
        directionalSpeedLimits &&
        Object.prototype.hasOwnProperty.call(directionalSpeedLimits, direction);

    return Object.freeze({
        bearing,
        direction,
        end,
        id: `${way.id}:${index}:${direction}`,
        index,
        layer: getFiniteNumber(way.layer) ?? 0,
        lengthMeters,
        osmWayId:
            way.osmWayId === null || way.osmWayId === undefined
                ? null
                : String(way.osmWayId),
        priority: getFiniteNumber(way.priority) ?? 0,
        roadClass:
            typeof way.roadClass === 'string' ? way.roadClass.trim() : '',
        roadName:
            typeof way.name === 'string' && way.name.trim()
                ? way.name.trim()
                : '',
        sourceNodeId,
        speedLimit: normalizeSpeedLimit(
            hasDirectionalSpeedLimit
                ? directionalSpeedLimits[direction]
                : way.speedLimit,
        ),
        start,
        targetNodeId,
        tunnel: way.tunnel === true,
        wayId: String(way.id),
    });
}

function addOutgoingSegment(outgoingSegmentsByNodeId, segment) {
    const outgoingSegments =
        outgoingSegmentsByNodeId.get(segment.sourceNodeId) ?? [];

    outgoingSegments.push(segment);
    outgoingSegmentsByNodeId.set(segment.sourceNodeId, outgoingSegments);
}

export function createDirectedRoadGraph(ways) {
    const edges = [];
    const edgesById = new Map();
    const nodesById = new Map();
    const outgoingEdgesByNodeId = new Map();

    for (const way of Array.isArray(ways) ? ways : []) {
        if (
            way?.access === false ||
            way?.id === null ||
            way?.id === undefined
        ) {
            continue;
        }

        const coordinates = Array.isArray(way.coordinates)
            ? way.coordinates.map(normalizeCoordinate)
            : [];

        if (coordinates.length < 2 || coordinates.some((item) => !item)) {
            continue;
        }

        const nodeIds = coordinates.map((coordinate, index) =>
            String(way.nodeIds?.[index] ?? `${way.id}:node:${index}`),
        );
        const direction = getWayDirection(way);

        nodeIds.forEach((nodeId, index) => {
            if (!nodesById.has(nodeId)) {
                nodesById.set(nodeId, {
                    coordinate: coordinates[index],
                    id: nodeId,
                });
            }
        });

        for (let index = 0; index < coordinates.length - 1; index += 1) {
            const forwardSegment = createDirectedSegment({
                direction: 'forward',
                end: coordinates[index + 1],
                index,
                sourceNodeId: nodeIds[index],
                start: coordinates[index],
                targetNodeId: nodeIds[index + 1],
                way,
            });
            const backwardSegment = createDirectedSegment({
                direction: 'backward',
                end: coordinates[index],
                index,
                sourceNodeId: nodeIds[index + 1],
                start: coordinates[index + 1],
                targetNodeId: nodeIds[index],
                way,
            });
            const directedSegments =
                direction === 'forward'
                    ? [forwardSegment]
                    : direction === 'backward'
                      ? [backwardSegment]
                      : [forwardSegment, backwardSegment];

            directedSegments.filter(Boolean).forEach((segment) => {
                edges.push(segment);
                edgesById.set(segment.id, segment);
                addOutgoingSegment(outgoingEdgesByNodeId, segment);
            });
        }
    }

    return Object.freeze({
        edges: Object.freeze(edges),
        edgesById,
        nodesById,
        outgoingEdgesByNodeId,
    });
}

export function getRoadCandidateProjections(
    graph,
    coordinate,
    maximumDistanceMeters,
) {
    const maximumDistance = Math.max(0, Number(maximumDistanceMeters) || 0);

    return (graph?.edges ?? [])
        .map((segment) => projectCoordinateOntoRoadSegment(coordinate, segment))
        .filter(
            (projection) =>
                projection && projection.distanceMeters <= maximumDistance,
        )
        .sort((first, second) => first.distanceMeters - second.distanceMeters);
}

export function getShortestRoadPathDistanceMeters(
    graph,
    fromNodeId,
    toNodeId,
    maximumDistanceMeters = Number.POSITIVE_INFINITY,
) {
    const distances = getReachableRoadNodeDistancesMeters(
        graph,
        fromNodeId,
        maximumDistanceMeters,
    );

    return distances.get(toNodeId) ?? null;
}

export function getReachableRoadNodeDistancesMeters(
    graph,
    fromNodeId,
    maximumDistanceMeters = Number.POSITIVE_INFINITY,
) {
    const distances = new Map();

    if (!graph?.nodesById?.has(fromNodeId)) {
        return distances;
    }

    distances.set(fromNodeId, 0);
    const queue = [{ distance: 0, nodeId: fromNodeId }];

    while (queue.length) {
        queue.sort((first, second) => first.distance - second.distance);

        const current = queue.shift();

        if (current.distance !== distances.get(current.nodeId)) {
            continue;
        }

        for (const edge of graph.outgoingEdgesByNodeId.get(current.nodeId) ??
            []) {
            const nextDistance = current.distance + edge.lengthMeters;

            if (
                nextDistance > maximumDistanceMeters ||
                nextDistance >=
                    (distances.get(edge.targetNodeId) ??
                        Number.POSITIVE_INFINITY)
            ) {
                continue;
            }

            distances.set(edge.targetNodeId, nextDistance);
            queue.push({
                distance: nextDistance,
                nodeId: edge.targetNodeId,
            });
        }
    }

    return distances;
}

export function getRoadTransitionDistanceMeters(
    graph,
    fromCandidate,
    toCandidate,
    maximumDistanceMeters = Number.POSITIVE_INFINITY,
    connectionDistanceCache = null,
) {
    const fromSegment = fromCandidate?.segment;
    const toSegment = toCandidate?.segment;

    if (!fromSegment || !toSegment) {
        return null;
    }

    if (
        fromSegment.id === toSegment.id &&
        toCandidate.fraction >= fromCandidate.fraction
    ) {
        return (
            (toCandidate.fraction - fromCandidate.fraction) *
            fromSegment.lengthMeters
        );
    }

    const distanceToFromSegmentEnd =
        (1 - fromCandidate.fraction) * fromSegment.lengthMeters;
    const distanceFromToSegmentStart =
        toCandidate.fraction * toSegment.lengthMeters;
    const remainingMaximumDistance =
        maximumDistanceMeters -
        distanceToFromSegmentEnd -
        distanceFromToSegmentStart;

    if (remainingMaximumDistance < 0) {
        return null;
    }

    const cachedDistances = connectionDistanceCache?.get(
        fromSegment.targetNodeId,
    );
    let reachableDistances = cachedDistances?.distances;

    if (
        !reachableDistances ||
        cachedDistances.maximumDistanceMeters < maximumDistanceMeters
    ) {
        reachableDistances = getReachableRoadNodeDistancesMeters(
            graph,
            fromSegment.targetNodeId,
            maximumDistanceMeters,
        );
        connectionDistanceCache?.set(fromSegment.targetNodeId, {
            distances: reachableDistances,
            maximumDistanceMeters,
        });
    }

    const connectionDistance =
        reachableDistances.get(toSegment.sourceNodeId) ?? null;
    const transitionDistance =
        connectionDistance === null
            ? null
            : distanceToFromSegmentEnd +
              connectionDistance +
              distanceFromToSegmentStart;

    return transitionDistance !== null &&
        transitionDistance <= maximumDistanceMeters
        ? transitionDistance
        : null;
}
