import { createRoadMatcher } from './road-matching.js';

export const ROAD_MATCHING_OBSERVATION_HISTORY_LIMIT = 12;
export const ROAD_MATCHING_OBSERVATION_REPLAY_LIMIT = 4;

function getBoundedObservationLimit(maximumObservations, fallback) {
    const parsedMaximum = Number(maximumObservations);

    return Number.isFinite(parsedMaximum)
        ? Math.max(1, Math.floor(parsedMaximum))
        : fallback;
}

export function appendRoadMatchingObservation(
    history,
    observation,
    maximumObservations = ROAD_MATCHING_OBSERVATION_HISTORY_LIMIT,
) {
    const limit = getBoundedObservationLimit(
        maximumObservations,
        ROAD_MATCHING_OBSERVATION_HISTORY_LIMIT,
    );
    const observations = Array.isArray(history) ? history.filter(Boolean) : [];

    if (observation) {
        observations.push(observation);
    }

    return observations.slice(-limit);
}

export function getRoadMatchingReplayObservations(
    observations,
    maximumObservations = ROAD_MATCHING_OBSERVATION_REPLAY_LIMIT,
) {
    const limit = getBoundedObservationLimit(
        maximumObservations,
        ROAD_MATCHING_OBSERVATION_REPLAY_LIMIT,
    );
    const replayObservations = [];

    for (
        let index = (Array.isArray(observations) ? observations.length : 0) - 1;
        index >= 0 && replayObservations.length < limit;
        index -= 1
    ) {
        if (observations[index]) {
            replayObservations.unshift(observations[index]);
        }
    }

    return replayObservations;
}

export function createRoadMatcherWithHistory(
    graph,
    observations,
    maximumReplayObservations = ROAD_MATCHING_OBSERVATION_REPLAY_LIMIT,
) {
    const matcher = createRoadMatcher(graph);

    for (const observation of getRoadMatchingReplayObservations(
        observations,
        maximumReplayObservations,
    )) {
        matcher.update(observation);
    }

    return matcher;
}
