import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createDirectedRoadGraph } from '../road-graph.js';
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

const FORK_EDGE_IDS = Object.freeze({
    gentle0: 'gentle:0:forward',
    gentle1: 'gentle:1:forward',
    sharp0: 'sharp:0:forward',
    sharp1: 'sharp:1:forward',
    slight0: 'slight:0:forward',
    slight1: 'slight:1:forward',
    trunk0: 'trunk:0:forward',
    trunk1: 'trunk:1:forward',
});

/**
 * A one-way trunk that forks at (200, 0). The slight branch bends about 17
 * degrees, the gentle branch about 22 degrees and the sharp branch 60 degrees,
 * so slight always scores best while gentle stays within the hysteresis margin.
 */
function createForkGraph() {
    const forkWay = (id, ...offsets) => ({
        coordinates: [
            fixtureCoordinate(200, 0),
            fixtureCoordinate(200 + offsets[0][0], offsets[0][1]),
            fixtureCoordinate(200 + offsets[1][0], offsets[1][1]),
        ],
        id,
        nodeIds: ['trunk-2', `${id}-1`, `${id}-2`],
        oneWay: true,
        priority: 1,
        speedLimit: { speed: 35, unit: 'mph' },
    });

    return createDirectedRoadGraph([
        {
            coordinates: [
                fixtureCoordinate(0, 0),
                fixtureCoordinate(100, 0),
                fixtureCoordinate(200, 0),
            ],
            id: 'trunk',
            nodeIds: ['trunk-0', 'trunk-1', 'trunk-2'],
            oneWay: true,
            priority: 1,
            speedLimit: { speed: 35, unit: 'mph' },
        },
        forkWay('slight', [100, 30], [200, 60]),
        forkWay('gentle', [100, -40], [200, -80]),
        forkWay('sharp', [50, 86.6], [100, 173.2]),
    ]);
}

function makeTrunkMatchedLocation(fraction = 0.5) {
    return {
        roadMatch: {
            edgeId: FORK_EDGE_IDS.trunk1,
            fraction,
            isOffRoad: false,
        },
        timestamp: 2000,
    };
}

function predictForkLookAhead(options = {}) {
    return predictRoadLookAhead({
        graph: createForkGraph(),
        matchedLocation: makeTrunkMatchedLocation(),
        maximumDistanceMeters: 300,
        ...options,
    });
}

const JUNCTION_EDGE_IDS = Object.freeze({
    left0: 'left:0:forward',
    left1: 'left:1:forward',
    main1: 'main:1:forward',
    main2: 'main:2:forward',
    main3: 'main:3:forward',
    right0: 'right:0:forward',
    right1: 'right:1:forward',
    side0: 'side:0:forward',
    side1: 'side:1:forward',
});

/**
 * Main Street (high priority, 45 mph) bends at (200, 0) while a minor side
 * street (priority 0, 25 mph) continues straight through the junction.
 */
function createBendingMainGraph(bendYMeters) {
    return createDirectedRoadGraph([
        {
            coordinates: [
                fixtureCoordinate(0, 0),
                fixtureCoordinate(100, 0),
                fixtureCoordinate(200, 0),
                fixtureCoordinate(300, bendYMeters),
                fixtureCoordinate(400, bendYMeters * 2),
            ],
            id: 'main',
            nodeIds: ['m0', 'm1', 'm2', 'm3', 'm4'],
            oneWay: true,
            priority: 3,
            speedLimit: { speed: 45, unit: 'mph' },
        },
        {
            coordinates: [
                fixtureCoordinate(200, 0),
                fixtureCoordinate(300, 0),
                fixtureCoordinate(400, 0),
            ],
            id: 'side',
            nodeIds: ['m2', 's1', 's2'],
            oneWay: true,
            priority: 0,
            speedLimit: { speed: 25, unit: 'mph' },
        },
    ]);
}

