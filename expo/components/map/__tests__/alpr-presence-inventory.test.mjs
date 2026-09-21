import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createPresenceCoordinator } from '../alpr-presence-coordinator.js';
import { createPresenceInventory } from '../alpr-presence-inventory.js';
import { getPresenceMotionPath } from '../alpr-presence-policy.js';
import { createPresencePrompt } from '../alpr-presence-prompt.js';
import {
    expandBoundsForMarkerRequest,
    getDrivingMarkerRequiredBounds,
    shouldSkipMarkerLoadRequest,
} from '../marker-load-bounds.js';

const camera = {
    osmId: 12634608635,
    coordinate: [-88.2445066, 43.1099621],
    tags: {},
};
const roadLatitude = camera.coordinate[1] - 10 / 111195;
const metersPerDegree = 111195 * Math.cos((roadLatitude * Math.PI) / 180);
function locationAt(meters, time) {
    return {
        longitude: camera.coordinate[0] + meters / metersPerDegree,
        latitude: roadLatitude,
        recordedAt: time,
        accuracy: 5,
        speed: 23.63,
        heading: 90,
        roadMatch: {
            isOffRoad: false,
            wayId: 'same-road',
            edgeMatchProbability: 0.72,
        },
    };
}

const marker = {
    location: camera.coordinate,
    properties: {
        osm_id: camera.osmId,
        type: 'OpenStreetMap ALPR',
        osm_nodes: [{ tags: { 'surveillance:type': 'ALPR' } }],
    },
};
function mapInventory(location, time) {
    return {
        markerPoints: [marker],
        markerCoverage: {
            bounds: expandBoundsForMarkerRequest(
                getDrivingMarkerRequiredBounds(location),
            ),
            loadedAt: time,
        },
    };
}

test('one shared map load covers the pass and full confirmation without separate requests', async () => {
    let time = 100000;
    let location = locationAt(-200, time);
    let map = mapInventory(location, time);
    const inventory = createPresenceInventory({
        now: () => time,
        getLocation: () => location,
        getMapInventory: () => map,
    });
    let context;
    const shown = [];
    const coordinator = createPresenceCoordinator({
        now: () => time,
        load: async () => null,
        save: async () => {},
        randomId: () => 'a'.repeat(32),
        send: async () => {},
    });
    await coordinator.hydrate();
    const prompt = createPresencePrompt({
        coordinator,
        now: () => time,
        getContext: () => context,
        platform: 'android_auto',
        highlight: () => {},
        camera: { focus: async (_frame, valid) => valid(), restore: () => {} },
        host: {
            showAlert: (alert) => {
                shown.push(alert);
                void alert.onWillShow();
            },
            dismissAlert: () => {},
        },
    });
    for (let second = 0; second <= 33; second++) {
        time = 100000 + second * 1000;
        location = locationAt(-200 + second * 23.63, time);
        location.roadMatch.edgeMatchProbability = [0.72, 0.98, 0.83][
            second % 3
        ];
        // Refreshing or failing to refresh the map cannot remove existing inventory.
        if (second === 8) map = { ...map, markersAreLoading: true };
        if (second === 11)
            map = {
                ...map,
                markersAreLoading: false,
                markerLoadError: 'offline',
            };
        context = {
            ...inventory.getContext(),
            location,
            routeKey: 'free',
            coordinates: getPresenceMotionPath(location),
            navigationActive: false,
            enabled: true,
            connected: true,
            visible: true,
            maneuverSeconds: null,
            viewport: { visibleWidth: 753, visibleHeight: 442 },
        };
        assert.equal(context.coverageComplete, true);
        assert.equal(
            shouldSkipMarkerLoadRequest({
                cameraBounds: getDrivingMarkerRequiredBounds(location),
                lastLoadedRequestBounds: map.markerCoverage.bounds,
            }),
            true,
        );
        prompt.tick();
        await new Promise((resolve) => setImmediate(resolve));
        if (second >= 13 && second < 33)
            assert.equal(prompt.inspect().phase, 'showing');
    }
    assert.equal(shown.length, 1);
    assert.equal(prompt.ownsCamera, false);
    assert.equal(context.inventorySource, 'map markers');
    assert.equal(context.nodes.length, 1);
    inventory.dispose();
});

test('slow or failed map refresh retains cameras, and removed markers have bounded retention', () => {
    let time = 100000;
    let location = locationAt(0, time);
    let map = mapInventory(location, time);
    const inventory = createPresenceInventory({
        now: () => time,
        getLocation: () => location,
        getMapInventory: () => map,
    });
    assert.equal(inventory.getContext().nodes.length, 1);
    time += 60000;
    map = { ...map, markersAreLoading: true };
    assert.equal(inventory.getContext().coverageComplete, true);
    assert.equal(inventory.getContext().nodes.length, 1);
    map = { ...map, markersAreLoading: false, markerLoadError: 'offline' };
    assert.equal(inventory.getContext().coverageComplete, true);
    assert.equal(inventory.getContext().nodes.length, 1);
    map = { ...map, markerPoints: [] };
    assert.equal(inventory.getContext().nodes.length, 1);
    assert.equal(inventory.getContext().retainedNodeCount, 1);
    time += 119999;
    assert.equal(inventory.getContext().nodes.length, 1);
    time++;
    assert.equal(inventory.getContext().nodes.length, 0);
});

