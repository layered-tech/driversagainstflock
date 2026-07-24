import {
    getRoadCandidateProjections,
    getRoadCoordinateDistanceMeters,
    getRoadHeadingDeltaDegrees,
    getRoadTransitionDistanceMeters,
    normalizeRoadHeading,
} from './road-graph.js';

const DEFAULT_OPTIONS = Object.freeze({
    beamWidth: 8,
    headingSigmaDegrees: 35,
    hysteresisMargin: 1.5,
    maximumBackwardJitterMeters: 25,
    maximumAccuracyMeters: 50,
    maximumCandidates: 16,
    maximumSearchRadiusMeters: 100,
    maximumUTurnDisplacementMeters: 30,
    maximumUTurnHeadingDeltaDegrees: 45,
    minimumHeadingSpeedMps: 1.5,
    minimumBackwardJitterMeters: 5,
    minimumSearchRadiusMeters: 25,
    minimumSigmaMeters: 3,
    minimumUTurnHeadingChangeDegrees: 120,
    offRoadDistanceMeters: 35,
    teleportDistanceMeters: 250,
    teleportTimeGapMs: 20000,
    uTurnPenalty: 2,
    wayChangePenalty: 0.8,
});

function getFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function normalizeObservation(value) {
    const latitude = getFiniteNumber(
        value?.latitude ?? value?.coords?.latitude,
    );
    const longitude = getFiniteNumber(
        value?.longitude ?? value?.coords?.longitude,
    );

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null;
    }

    const speed = getFiniteNumber(value?.speed ?? value?.coords?.speed);
    const rawBearing = getFiniteNumber(
        value?.bearing ??
            value?.heading ??
            value?.course ??
            value?.coords?.heading ??
            value?.coords?.course,
    );
    const bearing =
        rawBearing !== null && rawBearing >= 0
            ? normalizeRoadHeading(rawBearing)
            : null;

    return {
        accuracy:
            getFiniteNumber(
                value?.accuracy ??
                    value?.horizontalAccuracy ??
                    value?.coords?.accuracy,
            ) ?? 10,
        altitude:
            getFiniteNumber(value?.altitude ?? value?.coords?.altitude) ??
            undefined,
        bearing,
        coordinate: [longitude, latitude],
        speed: speed !== null && speed >= 0 ? speed : undefined,
        timestamp: getFiniteNumber(value?.timestamp) ?? Date.now(),
    };
}

function getEmissionCost(observation, candidate, options) {
    const sigmaMeters = clamp(
        observation.accuracy,
        options.minimumSigmaMeters,
        options.maximumAccuracyMeters,
    );
    const normalizedDistance = candidate.distanceMeters / sigmaMeters;
    let cost = normalizedDistance ** 2 / 2;

    if (
        observation.bearing !== null &&
        Number.isFinite(observation.speed) &&
        observation.speed >= options.minimumHeadingSpeedMps
    ) {
        const headingDelta = getRoadHeadingDeltaDegrees(
            observation.bearing,
            candidate.segment.bearing,
        );

        if (headingDelta !== null) {
            cost += (headingDelta / options.headingSigmaDegrees) ** 2 / 2;
        }
    }

    return cost - Math.min(0.5, candidate.segment.priority * 0.05);
}

