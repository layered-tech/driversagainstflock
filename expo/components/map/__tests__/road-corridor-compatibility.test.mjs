import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
    assertRoadCorridorGraphParity,
    validateRoadCorridorWays,
} from '../../../../infrastructure/aws/routing/operations/road-corridor-contract.mjs';
import {
    createDirectedRoadGraph,
    getShortestRoadPathDistanceMeters,
} from '../road-graph.js';
import { createRoadMatcher } from '../road-matching.js';
import { predictRoadLookAhead } from '../road-look-ahead.js';
import { getUpcomingElectronicHorizonAlerts } from '../electronic-horizon.js';
import { shouldHoldRoundaboutManeuver } from '../roundabout-guidance.js';
import {
    baselineCorridorWays,
    corridorCoordinate,
    splitCorridorWays,
} from './fixtures/road-corridor-compatibility.mjs';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const apiSource = transformSync(
    readFileSync(new URL('../api.js', import.meta.url), 'utf8'),
    {
        babelrc: false,
        configFile: false,
        plugins: [require('@babel/plugin-transform-modules-commonjs')],
    },
).code;

// Exercise the public API adapter, including its snake_case normalization.
async function graphFromResponse(ways) {
    const module = { exports: {} };
    const dependencies = {
        '../../lib/crashlytics': { addCrashlyticsLog() {} },
        './api-mocks': { mapApiMocksAreEnabled: () => false },
        './config': { buildApiURL: () => 'https://corridor.test' },
        './geo': {
            getStoredNumber: (value) =>
                value === null || value === undefined ? null : Number(value),
            normalizeLongitude: (value) => value,
        },
    };
    new Function('require', 'module', 'exports', 'fetch', apiSource)(
        (name) => dependencies[name] ?? {},
        module,
        module.exports,
        async () => ({
            ok: true,
            json: async () => ({ ok: true, result: { ways } }),
        }),
    );
    return createDirectedRoadGraph(
        await module.exports.getRoadCorridor({
            location: { latitude: 43.07, longitude: -89.4 },
        }),
    );
}

async function assertCompatible(ways) {
    validateRoadCorridorWays(ways);
    const reference = await graphFromResponse(baselineCorridorWays);
    const candidate = await graphFromResponse(ways);
    assertRoadCorridorGraphParity(reference, candidate);
    return { reference, candidate };
}

test('legacy responses retain their original identity and split graphs fail without continuity support', async () => {
    const reference = await graphFromResponse(baselineCorridorWays);
    assert.ok(
        reference.edges.every(
            (edge) => edge.wayId === `osm-way-${edge.osmWayId}`,
        ),
    );
    const ways = splitCorridorWays();
    ways.forEach((way) => {
        delete way.continuity_id;
    });
    const candidate = await graphFromResponse(ways);
    assert.throws(
        () => assertRoadCorridorGraphParity(reference, candidate),
        /Corridor feature parity failed/,
    );
});

test('split/reordered roads preserve every segment attribute and intersection connection', async () => {
    const { candidate } = await assertCompatible(splitCorridorWays());
    assert.equal(candidate.edgesById.size, candidate.edges.length);
    assert.equal(
        getShortestRoadPathDistanceMeters(candidate, '1', '9'),
        null,
        'overpass is not a junction',
    );
    assert.ok(
        getShortestRoadPathDistanceMeters(candidate, '1', '6') > 0,
        'ramp is connected',
    );
    assert.equal(
        getShortestRoadPathDistanceMeters(candidate, '6', '3'),
        null,
        'ramp is one-way',
    );
    assert.equal(
        getShortestRoadPathDistanceMeters(candidate, '10', '12'),
        null,
        'opposite carriageway is reverse only',
    );
});

test('every permitted direction preserves matched metadata, including roundabouts, tunnels and unknown limits', async () => {
    const { reference, candidate } =
        await assertCompatible(splitCorridorWays());
    for (const edge of reference.edges) {
        const observation = {
            longitude: (edge.start[0] + edge.end[0]) / 2,
            latitude: (edge.start[1] + edge.end[1]) / 2,
            bearing: edge.bearing,
            accuracy: 2,
            speed: 15,
            timestamp: 1000,
        };
        const matches = [reference, candidate].map((graph) =>
            createRoadMatcher(graph).update(observation),
        );
        for (const match of matches) {
            assert.equal(match.roadMatch.isOffRoad, false);
            assert.equal(match.roadMatch.osmWayId, edge.osmWayId);
            assert.equal(match.roadMatch.isRoundabout, edge.isRoundabout);
            assert.equal(match.roadMatch.tunnel, edge.tunnel);
            assert.equal(match.roadMatch.layer, edge.layer);
            assert.equal(match.roadMatch.roadName, edge.roadName);
            assert.equal(match.bearing, edge.bearing);
            assert.deepEqual(match.speedLimit, edge.speedLimit);
        }
    }
});

