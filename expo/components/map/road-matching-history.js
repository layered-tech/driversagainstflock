import { createRoadMatcher } from './road-matching.js';

export const ROAD_MATCHING_OBSERVATION_HISTORY_LIMIT = 12;

export function appendRoadMatchingObservation(
    history,
    observation,
    maximumObservations = ROAD_MATCHING_OBSERVATION_HISTORY_LIMIT,
) {
    const parsedMaximum = Number(maximumObservations);
    const limit = Number.isFinite(parsedMaximum)
        ? Math.max(1, Math.floor(parsedMaximum))
        : ROAD_MATCHING_OBSERVATION_HISTORY_LIMIT;
    const observations = Array.isArray(history) ? history.filter(Boolean) : [];

    if (observation) {
        observations.push(observation);
    }

    return observations.slice(-limit);
}

export function createRoadMatcherWithHistory(graph, observations) {
    const matcher = createRoadMatcher(graph);

    for (const observation of Array.isArray(observations) ? observations : []) {
        matcher.update(observation);
    }

    return matcher;
}
