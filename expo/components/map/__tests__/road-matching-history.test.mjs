import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createDirectedRoadGraph } from '../road-graph.js';
import {
    E2E_ROAD_MATCHING_LOCATIONS,
    getE2ERoadCoordinate,
    getE2ERoadCorridorWays,
} from '../road-matching-e2e-fixture.js';
import {
    appendRoadMatchingObservation,
    createRoadMatcherWithHistory,
} from '../road-matching-history.js';

function makeObservation(coordinate, timestamp) {
    return {
        accuracy: 5,
        latitude: coordinate[1],
        longitude: coordinate[0],
        timestamp,
    };
}

describe('road matcher observation history', () => {
    test('keeps a bounded copy without mutating the prior history', () => {
        const original = [{ timestamp: 1 }];
        const updated = appendRoadMatchingObservation(
            original,
            { timestamp: 2 },
            1,
        );

        assert.deepEqual(original, [{ timestamp: 1 }]);
        assert.deepEqual(updated, [{ timestamp: 2 }]);
    });

    test('preserves parallel-road continuity across a graph refresh', () => {
        const graph = createDirectedRoadGraph(getE2ERoadCorridorWays());
        const frontageObservations = [
            E2E_ROAD_MATCHING_LOCATIONS.parallelFrontage,
            getE2ERoadCoordinate(-300, 45),
            getE2ERoadCoordinate(-100, 45),
            getE2ERoadCoordinate(80, 45),
        ].map((coordinate, index) =>
            makeObservation(coordinate, index * 3000 + 1000),
        );
        const ambiguousObservation = makeObservation(
            E2E_ROAD_MATCHING_LOCATIONS.parallelRoadAmbiguous,
            13000,
        );
        const freshResult = createRoadMatcherWithHistory(graph, []).update(
            ambiguousObservation,
        );
        const replayedResult = createRoadMatcherWithHistory(
            graph,
            frontageObservations,
        ).update(ambiguousObservation);

        assert.equal(freshResult.roadMatch.edgeId, 'e2e-main-35:1:forward');
        assert.equal(freshResult.speedLimit.speedLimitMph, 35);
        assert.equal(replayedResult.roadMatch.edgeId, 'e2e-frontage:1:forward');
        assert.equal(replayedResult.speedLimit.speedLimitMph, 25);
    });
});