function getTransitionCost({
    candidate,
    graph,
    observation,
    options,
    previousCandidate,
    previousObservation,
    transitionDistanceCache,
}) {
    const observedDistance = getRoadCoordinateDistanceMeters(
        previousObservation.coordinate,
        observation.coordinate,
    );

    if (observedDistance === null) {
        return null;
    }

    const elapsedSeconds = Math.max(
        0,
        (observation.timestamp - previousObservation.timestamp) / 1000,
    );
    const maximumTravelDistance = Math.max(
        120,
        observedDistance * 4 + 50,
        elapsedSeconds * 70 + observation.accuracy * 3,
    );
    const sameEdgeBackwardDistance =
        previousCandidate.segment.id === candidate.segment.id &&
        candidate.fraction < previousCandidate.fraction
            ? (previousCandidate.fraction - candidate.fraction) *
              candidate.segment.lengthMeters
            : null;
    const backwardJitterTolerance = Math.min(
        options.maximumBackwardJitterMeters,
        Math.max(
            options.minimumBackwardJitterMeters,
            Math.max(previousObservation.accuracy, observation.accuracy) * 2,
        ),
    );
    const candidateHeadingDelta = getRoadHeadingDeltaDegrees(
        observation.bearing,
        candidate.segment.bearing,
    );
    const previousHeadingDelta = getRoadHeadingDeltaDegrees(
        observation.bearing,
        previousCandidate.segment.bearing,
    );
    const oppositeSegmentDisplacement =
        previousCandidate.segment.wayId === candidate.segment.wayId &&
        previousCandidate.segment.index === candidate.segment.index &&
        previousCandidate.segment.sourceNodeId ===
            candidate.segment.targetNodeId &&
        previousCandidate.segment.targetNodeId ===
            candidate.segment.sourceNodeId
            ? getRoadCoordinateDistanceMeters(
                  previousCandidate.coordinate,
                  candidate.coordinate,
              )
            : null;
    const isEvidenceBackedUTurn = Boolean(
        oppositeSegmentDisplacement !== null &&
        oppositeSegmentDisplacement <= options.maximumUTurnDisplacementMeters &&
        Number.isFinite(observation.speed) &&
        observation.speed >= options.minimumHeadingSpeedMps &&
        candidateHeadingDelta !== null &&
        candidateHeadingDelta <= options.maximumUTurnHeadingDeltaDegrees &&
        previousHeadingDelta !== null &&
        previousHeadingDelta >= options.minimumUTurnHeadingChangeDegrees,
    );
    const networkDistance = isEvidenceBackedUTurn
        ? oppositeSegmentDisplacement
        : sameEdgeBackwardDistance !== null &&
            sameEdgeBackwardDistance <= backwardJitterTolerance
          ? 0
          : getRoadTransitionDistanceMeters(
                graph,
                previousCandidate,
                candidate,
                maximumTravelDistance,
                transitionDistanceCache,
            );

    if (networkDistance === null) {
        return null;
    }

    const transitionTolerance = Math.max(
        10,
        observation.accuracy * 2,
        observedDistance * 0.4,
    );
    let cost =
        Math.abs(networkDistance - observedDistance) / transitionTolerance;

    if (isEvidenceBackedUTurn) {
        cost += options.uTurnPenalty;
    }

    const observedSpeeds = [
        previousObservation.speed,
        observation.speed,
    ].filter(Number.isFinite);

    if (elapsedSeconds > 0 && observedSpeeds.length) {
        const expectedDistance =
            (observedSpeeds.reduce((sum, speed) => sum + speed, 0) /
                observedSpeeds.length) *
            elapsedSeconds;
        const speedTolerance = Math.max(15, expectedDistance * 0.5);

        cost += Math.abs(networkDistance - expectedDistance) / speedTolerance;
    }

    if (previousCandidate.segment.wayId !== candidate.segment.wayId) {
        cost += options.wayChangePenalty;
    }

    return cost;
}

function getSearchRadius(observation, options) {
    return clamp(
        Math.max(observation.accuracy, 1) * 3,
        options.minimumSearchRadiusMeters,
        options.maximumSearchRadiusMeters,
    );
}

function getOffRoadDistanceThreshold(observation, options) {
    return Math.max(
        options.offRoadDistanceMeters,
        Math.min(options.maximumAccuracyMeters, observation.accuracy) * 2,
    );
}

function getCandidateStates({
    candidates,
    graph,
    observation,
    options,
    previousObservation,
    previousStates,
    resetsPath,
}) {
    const states = [];
    const transitionDistanceCache = new Map();

    for (const candidate of candidates) {
        const emissionCost = getEmissionCost(observation, candidate, options);

        if (!previousStates.length || resetsPath) {
            states.push({ candidate, score: emissionCost });
            continue;
        }

        let bestPreviousState = null;
        let bestTransitionCost = Number.POSITIVE_INFINITY;

        for (const previousState of previousStates) {
            const transitionCost = getTransitionCost({
                candidate,
                graph,
                observation,
                options,
                previousCandidate: previousState.candidate,
                previousObservation,
                transitionDistanceCache,
            });

            if (
                transitionCost !== null &&
                previousState.score + transitionCost < bestTransitionCost
            ) {
                bestPreviousState = previousState;
                bestTransitionCost = previousState.score + transitionCost;
            }
        }

        if (bestPreviousState) {
            states.push({
                candidate,
                previousEdgeId: bestPreviousState.candidate.segment.id,
                score: bestTransitionCost + emissionCost,
            });
        }
    }

    states.sort((first, second) => first.score - second.score);

    const limitedStates = states.slice(0, options.beamWidth);
    const minimumScore = limitedStates[0]?.score ?? 0;

    return limitedStates.map((state) => ({
        ...state,
        score: state.score - minimumScore,
    }));
}

function selectMatchedState(states, observation, previousResult, options) {
    const bestState = states[0];
    const previousEdgeId = previousResult?.roadMatch?.edgeId;
    const previousWayId = previousResult?.roadMatch?.wayId;

    if (!bestState || !previousWayId) {
        return bestState;
    }

    if (
        previousEdgeId &&
        (observation.speed === undefined ||
            observation.speed < options.minimumHeadingSpeedMps)
    ) {
        const retainedEdgeState = states.find(
            (state) => state.candidate.segment.id === previousEdgeId,
        );

        if (
            retainedEdgeState &&
            retainedEdgeState.score <=
                bestState.score + options.hysteresisMargin
        ) {
            return retainedEdgeState;
        }
    }

    if (bestState.candidate.segment.wayId === previousWayId) {
        return bestState;
    }

    const retainedWayState = states.find(
        (state) => state.candidate.segment.wayId === previousWayId,
    );

    return retainedWayState &&
        retainedWayState.score <= bestState.score + options.hysteresisMargin
        ? retainedWayState
        : bestState;
}

