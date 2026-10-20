import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import {
    buildEmulatorRouteReplay,
    parseEmulatorRoute,
} from '../../../scripts/emulator-route-replay.mjs';
import { loadPilotCorridor } from '../road-corridor-pilot-core.js';
import {
    createDirectedRoadGraph,
    getRoadCoordinateDistanceMeters,
} from '../road-graph.js';
import { predictRoadLookAhead } from '../road-look-ahead.js';
import { getUpcomingElectronicHorizonAlerts } from '../electronic-horizon.js';
import { createRoadMatcher } from '../road-matching.js';

const require = createRequire(import.meta.url);
const route = parseEmulatorRoute(
    JSON.parse(
        readFileSync(
            new URL(
                '../../../.android-auto/route-pewaukee.json',
                import.meta.url,
            ),
        ),
    ),
);
const catalog = JSON.parse(
    readFileSync(
        new URL('../../../assets/map/wisconsin-corridor.json', import.meta.url),
    ),
);
const apiModule = { exports: {} };
const code = require('@babel/core').transformSync(
    readFileSync(new URL('../api.js', import.meta.url), 'utf8'),
    {
        babelrc: false,
        configFile: false,
        plugins: [require('@babel/plugin-transform-modules-commonjs')],
    },
).code;
new Function('require', 'module', 'exports', code)(
    (name) =>
        name === './geo'
            ? {
                  getStoredNumber: (v) => (v == null ? null : Number(v)),
                  normalizeLongitude: (v) => v,
              }
            : {},
    apiModule,
    apiModule.exports,
);

test('Sussex trace matches real downloaded roads through the tile boundary without service fallback', async () => {
    let center, matcher, graph;
    let matched = 0,
        speedLimits = 0,
        observations = 0,
        horizons = 0,
        alertHits = 0;
    const used = new Set();
    for (const fix of buildEmulatorRouteReplay(route)) {
        const coordinate = [fix.longitude, fix.latitude];
        if (
            !center ||
            getRoadCoordinateDistanceMeters(center, coordinate) >= 1200
        ) {
            const ways = await loadPilotCorridor({
                catalog,
                location: fix,
                radiusMeters: 3200,
                normalize: apiModule.exports.normalizeRoadCorridorWay,
                service: () => assert.fail('unexpected fallback'),
                loadTile: async (tile) => {
                    used.add(tile.id);
                    const bytes = readFileSync(
                        new URL(
                            `./fixtures/sussex-corridor-tiles/${tile.key.split('/').at(-1)}`,
                            import.meta.url,
                        ),
                    );
                    assert.equal(
                        createHash('sha256').update(bytes).digest('hex'),
                        tile.sha256,
                    );
                    return gunzipSync(bytes)
                        .toString()
                        .trim()
                        .split('\n')
                        .map(JSON.parse);
                },
            });
            graph = createDirectedRoadGraph(ways);
            matcher = createRoadMatcher(graph);
            center = coordinate;
        }
        const result = matcher.update({
            ...fix,
            bearing: fix.heading,
            accuracy: 5,
            timestamp: 1000 + fix.atMs,
        });
        const horizon = predictRoadLookAhead({
            graph,
            matchedLocation: result,
            maximumDistanceMeters: 2000,
        });
        if (horizon?.primaryPath?.segments?.length) horizons++;
        const alerts = getUpcomingElectronicHorizonAlerts({
            electronicHorizon: horizon,
            alprNodes: [
                {
                    id: 'trace-alert-fixture',
                    coordinate: route.coordinates[40],
                },
            ],
        });
        if (alerts.some((alert) => alert.id.includes('trace-alert-fixture')))
            alertHits++;
        observations++;
        if (result?.roadMatch?.isOffRoad === false) matched++;
        if (result?.speedLimit) speedLimits++;
        assert.ok(
            getRoadCoordinateDistanceMeters(coordinate, [
                result.longitude,
                result.latitude,
            ]) < 30,
            'snapped too far from Sussex GPS trace',
        );
    }
    assert.ok(horizons >= 145, `${horizons} look-ahead paths`);
    assert.ok(alertHits > 0, 'forward alerts lost on downloaded roads');
    assert.equal(observations, 148);
    assert.ok(matched >= 145, `${matched}/${observations} road matches`);
    assert.ok(
        speedLimits >= 140,
        `${speedLimits}/${observations} speed limits`,
    );
    assert.deepEqual([...used].sort(), ['-883_430', '-883_431']);
});

test('Maestro trace uses every saved Sussex geometry vertex with live APIs', () => {
    const source = readFileSync(
        new URL(
            '../../../.maestro/subflows/sussex-corridor-trace.yml',
            import.meta.url,
        ),
        'utf8',
    );
    const actual = [...source.matchAll(/- ['"]([\d.-]+), ([\d.-]+)['"]/g)].map(
        (m) => [Number(m[2]), Number(m[1])],
    );
    const uniqueAdjacent = actual.filter(
        (p, i) => !i || JSON.stringify(p) !== JSON.stringify(actual[i - 1]),
    );
    const expected = route.coordinates.filter(
        (p, i) =>
            !i ||
            JSON.stringify(p) !== JSON.stringify(route.coordinates[i - 1]),
    );
    assert.deepEqual(uniqueAdjacent, expected);
    const flow = readFileSync(
        new URL(
            '../../../.maestro/live-api/road-corridor-sussex.yml',
            import.meta.url,
        ),
        'utf8',
    );
    assert.ok(!flow.includes('e2e-mocks'));
    assert.match(flow, /setAirplaneMode: enabled/);
    assert.match(flow, /clearState: false/);
});