test('map coverage stays spatial, empty successful maps are known and unloaded maps remain unknown', () => {
    let location = locationAt(0, 100000);
    let map = {};
    const inventory = createPresenceInventory({
        getLocation: () => location,
        getMapInventory: () => map,
        now: () => 100000,
    });
    assert.equal(inventory.getContext().coverageComplete, false);
    map = mapInventory(location, 100000);
    map.markerPoints = [];
    assert.equal(inventory.getContext().coverageComplete, true);
    assert.equal(inventory.getContext().nodes.length, 0);
    map.markerPoints = [marker];
    assert.equal(inventory.getContext().nodes.length, 1);
    location = locationAt(26000, 100000);
    assert.equal(inventory.getContext().coverageComplete, false);
    assert.deepEqual(inventory.getContext().nodes, []);
    inventory.dispose();
    assert.equal(inventory.getContext().coverageComplete, false);
});

test('map marker updates preserve canonical identity and tags without duplicating retained cameras', () => {
    const location = locationAt(0, 100000);
    let map = mapInventory(location, 100000);
    const inventory = createPresenceInventory({
        getLocation: () => location,
        getMapInventory: () => map,
    });
    assert.equal(inventory.getContext().nodes[0].osm_id, camera.osmId);
    map = { ...map, markerPoints: [] };
    assert.equal(inventory.getContext().retainedNodeCount, 1);
    const next = {
        ...marker,
        properties: { ...marker.properties, osm_version: 8 },
        location: [camera.coordinate[0], camera.coordinate[1] + 0.0001],
    };
    map = {
        ...map,
        markerPoints: [
            next,
            next,
            { properties: { osm_id: 3 }, location: [NaN, 1] },
        ],
    };
    const context = inventory.getContext();
    assert.equal(context.nodes.length, 1);
    assert.equal(context.nodes[0].latitude, next.location[1]);
    assert.equal(context.nodes[0].osm_version, 8);
    assert.equal(context.retainedNodeCount, 0);
    assert.equal(context.nodes[0].tags['surveillance:type'], 'ALPR');
});

test('the API client propagates verified coverage radius and preserves unknown older responses', async () => {
    const require = createRequire(import.meta.url);
    const { code } = require('@babel/core').transformSync(
        readFileSync(
            new URL('../electronic-horizon-alerts-api.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                require.resolve('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    );
    let radius = 750;
    const requests = [];
    const mocks = {
        'expo/fetch': {
            fetch: async (_url, request) => {
                requests.push(JSON.parse(request.body));
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        result: {
                            coverage_complete: true,
                            coverage_radius_meters: radius,
                            nodes: [],
                        },
                    }),
                };
            },
        },
        '../../lib/sentry': { addSentryBreadcrumb() {} },
        './abortable-operation': {
            runAbortableOperation: async (operation) => operation(),
        },
        './api-mocks': { mapApiMocksAreEnabled: () => false },
        './config': { buildApiURL: (value) => value },
        './electronic-horizon': {
            normalizeElectronicHorizonCoordinates: (value) => value,
        },
        './geo': {
            getStoredNumber: (value) => (value == null ? null : Number(value)),
        },
        './map-performance-signposts': {
            beginMapPerformanceSignpost() {},
            endMapPerformanceSignpost() {},
            recordMapPerformanceSignpost() {},
        },
        './scorecard-drive-e2e-fixture': {},
    };
    const exports = {};
    new Function('require', 'exports', code)((name) => {
        assert.ok(mocks[name], name);
        return mocks[name];
    }, exports);
    const request = {
        coordinates: [
            [-88, 43],
            [-88.00001, 43],
        ],
        presence: true,
    };
    assert.equal(
        (await exports.getElectronicHorizonAlprNodes(request))
            .coverageRadiusMeters,
        750,
    );
    assert.equal(requests[0].presence, true);
    radius = undefined;
    assert.equal(
        (await exports.getElectronicHorizonAlprNodes(request))
            .coverageRadiusMeters,
        null,
    );
});

test('map camera versions survive retention and reach confirmation submissions on both platforms', async () => {
    for (const platform of ['android_auto', 'carplay']) {
        const location = locationAt(0, 100000);
        let map = {
            ...mapInventory(location, 100000),
            markerPoints: [
                {
                    ...marker,
                    properties: { ...marker.properties, osm_version: 7 },
                },
            ],
        };
        const inventory = createPresenceInventory({
            now: () => 100000,
            getLocation: () => location,
            getMapInventory: () => map,
        });
        assert.equal(inventory.getContext().nodes[0].osm_version, 7);
        map = { ...map, markerPoints: [] };
        const node = inventory.getContext().nodes[0];
        assert.equal(node.osm_version, 7);
        const sent = [];
        const coordinator = createPresenceCoordinator({
            now: () => 100000,
            load: async () => null,
            save: async () => {},
            randomId: () => 'a'.repeat(32),
            send: async (payload) => {
                sent.push(payload);
            },
        });
        const reservation = await coordinator.reserve({
            osmNodeId: node.osm_id,
            node,
            passedAt: 96000,
        });
        assert.ok(reservation);
        await coordinator.presented(reservation);
        await coordinator.reportMissing(reservation, platform);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(sent.length, 1);
        assert.equal(sent[0].observed.version, 7);
        assert.equal(sent[0].osm_node_id, camera.osmId);
        assert.equal(sent[0].platform, platform);
        inventory.dispose();
    }
});

test('older markers and invalid OSM versions remain unknown without rejecting the camera', () => {
    for (const version of [undefined, null, 0, -1, 1.5, true, 'unknown']) {
        const inventory = createPresenceInventory({
            getLocation: () => locationAt(0, 100000),
            getMapInventory: () => ({
                ...mapInventory(locationAt(0, 100000), 100000),
                markerPoints: [
                    {
                        ...marker,
                        properties: {
                            ...marker.properties,
                            osm_version: version,
                        },
                    },
                ],
            }),
        });
        const node = inventory.getContext().nodes[0];
        assert.equal(node.osm_id, camera.osmId);
        assert.equal(node.osm_version, null);
        inventory.dispose();
    }
});