function getStateConfidence(states, selectedState) {
    if (!selectedState) {
        return 0;
    }

    const weights = states.map((state) => Math.exp(-Math.min(50, state.score)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const selectedIndex = states.indexOf(selectedState);

    return totalWeight > 0 ? weights[selectedIndex] / totalWeight : 0;
}

function makeOffRoadResult(observation, isTeleport = false) {
    return {
        accuracy: observation.accuracy,
        altitude: observation.altitude,
        bearing: observation.bearing ?? undefined,
        latitude: observation.coordinate[1],
        locationProvider: 'road-matcher',
        longitude: observation.coordinate[0],
        roadMatch: {
            confidence: 0,
            edgeId: null,
            edgeMatchProbability: 0,
            isOffRoad: true,
            isTeleport,
            offRoadProbability: 1,
            wayId: null,
        },
        speed: observation.speed,
        speedLimit: null,
        timestamp: observation.timestamp,
    };
}

function makeMatchedResult({
    isTeleport,
    observation,
    selectedState,
    states,
    offRoadDistanceThreshold,
}) {
    const candidate = selectedState.candidate;
    const segment = candidate.segment;
    const edgeMatchProbability = getStateConfidence(states, selectedState);
    const offRoadProbability = clamp(
        candidate.distanceMeters / offRoadDistanceThreshold,
        0,
        1,
    );

    return {
        accuracy: observation.accuracy,
        altitude: observation.altitude,
        bearing: segment.bearing,
        latitude: candidate.coordinate[1],
        locationProvider: 'road-matcher',
        longitude: candidate.coordinate[0],
        roadMatch: {
            coordinate: candidate.coordinate,
            confidence: edgeMatchProbability,
            distanceFromObservationMeters: candidate.distanceMeters,
            edgeId: segment.id,
            edgeMatchProbability,
            fraction: candidate.fraction,
            isOffRoad: false,
            isTeleport,
            layer: segment.layer,
            osmWayId: segment.osmWayId,
            offRoadProbability,
            previousEdgeId: selectedState.previousEdgeId ?? null,
            roadClass: segment.roadClass,
            roadName: segment.roadName,
            sourceNodeId: segment.sourceNodeId,
            targetNodeId: segment.targetNodeId,
            tunnel: segment.tunnel,
            wayId: segment.wayId,
        },
        speed: observation.speed,
        speedLimit: segment.speedLimit,
        timestamp: observation.timestamp,
    };
}

export function createRoadMatcher(graph, configuredOptions = {}) {
    const options = Object.freeze({
        ...DEFAULT_OPTIONS,
        ...configuredOptions,
    });
    let lastMatchedResult = null;
    let previousObservation = null;
    let previousStates = [];

    function reset() {
        lastMatchedResult = null;
        previousObservation = null;
        previousStates = [];
    }

    function update(value) {
        const observation = normalizeObservation(value);

        if (!observation) {
            return null;
        }

        const distanceFromPreviousObservation = previousObservation
            ? getRoadCoordinateDistanceMeters(
                  previousObservation.coordinate,
                  observation.coordinate,
              )
            : null;
        const timeFromPreviousObservation = previousObservation
            ? observation.timestamp - previousObservation.timestamp
            : 0;
        const resetsPath = Boolean(
            previousObservation &&
            ((distanceFromPreviousObservation ?? 0) >=
                options.teleportDistanceMeters ||
                timeFromPreviousObservation >= options.teleportTimeGapMs ||
                timeFromPreviousObservation < 0),
        );
        const candidates = getRoadCandidateProjections(
            graph,
            observation.coordinate,
            getSearchRadius(observation, options),
        ).slice(0, options.maximumCandidates);
        const offRoadDistanceThreshold = getOffRoadDistanceThreshold(
            observation,
            options,
        );

        if (
            !candidates.length ||
            candidates[0].distanceMeters > offRoadDistanceThreshold
        ) {
            const result = makeOffRoadResult(observation, resetsPath);

            if (resetsPath) {
                previousStates = [];
                previousObservation = observation;
            }

            return result;
        }

        const states = getCandidateStates({
            candidates,
            graph,
            observation,
            options,
            previousObservation,
            previousStates,
            resetsPath,
        });

        if (!states.length) {
            return makeOffRoadResult(observation);
        }

        const selectedState = selectMatchedState(
            states,
            observation,
            lastMatchedResult,
            options,
        );
        const result = makeMatchedResult({
            isTeleport: Boolean(resetsPath && lastMatchedResult),
            observation,
            offRoadDistanceThreshold,
            selectedState,
            states,
        });

        lastMatchedResult = result;
        previousObservation = observation;
        previousStates = states;

        return result;
    }

    return Object.freeze({
        getLastResult: () => lastMatchedResult,
        reset,
        update,
    });
}