/** Main Street ends in a T-junction with a major left turn and a minor right turn. */
function createTJunctionGraph() {
    return createDirectedRoadGraph([
        {
            coordinates: [
                fixtureCoordinate(0, 0),
                fixtureCoordinate(100, 0),
                fixtureCoordinate(200, 0),
            ],
            id: 'main',
            nodeIds: ['m0', 'm1', 'm2'],
            oneWay: true,
            priority: 2,
            speedLimit: { speed: 35, unit: 'mph' },
        },
        {
            coordinates: [
                fixtureCoordinate(200, 0),
                fixtureCoordinate(200, 100),
                fixtureCoordinate(200, 200),
            ],
            id: 'left',
            nodeIds: ['m2', 'l1', 'l2'],
            oneWay: true,
            priority: 3,
            speedLimit: { speed: 35, unit: 'mph' },
        },
        {
            coordinates: [
                fixtureCoordinate(200, 0),
                fixtureCoordinate(200, -100),
                fixtureCoordinate(200, -200),
            ],
            id: 'right',
            nodeIds: ['m2', 'r1', 'r2'],
            oneWay: true,
            priority: 1,
            speedLimit: { speed: 35, unit: 'mph' },
        },
    ]);
}

/**
 * Northbound Main Street with a right-turn slip lane that peels off at about 7
 * degrees and merges into eastbound Cross Street, mirroring the Sussex WIS 164 /
 * County K approach where the horizon used to follow the slip lane.
 */
function createSlipLaneGraph({
    sideRoadBendMeters = null,
    slipLaneRoadClass = 'primary_link',
} = {}) {
    const sideRoadWays =
        sideRoadBendMeters === null
            ? []
            : [
                  {
                      coordinates: [
                          fixtureCoordinate(200, 0),
                          fixtureCoordinate(300, sideRoadBendMeters),
                          fixtureCoordinate(400, sideRoadBendMeters * 2),
                      ],
                      id: 'side',
                      nodeIds: ['m2', 'side1', 'side2'],
                      oneWay: true,
                      priority: 5,
                      roadClass: 'secondary',
                      speedLimit: { speed: 35, unit: 'mph' },
                  },
              ];

    return createDirectedRoadGraph([
        ...sideRoadWays,
        {
            coordinates: [
                fixtureCoordinate(0, 0),
                fixtureCoordinate(100, 0),
                fixtureCoordinate(200, 0),
                fixtureCoordinate(300, 0),
                fixtureCoordinate(400, 0),
            ],
            id: 'main',
            nodeIds: ['m0', 'm1', 'm2', 'm3', 'm4'],
            oneWay: true,
            priority: 6,
            roadClass: 'primary',
            speedLimit: { speed: 45, unit: 'mph' },
        },
        {
            coordinates: [
                fixtureCoordinate(200, 0),
                fixtureCoordinate(280, -10),
                fixtureCoordinate(300, -30),
                fixtureCoordinate(300, -120),
            ],
            id: 'slip',
            nodeIds: ['m2', 'slip1', 'slip2', 'cross1'],
            oneWay: true,
            priority: 5,
            roadClass: slipLaneRoadClass,
        },
        {
            coordinates: [
                fixtureCoordinate(300, -30),
                fixtureCoordinate(300, -120),
                fixtureCoordinate(300, -220),
            ],
            id: 'cross',
            nodeIds: ['slip2', 'cross1', 'cross2'],
            oneWay: true,
            priority: 5,
            roadClass: 'secondary',
            speedLimit: { speed: 35, unit: 'mph' },
        },
    ]);
}

