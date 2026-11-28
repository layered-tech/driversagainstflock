import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createDirectedRoadGraph } from '../road-graph.js';
import { createRoadMatcher } from '../road-matching.js';
import {
    createPresencePassDetector,
    PRESENCE_POLICY,
} from '../alpr-presence-policy.js';
import {
    getEmulatorRouteFix,
    parseEmulatorRoute,
} from '../../../scripts/emulator-route-replay.mjs';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const route = parseEmulatorRoute(
    require('../../../.android-auto/route-pewaukee.json'),
);
const fixture = require('../pewaukee-drive-fixture.js');
const location = ([longitude, latitude]) => ({ latitude, longitude });

function loadFixtureModule(file, dependencies) {
    const { code } = transformSync(
        readFileSync(new URL(file, import.meta.url), 'utf8'),
        {
            babelrc: false,
            configFile: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        },
    );
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        (id) => {
            assert.ok(id in dependencies, id);
            return dependencies[id];
        },
        module,
        module.exports,
    );
    return module.exports;
}

const mocks = loadFixtureModule('../api-mocks.js', {
    react: {},
    './config': { APP_ENVIRONMENT: 'e2e' },
    './directions': { normalizeDirectionsRouteResponse: (value) => value },
    './geo': { getStoredNumber: (value) => value ?? null },
    './pewaukee-drive-fixture': fixture,
    './speed-limit-mock': require('../speed-limit-mock.js'),
});

test('mock search, place details and guidance use the saved drive and its subpath', async () => {
    const start = location(route.coordinates[0]);
    for (const [query, endIndex] of [
        ['Pewaukee Road', 48],
        ['377 Parkland Ct', route.coordinates.length - 1],
    ]) {
        const [result] = await mocks.searchMockPlaces({ input: query });
        const place = await mocks.getMockPlaceDetails({
            placeId: result.placeId,
        });
        assert.deepEqual(place.location, location(route.coordinates[endIndex]));
        const {
            route: { routes },
        } = await mocks.getMockDirections({ start, end: place.location });
        assert.deepEqual(Object.keys(routes), ['direct']);
        assert.deepEqual(
            routes.direct.coordinates,
            route.coordinates.slice(0, endIndex + 1),
        );
        assert.deepEqual(
            routes.direct.maneuvers.map((step) => step.type),
            [11, 10],
        );
        if (endIndex === route.coordinates.length - 1) {
            assert.equal(routes.direct.duration * 1000, route.durationMs);
            assert.equal(routes.direct.distance, 2743);
        }
    }
    await assert.rejects(
        mocks.getMockDirections({
            start,
            end: { latitude: 30.26, longitude: -97.74 },
        }),
        /No saved Pewaukee/,
    );
});

test('the badge GPS sample matches the first saved road segment at 45 mph', async () => {
    const ways = await mocks.getMockRoadCorridor({});
    assert.deepEqual(ways[0].coordinates, route.coordinates);
    const match = createRoadMatcher(createDirectedRoadGraph(ways)).update({
        latitude: 43.12116,
        longitude: -88.244495,
        accuracy: 5,
        timestamp: 1000,
    });
    assert.equal(match.roadMatch.edgeId, 'e2e-pewaukee:0:forward');
    assert.equal(match.speedLimit.speedLimitMph, 45);
});

test('each presence smoke drive passes the mapped reader before its screenshot', () => {
    const suite = require('../../../.android-auto/suite-presence.json');
    let simulation;
    const presence = loadFixtureModule('../alpr-presence-e2e.js', {
        '../auto-play-drive-simulation': {
            startAutoDriveSimulation: (options) => {
                simulation = options;
            },
        },
        './alpr-presence-runtime': {},
        './api-mocks': { e2eMapApiMocksCanBeEnabled: () => true },
        './pewaukee-drive-fixture': fixture,
        './road-graph': require('../road-graph.js'),
    });
    for (const scenario of suite.tests) {
        const command = scenario.steps.find(
            (step) => step.requestType === 'presence' && step.query !== 'reset',
        );
        if (!command) continue;
        presence.startPresenceE2EScenario(command.query);
        const { coordinates, speedMetersPerSecond } = simulation;
        assert.deepEqual(coordinates, route.coordinates.slice(48));
        assert.deepEqual(location(coordinates[0]), suite.location);
        const detector = createPresencePassDetector();
        const startTime = route.points[48].atMs;
        const screenshotTime = scenario.steps.find(
            (step) => step.type === 'sleep',
        ).milliseconds;
        let encounter;
        // Replay the saved geometry at the smoke simulator's fixed speed.
        const scale =
            speedMetersPerSecond / getEmulatorRouteFix(route, startTime).speed;
        for (let time = 0; time <= screenshotTime; time += simulation.tickMs) {
            const fix = getEmulatorRouteFix(route, startTime + time * scale);
            simulation.onLocation({
                coords: { ...fix, accuracy: 5, speed: speedMetersPerSecond },
                timestamp: 1000 + time,
            });
            encounter ??= detector.update({
                ...presence.getPresenceE2EFixture(),
                now: 1000 + time,
            });
        }
        assert.equal(encounter?.osmNodeId, 12634608635, scenario.name);
        assert.ok(
            encounter.passedAt + PRESENCE_POLICY.earliestMs <=
                1000 + screenshotTime,
        );
    }
});
