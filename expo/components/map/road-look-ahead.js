import {
    getRoadHeadingDeltaDegrees,
    interpolateRoadCoordinate,
} from './road-graph.js';

const DEFAULT_OPTIONS = Object.freeze({
    beamWidth: 8,
    maximumDistanceMeters: 1000,
    maximumEdges: 24,
    // At a junction with one obviously straight continuation, follow it and
    // ignore the alternatives regardless of way names, priorities or speed
    // limits. Alerts on upcoming turns can be missed, but the forward horizon
    // stops depending on those near-tie factors. A continuation is obvious when
    // it bends at most the maximum delta and every other branch bends at least
    // the ambiguity margin further. Set the maximum delta to 0 to score every
    // branch instead.
    obviousForwardAmbiguityMarginDegrees: 30,
    obviousForwardMaximumHeadingDeltaDegrees: 30,
    // Score hysteresis for the previously predicted path. A competing path has
    // to beat the retained continuation by this much before the most-probable
    // path switches, which keeps upcoming alerts from flickering at near-tie
    // forks and while the horizon end sweeps across distant junctions.
    previousPathScoreMargin: 2,
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

function isLinkEdge(edge) {
    return (
        typeof edge?.roadClass === 'string' && edge.roadClass.endsWith('_link')
    );
}

function getObviousForwardEdge(previousEdge, edges, options) {
    if (
        edges.length < 2 ||
        !(options.obviousForwardMaximumHeadingDeltaDegrees > 0)
    ) {
        return null;
    }

    const rankedEdges = edges
        .map((edge) => ({
            edge,
            headingDelta:
                getRoadHeadingDeltaDegrees(
                    previousEdge.bearing,
                    edge.bearing,
                ) ?? 180,
        }))
        .sort((first, second) => first.headingDelta - second.headingDelta);
    const nearlyStraightEdges = rankedEdges.filter(
        (entry) =>
            entry.headingDelta <=
            options.obviousForwardMaximumHeadingDeltaDegrees,
    );

    if (!nearlyStraightEdges.length) {
        return null;
    }

    // Slip lanes and ramps only ever lead onto another road, so they are turns
    // even when they peel off at a shallow angle. Ignore them whenever a through
    // road is also nearly straight.
    const throughEdges = nearlyStraightEdges.some(
        (entry) => !isLinkEdge(entry.edge),
    )
        ? nearlyStraightEdges.filter((entry) => !isLinkEdge(entry.edge))
        : nearlyStraightEdges;
    const [straightest, runnerUp] = throughEdges;
    const nextBend =
        runnerUp ??
        rankedEdges.find(
            (entry) =>
                entry.headingDelta >
                options.obviousForwardMaximumHeadingDeltaDegrees,
        );

    if (
        nextBend &&
        nextBend.headingDelta - straightest.headingDelta <
            options.obviousForwardAmbiguityMarginDegrees
    ) {
        return null;
    }

    return straightest.edge;
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

function getPreviousPathEdgeIds(previousLookAhead) {
    const primaryPath = previousLookAhead?.primaryPath;
    const edgeIds = Array.isArray(primaryPath?.edgeIds)
        ? primaryPath.edgeIds
        : Array.isArray(primaryPath?.segments)
          ? primaryPath.segments.map((segment) => segment?.edgeId)
          : [];

    return edgeIds.filter(
        (edgeId) => typeof edgeId === 'string' && edgeId.length > 0,
    );
}

/**
 * Returns the edges the previous prediction expected after the matched edge, or
 * null when the vehicle is no longer on that prediction and nothing can be kept.
 */
function getExpectedContinuationEdgeIds(previousLookAhead, matchedEdgeId) {
    const previousEdgeIds = getPreviousPathEdgeIds(previousLookAhead);
    const matchedIndex = previousEdgeIds.indexOf(matchedEdgeId);

    return matchedIndex === -1 ? null : previousEdgeIds.slice(matchedIndex + 1);
}

function pathFollowsExpectedContinuation(path, edge, expectedEdgeIds) {
    if (!path.followsPreviousPath) {
        return false;
    }

    const expectedEdgeId = expectedEdgeIds?.[path.edgeIds.length - 1];

    return expectedEdgeId === undefined || expectedEdgeId === edge.id;
}

function appendEdgeToPath(
    path,
    edge,
    maximumDistanceMeters,
    score,
    expectedEdgeIds,
) {
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
        followsPreviousPath: pathFollowsExpectedContinuation(
            path,
            edge,
            expectedEdgeIds,
        ),
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

function keepBestPreviousPathCandidate(activePaths, expandedPaths) {
    if (activePaths.some((path) => path.followsPreviousPath)) {
        return activePaths;
    }

    const bestPreviousPathCandidate = expandedPaths.find(
        (path) => path.followsPreviousPath,
    );

    return bestPreviousPathCandidate
        ? [...activePaths, bestPreviousPathCandidate]
        : activePaths;
}

function selectPrimaryPath(completedPaths, options) {
    const bestPath = completedPaths[0];

    if (!bestPath || bestPath.followsPreviousPath) {
        return { primaryPath: bestPath, retainedPreviousPath: false };
    }

    const previousPathCandidate = completedPaths.find(
        (path) => path.followsPreviousPath,
    );

    if (
        !previousPathCandidate ||
        getCompletedPathScore(
            previousPathCandidate,
            options.maximumDistanceMeters,
        ) -
            getCompletedPathScore(bestPath, options.maximumDistanceMeters) >
            options.previousPathScoreMargin
    ) {
        return { primaryPath: bestPath, retainedPreviousPath: false };
    }

    return { primaryPath: previousPathCandidate, retainedPreviousPath: true };
}

export function predictRoadLookAhead({
    graph,
    matchedLocation,
    previousLookAhead = null,
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
    const expectedEdgeIds =
        options.previousPathScoreMargin > 0
            ? getExpectedContinuationEdgeIds(previousLookAhead, matchedEdge.id)
            : null;
    const initialPath = {
        coordinates: [matchedCoordinate, matchedEdgeEndCoordinate],
        distanceMeters: usedMatchedEdgeDistance,
        edgeIds: [matchedEdge.id],
        followsPreviousPath: expectedEdgeIds !== null,
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

            const obviousForwardEdge = getObviousForwardEdge(
                path.lastEdge,
                availableEdges,
                options,
            );
            const expandableEdges = obviousForwardEdge
                ? [obviousForwardEdge]
                : availableEdges;

            expandableEdges.forEach((edge) => {
                expandedPaths.push(
                    appendEdgeToPath(
                        path,
                        edge,
                        options.maximumDistanceMeters,
                        path.score +
                            getPathTransitionCost(path.lastEdge, edge, options),
                        expectedEdgeIds,
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
        // The retained continuation must survive pruning so the hysteresis
        // below can compare it against the best-scoring alternative.
        activePaths = keepBestPreviousPathCandidate(
            expandedPaths.slice(0, options.beamWidth),
            expandedPaths,
        );
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

    const { primaryPath, retainedPreviousPath } = selectPrimaryPath(
        completedPaths,
        options,
    );

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
            edgeIds: primaryPath.edgeIds,
            probability,
            segments: primaryPath.segments.map((segment) => ({
                ...segment,
                probability,
            })),
        },
        retainedPreviousPath,
        source: 'road-look-ahead',
        updatedAt: matchedLocation?.timestamp ?? Date.now(),
    };
}