function predictMainLookAhead(graph, options = {}) {
    return predictRoadLookAhead({
        graph,
        matchedLocation: {
            roadMatch: {
                edgeId: JUNCTION_EDGE_IDS.main1,
                fraction: 0.5,
                isOffRoad: false,
            },
            timestamp: 2000,
        },
        maximumDistanceMeters: 300,
        ...options,
    });
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

describe('sticky road look-ahead', () => {
    test('exposes the primary path edge ids and reports a fresh prediction', () => {
        const lookAhead = predictForkLookAhead();

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.slight0,
            FORK_EDGE_IDS.slight1,
        ]);
        assert.deepEqual(
            getPathEdgeIds(lookAhead),
            lookAhead.primaryPath.edgeIds,
        );
        assert.equal(lookAhead.retainedPreviousPath, false);
    });

    test('keeps the previously predicted branch when a competitor is only marginally better', () => {
        const lookAhead = predictForkLookAhead({
            previousLookAhead: {
                primaryPath: {
                    edgeIds: [
                        FORK_EDGE_IDS.trunk0,
                        FORK_EDGE_IDS.trunk1,
                        FORK_EDGE_IDS.gentle0,
                        FORK_EDGE_IDS.gentle1,
                    ],
                },
            },
        });

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.gentle0,
            FORK_EDGE_IDS.gentle1,
        ]);
        assert.equal(lookAhead.retainedPreviousPath, true);
        assert.ok(lookAhead.primaryPath.probability > 0);
        assert.ok(lookAhead.primaryPath.probability < 0.5);
    });

    test('reads the previous continuation from normalized segments as well', () => {
        const lookAhead = predictForkLookAhead({
            previousLookAhead: {
                primaryPath: {
                    segments: [
                        { edgeId: FORK_EDGE_IDS.trunk1 },
                        { edgeId: FORK_EDGE_IDS.gentle0 },
                        { edgeId: FORK_EDGE_IDS.gentle1 },
                    ],
                },
            },
        });

        assert.equal(lookAhead.retainedPreviousPath, true);
        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.gentle0,
            FORK_EDGE_IDS.gentle1,
        ]);
    });

    test('switches once the competitor beats the retained path by more than the margin', () => {
        const lookAhead = predictForkLookAhead({
            previousLookAhead: {
                primaryPath: {
                    edgeIds: [
                        FORK_EDGE_IDS.trunk1,
                        FORK_EDGE_IDS.sharp0,
                        FORK_EDGE_IDS.sharp1,
                    ],
                },
            },
        });

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.slight0,
            FORK_EDGE_IDS.slight1,
        ]);
        assert.equal(lookAhead.retainedPreviousPath, false);
    });

    test('drops the previous path once the vehicle is no longer on it', () => {
        const lookAhead = predictForkLookAhead({
            previousLookAhead: {
                primaryPath: {
                    edgeIds: [FORK_EDGE_IDS.gentle0, FORK_EDGE_IDS.gentle1],
                },
            },
        });

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.slight0,
            FORK_EDGE_IDS.slight1,
        ]);
        assert.equal(lookAhead.retainedPreviousPath, false);
    });

    test('follows the previous path past its own horizon without penalty', () => {
        const lookAhead = predictForkLookAhead({
            previousLookAhead: {
                primaryPath: {
                    edgeIds: [FORK_EDGE_IDS.trunk1, FORK_EDGE_IDS.gentle0],
                },
            },
        });

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.gentle0,
            FORK_EDGE_IDS.gentle1,
        ]);
        assert.equal(lookAhead.retainedPreviousPath, true);
    });

    test('a zero margin disables the hysteresis', () => {
        const lookAhead = predictForkLookAhead({
            previousLookAhead: {
                primaryPath: {
                    edgeIds: [
                        FORK_EDGE_IDS.trunk1,
                        FORK_EDGE_IDS.gentle0,
                        FORK_EDGE_IDS.gentle1,
                    ],
                },
            },
            previousPathScoreMargin: 0,
        });

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.slight0,
            FORK_EDGE_IDS.slight1,
        ]);
        assert.equal(lookAhead.retainedPreviousPath, false);
    });

    test('a retained fork stays retained while approaching it', () => {
        const graph = createForkGraph();
        const initialLookAhead = predictRoadLookAhead({
            graph,
            matchedLocation: makeTrunkMatchedLocation(0.1),
            maximumDistanceMeters: 300,
            previousLookAhead: {
                primaryPath: {
                    edgeIds: [FORK_EDGE_IDS.trunk1, FORK_EDGE_IDS.gentle0],
                },
            },
        });
        const laterLookAhead = predictRoadLookAhead({
            graph,
            matchedLocation: makeTrunkMatchedLocation(0.9),
            maximumDistanceMeters: 300,
            previousLookAhead: initialLookAhead,
        });

        assert.equal(initialLookAhead.retainedPreviousPath, true);
        assert.equal(laterLookAhead.retainedPreviousPath, true);
        assert.deepEqual(laterLookAhead.primaryPath.edgeIds, [
            FORK_EDGE_IDS.trunk1,
            FORK_EDGE_IDS.gentle0,
            FORK_EDGE_IDS.gentle1,
        ]);
    });
});

