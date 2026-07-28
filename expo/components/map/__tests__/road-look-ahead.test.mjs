import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { predictRoadLookAhead } from '../road-look-ahead.js';
import { createRoadMatcher } from '../road-matching.js';
import {
    createRoadMatchingFixtureGraph,
    FIXTURE_EDGE_IDS,
    fixtureCoordinate,
    makeFixtureObservation,
} from './fixtures/road-matching-fixture.mjs';

function getPathEdgeIds(lookAhead) {
    return lookAhead.primaryPath.segments.map((segment) => segment.edgeId);
}

describe('route-less road look-ahead', () => {
    test('prefers straight continuity over the available branch without a route', () => {
        const graph = createRoadMatchingFixtureGraph();
        const matcher = createRoadMatcher(graph);
        const matchedLocation = matcher.update(
            makeFixtureObservation({ timestamp: 1000, x: 150, y: 0 }),
        );
        const lookAhead = predictRoadLookAhead({
            graph,
            matchedLocation,
            maximumDistanceMeters: 120,
        });
        const expectedLatitude = fixtureCoordinate(250, 0)[1];

        assert.deepEqual(getPathEdgeIds(lookAhead), [
            FIXTURE_EDGE_IDS.main1,
            FIXTURE_EDGE_IDS.main2,
        ]);
        assert.equal(lookAhead.source, 'road-look-ahead');
        assert.equal(lookAhead.updatedAt, 1000);
        assert.ok(lookAhead.primaryPath.probability > 0.5);
        lookAhead.primaryPath.coordinates.forEach((coordinate) => {
            assert.ok(Math.abs(coordinate[1] - expectedLatitude) < 1e-8);
        });
    });

    test('continues along the matched branch when travel history establishes that direction', () => {
        const graph = createRoadMatchingFixtureGraph();
        const matcher = createRoadMatcher(graph);
        const matchedLocation = matcher.update(
            makeFixtureObservation({
                bearing: 0,
                timestamp: 1000,
                x: 200,
                y: 50,
            }),
        );
        const lookAhead = predictRoadLookAhead({
            graph,
            matchedLocation,
            maximumDistanceMeters: 120,
        });

        assert.deepEqual(getPathEdgeIds(lookAhead), [
            FIXTURE_EDGE_IDS.branch0,
            FIXTURE_EDGE_IDS.branch1,
        ]);
    });

    test('returns no prediction without a matched directed edge', () => {
        assert.equal(
            predictRoadLookAhead({
                graph: createRoadMatchingFixtureGraph(),
                matchedLocation: {
                    roadMatch: { edgeId: null, isOffRoad: true },
                },
            }),
            null,
        );
    });
});
