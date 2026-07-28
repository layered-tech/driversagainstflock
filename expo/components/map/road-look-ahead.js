import {
    getRoadHeadingDeltaDegrees,
    interpolateRoadCoordinate,
} from './road-graph.js';

const DEFAULT_OPTIONS = Object.freeze({
    beamWidth: 8,
    maximumDistanceMeters: 1000,
    maximumEdges: 24,
    sameWayBonus: 1.25,
    turnPenaltyFactor: 2,
});

function getPathTransitionCost(previousEdge, nextEdge, options) {
    const headingDelta =
        getRoadHeadingDeltaDegrees(previousEdge.bearing, nextEdge.bearing) ??
        180;
    let cost =
        (headingDelta / 45) ** 2 * options.turnPenaltyFactor -
        Math.min(0.5, nextEdge.priority * 0.05);

    if (previousEdge.wayId === nextEdge.wayId) {
        cost -= options.sameWayBonus;
    }

    if (
        nextEdge.targetNodeId === previousEdge.sourceNodeId &&
        headingDelta >= 150
    ) {
        cost += 20;
    }

    if (previousEdge.speedLimit && nextEdge.speedLimit) {
        cost +=
            Math.abs(
                previousEdge.speedLimit.speedLimitMph -
                    nextEdge.speedLimit.speedLimitMph,
            ) / 50;
    }

    return cost;
}

function appendCoordinate(coordinates, coordinate) {
    const previousCoordinate = coordinates.at(-1);

    if (
        !previousCoordinate ||
        previousCoordinate[0] !== coordinate[0] ||
        previousCoordinate[1] !== coordinate[1]
    ) {
        coordinates.push(coordinate);
    }
}

function appendEdgeToPath(path, edge, maximumDistanceMeters, score) {
    const remainingDistance = maximumDistanceMeters - path.distanceMeters;
    const usedDistance = Math.min(edge.lengthMeters, remainingDistance);
    const endFraction = usedDistance / edge.lengthMeters;
    const endCoordinate =
        endFraction >= 1
            ? edge.end
            : interpolateRoadCoordinate(edge.start, edge.end, endFraction);
    const coordinates = [...path.coordinates];

    appendCoordinate(coordinates, edge.start);
    appendCoordinate(coordinates, endCoordinate);

    return {
        coordinates,
        distanceMeters: path.distanceMeters + usedDistance,
        edgeIds: [...path.edgeIds, edge.id],
        lastEdge: edge,
        score,
        segments: [
            ...path.segments,
            {
                coordinates: [edge.start, endCoordinate],
                edgeId: edge.id,
                level: 0,
            },
        ],
        visitedEdgeIds: new Set([...path.visitedEdgeIds, edge.id]),
    };
}

function getCompletedPathScore(path, maximumDistanceMeters) {
    const shortfallMeters = Math.max(
        0,
        maximumDistanceMeters - path.distanceMeters,
    );

    return path.score + shortfallMeters / 100;
}

function getPathProbability(paths, selectedPath, maximumDistanceMeters) {
    const scores = paths.map((path) =>
        getCompletedPathScore(path, maximumDistanceMeters),
    );
    const minimumScore = Math.min(...scores);
    const weights = scores.map((score) =>
        Math.exp(-Math.min(50, score - minimumScore)),
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const selectedIndex = paths.indexOf(selectedPath);

    return totalWeight > 0 ? weights[selectedIndex] / totalWeight : 0;
}

export function predictRoadLookAhead({
    graph,
    matchedLocation,
    ...configuredOptions
}) {
    const options = {
        ...DEFAULT_OPTIONS,
        ...configuredOptions,
    };
    const roadMatch = matchedLocation?.roadMatch ?? matchedLocation;
    const matchedEdge = graph?.edgesById?.get(roadMatch?.edgeId);
    const matchedFraction = Number(roadMatch?.fraction);

    if (!matchedEdge || !Number.isFinite(matchedFraction)) {
        return null;
    }

    const clampedFraction = Math.min(1, Math.max(0, matchedFraction));
    const matchedCoordinate =
        roadMatch?.coordinate ??
        interpolateRoadCoordinate(
            matchedEdge.start,
            matchedEdge.end,
            clampedFraction,
        );
    const remainingMatchedEdgeDistance =
        (1 - clampedFraction) * matchedEdge.lengthMeters;
    const usedMatchedEdgeDistance = Math.min(
        remainingMatchedEdgeDistance,
        options.maximumDistanceMeters,
    );
    const matchedEdgeEndFraction =
        clampedFraction + usedMatchedEdgeDistance / matchedEdge.lengthMeters;
    const matchedEdgeEndCoordinate =
        matchedEdgeEndFraction >= 1
            ? matchedEdge.end
            : interpolateRoadCoordinate(
                  matchedEdge.start,
                  matchedEdge.end,
                  matchedEdgeEndFraction,
              );
    const initialPath = {
        coordinates: [matchedCoordinate, matchedEdgeEndCoordinate],
        distanceMeters: usedMatchedEdgeDistance,
        edgeIds: [matchedEdge.id],
        lastEdge: matchedEdge,
        score: 0,
        segments: [
            {
                coordinates: [matchedCoordinate, matchedEdgeEndCoordinate],
                edgeId: matchedEdge.id,
                level: 0,
            },
        ],
        visitedEdgeIds: new Set([matchedEdge.id]),
    };
    let activePaths = [initialPath];
    const completedPaths = [];

    for (let depth = 1; depth < options.maximumEdges; depth += 1) {
        const expandedPaths = [];

        for (const path of activePaths) {
            if (path.distanceMeters >= options.maximumDistanceMeters) {
                completedPaths.push(path);
                continue;
            }

            const outgoingEdges =
                graph.outgoingEdgesByNodeId.get(path.lastEdge.targetNodeId) ??
                [];
            const availableEdges = outgoingEdges.filter(
                (edge) => !path.visitedEdgeIds.has(edge.id),
            );

            if (!availableEdges.length) {
                completedPaths.push(path);
                continue;
            }

            availableEdges.forEach((edge) => {
                expandedPaths.push(
                    appendEdgeToPath(
                        path,
                        edge,
                        options.maximumDistanceMeters,
                        path.score +
                            getPathTransitionCost(path.lastEdge, edge, options),
                    ),
                );
            });
        }

        if (!expandedPaths.length) {
            break;
        }

        expandedPaths.sort(
            (first, second) =>
                getCompletedPathScore(first, options.maximumDistanceMeters) -
                getCompletedPathScore(second, options.maximumDistanceMeters),
        );
        activePaths = expandedPaths.slice(0, options.beamWidth);
    }

    activePaths.forEach((path) => {
        if (!completedPaths.includes(path)) {
            completedPaths.push(path);
        }
    });
    completedPaths.sort(
        (first, second) =>
            getCompletedPathScore(first, options.maximumDistanceMeters) -
            getCompletedPathScore(second, options.maximumDistanceMeters),
    );

    const primaryPath = completedPaths[0];

    if (!primaryPath || primaryPath.coordinates.length < 2) {
        return null;
    }

    const probability = getPathProbability(
        completedPaths,
        primaryPath,
        options.maximumDistanceMeters,
    );

    return {
        primaryPath: {
            coordinates: primaryPath.coordinates,
            probability,
            segments: primaryPath.segments.map((segment) => ({
                ...segment,
                probability,
            })),
        },
        source: 'road-look-ahead',
        updatedAt: matchedLocation?.timestamp ?? Date.now(),
    };
}