describe('forward-looking junctions', () => {
    test('follows the obviously straight side street instead of the bending main road', () => {
        const lookAhead = predictMainLookAhead(createBendingMainGraph(70));

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            JUNCTION_EDGE_IDS.main1,
            JUNCTION_EDGE_IDS.side0,
            JUNCTION_EDGE_IDS.side1,
        ]);
    });

    test('scoring alone would have kept the higher-priority same way', () => {
        const lookAhead = predictMainLookAhead(createBendingMainGraph(70), {
            obviousForwardMaximumHeadingDeltaDegrees: 0,
        });

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            JUNCTION_EDGE_IDS.main1,
            JUNCTION_EDGE_IDS.main2,
            JUNCTION_EDGE_IDS.main3,
        ]);
    });

    test('falls back to scoring when two continuations are both nearly straight', () => {
        const graph = createBendingMainGraph(36.4);

        assert.deepEqual(predictMainLookAhead(graph).primaryPath.edgeIds, [
            JUNCTION_EDGE_IDS.main1,
            JUNCTION_EDGE_IDS.main2,
            JUNCTION_EDGE_IDS.main3,
        ]);
        assert.deepEqual(
            predictMainLookAhead(graph, {
                obviousForwardAmbiguityMarginDegrees: 10,
            }).primaryPath.edgeIds,
            [
                JUNCTION_EDGE_IDS.main1,
                JUNCTION_EDGE_IDS.side0,
                JUNCTION_EDGE_IDS.side1,
            ],
        );
    });

    test('scores the branches of a T-junction because nothing continues forward', () => {
        const lookAhead = predictMainLookAhead(createTJunctionGraph());

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            JUNCTION_EDGE_IDS.main1,
            JUNCTION_EDGE_IDS.left0,
            JUNCTION_EDGE_IDS.left1,
        ]);
        assert.ok(lookAhead.primaryPath.probability < 0.75);
    });

    test('keeps the retained branch at a T-junction until scoring clearly disagrees', () => {
        const lookAhead = predictMainLookAhead(createTJunctionGraph(), {
            previousLookAhead: {
                primaryPath: {
                    edgeIds: [
                        JUNCTION_EDGE_IDS.main1,
                        JUNCTION_EDGE_IDS.right0,
                        JUNCTION_EDGE_IDS.right1,
                    ],
                },
            },
        });

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            JUNCTION_EDGE_IDS.main1,
            JUNCTION_EDGE_IDS.right0,
            JUNCTION_EDGE_IDS.right1,
        ]);
        assert.equal(lookAhead.retainedPreviousPath, true);
    });
});

describe('forward-looking junctions with slip lanes', () => {
    test('ignores a shallow right-turn slip lane and keeps the through road', () => {
        const lookAhead = predictMainLookAhead(createSlipLaneGraph());

        assert.deepEqual(lookAhead.primaryPath.edgeIds, [
            JUNCTION_EDGE_IDS.main1,
            JUNCTION_EDGE_IDS.main2,
            JUNCTION_EDGE_IDS.main3,
        ]);
        assert.equal(lookAhead.primaryPath.probability, 1);
    });

    test('treats the same shallow branch as ambiguous when it is a real road', () => {
        const lookAhead = predictMainLookAhead(
            createSlipLaneGraph({ slipLaneRoadClass: 'primary' }),
        );

        assert.ok(lookAhead.primaryPath.probability < 1);
    });

    test('still needs a clear margin against real turns after dropping links', () => {
        // A real secondary road leaves the same node at roughly 40 degrees.
        const graph = createSlipLaneGraph({ sideRoadBendMeters: 84 });

        assert.deepEqual(predictMainLookAhead(graph).primaryPath.edgeIds, [
            JUNCTION_EDGE_IDS.main1,
            JUNCTION_EDGE_IDS.main2,
            JUNCTION_EDGE_IDS.main3,
        ]);
        assert.ok(
            predictMainLookAhead(graph, {
                obviousForwardAmbiguityMarginDegrees: 60,
            }).primaryPath.probability < 1,
        );
    });
});
