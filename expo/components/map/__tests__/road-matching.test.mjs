import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createDirectedRoadGraph,
    getRoadCandidateProjections,
    getRoadTransitionDistanceMeters,
} from '../road-graph.js';
import { createRoadMatcher } from '../road-matching.js';
import {
    createRoadMatchingFixtureGraph,
    FIXTURE_EDGE_IDS,
    fixtureCoordinate,
    makeFixtureObservation,
} from './fixtures/road-matching-fixture.mjs';

function findCandidate(graph, coordinate, edgeId) {
    return getRoadCandidateProjections(graph, coordinate, 40).find(
        (candidate) => candidate.segment.id === edgeId,
    );
}

function assertApproximately(actual, expected, tolerance) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} is not within ${tolerance} of ${expected}`,
    );
}

describe('directed road graph', () => {
    test('assigns direction-specific speed limits to two-way edges', () => {
        const graph = createDirectedRoadGraph([
            {
                coordinates: [
                    fixtureCoordinate(0, -75),
                    fixtureCoordinate(100, -75),
                ],
                id: 'directional-speed',
                nodeIds: ['directional-west', 'directional-east'],
                speedLimit: { speed: 30, unit: 'mph' },
                speedLimits: {
                    backward: { speed: 25, unit: 'mph' },
                    forward: { speed: 40, unit: 'mph' },
                },
            },
        ]);

        assert.equal(
            graph.edgesById.get('directional-speed:0:forward').speedLimit
                .speedLimitMph,
            40,
        );
        assert.equal(
            graph.edgesById.get('directional-speed:0:backward').speedLimit
                .speedLimitMph,
            25,
        );
    });

    test('models one-way segments and rejects the reverse parallel-road transition', () => {
        const graph = createRoadMatchingFixtureGraph();
        const mainCandidate = findCandidate(
            graph,
            fixtureCoordinate(80, 0),
            FIXTURE_EDGE_IDS.main0,
        );
        const frontageCandidate = findCandidate(
            graph,
            fixtureCoordinate(80, 12),
            FIXTURE_EDGE_IDS.frontage0,
        );

        assert.equal(graph.edges.length, 10);
        assert.ok(mainCandidate);
        assert.ok(frontageCandidate);
        assert.equal(
            getRoadTransitionDistanceMeters(
                graph,
                frontageCandidate,
                mainCandidate,
            ),
            null,
        );
    });

    test('allows the forward main-to-frontage transition through the connector', () => {
        const graph = createRoadMatchingFixtureGraph();
        const mainCandidate = findCandidate(
            graph,
            fixtureCoordinate(90, 0),
            FIXTURE_EDGE_IDS.main0,
        );
        const frontageCandidate = findCandidate(
            graph,
            fixtureCoordinate(220, 12),
            FIXTURE_EDGE_IDS.frontage2,
        );
        const transitionDistance = getRoadTransitionDistanceMeters(
            graph,
            mainCandidate,
            frontageCandidate,
        );

        assert.ok(transitionDistance > 125);
        assert.ok(transitionDistance < 135);
    });
});

describe('stateful road matcher', () => {
    test('ignores unavailable headings and headings without usable speed', () => {
        const graph = createDirectedRoadGraph([
            {
                coordinates: [
                    fixtureCoordinate(-100, 0),
                    fixtureCoordinate(100, 0),
                ],
                id: 'eastbound',
                nodeIds: ['eastbound-west', 'eastbound-east'],
                oneWay: true,
            },
            {
                coordinates: [
                    fixtureCoordinate(0, -100),
                    fixtureCoordinate(0, 100),
                ],
                id: 'northbound',
                nodeIds: ['northbound-south', 'northbound-north'],
                oneWay: true,
            },
        ]);
        const [longitude, latitude] = fixtureCoordinate(0, 0);

        for (const unavailableMotion of [
            { heading: -1, speed: -1 },
            { heading: 0, speed: undefined },
        ]) {
            const result = createRoadMatcher(graph).update({
                accuracy: 3,
                latitude,
                longitude,
                timestamp: 1000,
                ...unavailableMotion,
            });

            assert.equal(result.roadMatch.edgeId, 'eastbound:0:forward');
        }

        const validHeadingResult = createRoadMatcher(graph).update({
            accuracy: 3,
            heading: 359,
            latitude,
            longitude,
            speed: 5,
            timestamp: 1000,
        });

        assert.equal(
            validHeadingResult.roadMatch.edgeId,
            'northbound:0:forward',
        );
    });

    test('uses observation heading to select the correct directed edge', () => {
        const graph = createDirectedRoadGraph([
            {
                coordinates: [
                    fixtureCoordinate(0, -50),
                    fixtureCoordinate(100, -50),
                ],
                id: 'two-way',
                name: 'Two Way Road',
                nodeIds: ['two-way-west', 'two-way-east'],
                speedLimit: { speed: 30, unit: 'mph' },
            },
        ]);
        const matcher = createRoadMatcher(graph);
        const result = matcher.update(
            makeFixtureObservation({ bearing: 270, x: 50, y: -50 }),
        );

        assert.equal(result.roadMatch.edgeId, 'two-way:0:backward');
        assert.ok(result.roadMatch.confidence > 0.99);
    });

    test('snaps noisy fixes to the directed main-road segments', () => {
        const graph = createRoadMatchingFixtureGraph();
        const matcher = createRoadMatcher(graph);

        matcher.update(
            makeFixtureObservation({ timestamp: 1000, x: 20, y: 3 }),
        );
        matcher.update(
            makeFixtureObservation({ timestamp: 3000, x: 45, y: 4 }),
        );
        const result = matcher.update(
            makeFixtureObservation({ timestamp: 5000, x: 75, y: 3 }),
        );
        const expectedLatitude = fixtureCoordinate(75, 0)[1];

        assert.equal(result.locationProvider, 'road-matcher');
        assert.equal(result.roadMatch.edgeId, FIXTURE_EDGE_IDS.main0);
        assert.equal(result.roadMatch.wayId, 'main');
        assert.equal(result.roadMatch.isOffRoad, false);
        assert.equal(result.roadMatch.isTeleport, false);
        assert.equal(result.roadMatch.layer, 1);
        assert.equal(result.roadMatch.osmWayId, '1001');
        assert.ok(result.roadMatch.edgeMatchProbability > 0);
        assert.equal(result.roadMatch.roadClass, 'primary');
        assert.equal(result.roadMatch.tunnel, true);
        assert.equal(
            result.roadMatch.confidence,
            result.roadMatch.edgeMatchProbability,
        );
        assertApproximately(result.latitude, expectedLatitude, 1e-8);
        assertApproximately(
            result.roadMatch.distanceFromObservationMeters,
            3,
            0.2,
        );
        assert.equal(result.speedLimit.speedLimitMph, 35);
    });

    test('keeps bounded backward GPS jitter on a one-way edge', () => {
        const graph = createDirectedRoadGraph([
            {
                coordinates: [
                    fixtureCoordinate(0, 0),
                    fixtureCoordinate(333, 0),
                ],
                id: 'one-way-jitter',
                nodeIds: ['jitter-west', 'jitter-east'],
                oneWay: true,
                speedLimit: { speed: 35, unit: 'mph' },
            },
        ]);
        const matcher = createRoadMatcher(graph);

        matcher.update(
            makeFixtureObservation({
                speed: 0,
                timestamp: 1000,
                x: 166.5,
                y: 1,
            }),
        );
        const jitterResult = matcher.update(
            makeFixtureObservation({
                speed: 0,
                timestamp: 2000,
                x: 165.5,
                y: 1,
            }),
        );
        const largeRegressionResult = matcher.update(
            makeFixtureObservation({
                speed: 0,
                timestamp: 3000,
                x: 83.25,
                y: 1,
            }),
        );

        assert.equal(jitterResult.roadMatch.edgeId, 'one-way-jitter:0:forward');
        assert.equal(jitterResult.roadMatch.isOffRoad, false);
        assert.equal(jitterResult.speedLimit.speedLimitMph, 35);
        assert.equal(largeRegressionResult.roadMatch.isOffRoad, true);
    });

    test('keeps a stationary two-way trace on one directed speed limit', () => {
        const graph = createDirectedRoadGraph([
            {
                coordinates: [
                    fixtureCoordinate(0, 0),
                    fixtureCoordinate(333, 0),
                ],
                id: 'two-way-jitter',
                nodeIds: ['two-way-jitter-west', 'two-way-jitter-east'],
                speedLimits: {
                    backward: { speed: 25, unit: 'mph' },
                    forward: { speed: 40, unit: 'mph' },
                },
            },
        ]);
        const matcher = createRoadMatcher(graph);
        const results = [166.5, 165.5, 166.5].map((x, index) =>
            matcher.update(
                makeFixtureObservation({
                    bearing: -1,
                    speed: 0,
                    timestamp: index * 1000 + 1000,
                    x,
                    y: 1,
                }),
            ),
        );

        assert.deepEqual(
            results.map((result) => result.roadMatch.edgeId),
            [
                'two-way-jitter:0:forward',
                'two-way-jitter:0:forward',
                'two-way-jitter:0:forward',
            ],
        );
        assert.deepEqual(
            results.map((result) => result.speedLimit.speedLimitMph),
            [40, 40, 40],
        );
        results.forEach((result) => assertApproximately(result.bearing, 90, 1));

        const movingMatcher = createRoadMatcher(graph);

        const movingResults = [
            { bearing: 90, x: 100 },
            { bearing: 90, x: 120 },
            { bearing: 90, x: 140 },
            { bearing: 270, x: 139 },
            { bearing: 270, x: 130 },
            { bearing: 270, x: 110 },
        ].map(({ bearing, x }, index) =>
            movingMatcher.update(
                makeFixtureObservation({
                    bearing,
                    speed: 10,
                    timestamp: index * 2000 + 1000,
                    x,
                    y: 1,
                }),
            ),
        );

        assert.deepEqual(
            movingResults.map((result) => result.roadMatch.edgeId),
            [
                'two-way-jitter:0:forward',
                'two-way-jitter:0:forward',
                'two-way-jitter:0:forward',
                'two-way-jitter:0:backward',
                'two-way-jitter:0:backward',
                'two-way-jitter:0:backward',
            ],
        );
        assert.deepEqual(
            movingResults.map((result) => result.speedLimit.speedLimitMph),
            [40, 40, 40, 25, 25, 25],
        );
        movingResults
            .slice(3)
            .forEach((result) => assertApproximately(result.bearing, 270, 1));
    });

    test('uses retained hypotheses and hysteresis instead of oscillating between parallel roads', () => {
        const matcher = createRoadMatcher(createRoadMatchingFixtureGraph());
        const results = [
            matcher.update(
                makeFixtureObservation({ timestamp: 1000, x: 25, y: 2 }),
            ),
            matcher.update(
                makeFixtureObservation({ timestamp: 3000, x: 55, y: 7 }),
            ),
            matcher.update(
                makeFixtureObservation({ timestamp: 5000, x: 85, y: 5.5 }),
            ),
        ];

        assert.deepEqual(
            results.map((result) => result.roadMatch.wayId),
            ['main', 'main', 'main'],
        );
    });

    test('does not jump across an illegal one-way transition', () => {
        const matcher = createRoadMatcher(createRoadMatchingFixtureGraph());

        matcher.update(
            makeFixtureObservation({ timestamp: 1000, x: 20, y: 12 }),
        );
        matcher.update(
            makeFixtureObservation({ timestamp: 3000, x: 50, y: 12 }),
        );
        const result = matcher.update(
            makeFixtureObservation({ timestamp: 5000, x: 80, y: 0 }),
        );

        assert.equal(result.roadMatch.wayId, 'frontage');
        assert.equal(result.roadMatch.edgeId, FIXTURE_EDGE_IDS.frontage0);
    });

    test('takes the legal connector and receives the next edge speed limit', () => {
        const matcher = createRoadMatcher(createRoadMatchingFixtureGraph());

        matcher.update(
            makeFixtureObservation({ timestamp: 1000, x: 70, y: 0 }),
        );
        matcher.update(
            makeFixtureObservation({ timestamp: 3000, x: 95, y: 0 }),
        );
        matcher.update(
            makeFixtureObservation({ timestamp: 5000, x: 130, y: 3.6 }),
        );
        const connectorResult = matcher.update(
            makeFixtureObservation({ timestamp: 7000, x: 170, y: 8.4 }),
        );
        const frontageResult = matcher.update(
            makeFixtureObservation({ timestamp: 9000, x: 220, y: 12 }),
        );

        assert.equal(
            connectorResult.roadMatch.edgeId,
            FIXTURE_EDGE_IDS.connector,
        );
        assert.equal(
            frontageResult.roadMatch.edgeId,
            FIXTURE_EDGE_IDS.frontage2,
        );
        assert.equal(frontageResult.speedLimit.speedLimitMph, 45);
        assert.equal(frontageResult.speedLimit.unit, 'mph');
    });

    test('returns the raw fix as explicitly off-road instead of forcing a snap', () => {
        const matcher = createRoadMatcher(createRoadMatchingFixtureGraph());
        const observation = makeFixtureObservation({ x: 50, y: 150 });
        const result = matcher.update(observation);

        assert.equal(result.latitude, observation.latitude);
        assert.equal(result.longitude, observation.longitude);
        assert.equal(result.roadMatch.edgeId, null);
        assert.equal(result.roadMatch.edgeMatchProbability, 0);
        assert.equal(result.roadMatch.isOffRoad, true);
        assert.equal(result.roadMatch.offRoadProbability, 1);
        assert.equal(result.speedLimit, null);
    });

    test('resets after a distant fix and marks the resulting road change as a teleport', () => {
        const matcher = createRoadMatcher(createRoadMatchingFixtureGraph());

        matcher.update(
            makeFixtureObservation({ timestamp: 1000, x: 30, y: 0 }),
        );
        const result = matcher.update(
            makeFixtureObservation({ timestamp: 3000, x: 1050, y: 100 }),
        );

        assert.equal(result.roadMatch.edgeId, FIXTURE_EDGE_IDS.remote0);
        assert.equal(result.roadMatch.isTeleport, true);
        assert.equal(result.speedLimit.speedLimitMph, 55);
    });
});