test('matching, puck bearing, speed, roundabout guidance, look-ahead and alerts survive edge splitting', async () => {
    const { reference, candidate } =
        await assertCompatible(splitCorridorWays());
    const matchers = [
        createRoadMatcher(reference),
        createRoadMatcher(candidate),
    ];
    for (const [index, [x, y, bearing]] of [
        [20, 0, 90],
        [90, 0, 90],
        [150, 0, 90],
        [240, 0, 90],
        [290, 0, 90],
    ].entries()) {
        const [longitude, latitude] = corridorCoordinate(x, y);
        const observation = {
            longitude,
            latitude,
            accuracy: 4,
            speed: 15,
            bearing,
            timestamp: 1000 + index * 5000,
        };
        const matches = matchers.map((matcher) => matcher.update(observation));
        const semanticMatch = (match) => {
            const { edgeId, previousEdgeId, ...roadMatch } = match.roadMatch;
            return { ...match, roadMatch };
        };
        assert.deepEqual(semanticMatch(matches[1]), semanticMatch(matches[0]));
        assert.equal(matches[1].roadMatch.wayId, 'osm-way-100');
        const horizons = [reference, candidate].map((graph, i) =>
            predictRoadLookAhead({
                graph,
                matchedLocation: matches[i],
                maximumDistanceMeters: 300,
            }),
        );
        assert.deepEqual(
            horizons[1].primaryPath.coordinates,
            horizons[0].primaryPath.coordinates,
        );
        const alerts = horizons.map((electronicHorizon) =>
            getUpcomingElectronicHorizonAlerts({
                electronicHorizon,
                alprNodes: [
                    { id: 'ahead', coordinate: corridorCoordinate(280, 0) },
                    {
                        id: 'off-path',
                        coordinate: corridorCoordinate(100, 300),
                    },
                ],
            }),
        );
        assert.deepEqual(alerts[1], alerts[0]);
        if (index === 0)
            assert.ok(alerts[0].some((alert) => alert.id.includes('ahead')));
    }
    for (const isRoundabout of [true, false]) {
        const segments = [reference, candidate].map((graph) =>
            graph.edges.find((edge) => edge.isRoundabout === isRoundabout),
        );
        const holds = segments.map((segment) =>
            shouldHoldRoundaboutManeuver(
                { type: 7 },
                { roadMatch: { ...segment, isOffRoad: false } },
            ),
        );
        assert.deepEqual(holds, [isRoundabout, isRoundabout]);
    }
});

for (const [name, mutate] of [
    [
        'missing original identity',
        (ways) => {
            delete ways[0].continuity_id;
        },
    ],
    [
        'missing directional limit',
        (ways) => {
            delete ways[0].speed_limit_forward_mph;
        },
    ],
    [
        'inferred node IDs',
        (ways) => {
            delete ways[0].node_ids;
        },
    ],
    [
        'missing roundabout metadata',
        (ways) => {
            delete ways[0].is_roundabout;
        },
    ],
    [
        'duplicate edge records',
        (ways) => {
            ways.push(structuredClone(ways[0]));
        },
    ],
    [
        'routing speed replacing unknown limit',
        (ways) => {
            ways[0].speed_limit_forward_mph = 30;
        },
    ],
    [
        'wrong travel direction',
        (ways) => {
            ways.find((way) => way.osm_way_id === 101).direction = 'both';
        },
    ],
    [
        'lost ramp classification',
        (ways) => {
            ways.find((way) => way.osm_way_id === 101).road_class = 'primary';
        },
    ],
    [
        'overpass connected by coordinate',
        (ways) => {
            ways.find(
                (way) => way.osm_way_id === 102 && way.node_ids.includes(8),
            ).node_ids = [2, 9];
        },
    ],
    [
        'unfiltered private road',
        (ways) => {
            ways.push({
                ...structuredClone(ways[0]),
                id: 'private',
                osm_way_id: 999,
                continuity_id: 'osm-way-999',
            });
        },
    ],
]) {
    test(`compatibility gate rejects ${name}`, async () => {
        const ways = splitCorridorWays();
        mutate(ways);
        await assert.rejects(() => assertCompatible(ways));
    });
}
