import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as boundsHelpers from '../marker-load-bounds.js';
import { upsertMarkerPointList } from '../marker-point-merge.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const sourceAt = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const geoSource = sourceAt('../geo.js');
const geoFunctions = parse(geoSource, { sourceType: 'module' })
    .program.body.map((node) => node.declaration ?? node)
    .filter((node) =>
        [
            'normalizeLongitude',
            'getLongitudeSpanDegrees',
            'getMarkerBoundsKey',
            'getMarkerRequestBoundsSpan',
            'markerRequestBoundsAreLoadable',
        ].includes(node.id?.name),
    )
    .map((node) => geoSource.slice(node.start, node.end))
    .join('\n');
const geo = new Function(
    'MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES',
    'MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES',
    `${geoFunctions}\nreturn { getMarkerBoundsKey, getMarkerRequestBoundsSpan, markerRequestBoundsAreLoadable };`,
)(12, 12);

function createHarness() {
    const timers = new Map();
    const requests = [];
    const cleanups = [];
    let timerId = 0;
    const dependencies = {
        react: {
            useRef: () => ({ current: null }),
            useSyncExternalStore: (subscribe, getSnapshot) => {
                cleanups.push(subscribe(() => {}));
                return getSnapshot;
            },
        },
        '../../lib/crashlytics': { addCrashlyticsLog: () => {} },
        './api-mocks': { mapApiMocksAreEnabled: () => false },
        './config': {
            buildApiURL: (route, bounds) =>
                `https://example.test/api/${route}?${new URLSearchParams(bounds)}`,
        },
        './constants': {
            MARKER_LOAD_DEBOUNCE_MS: 200,
            MARKER_LOADING_MIN_VISIBLE_MS: 500,
        },
        './geo': { ...boundsHelpers, ...geo },
        './marker-point-merge': { upsertMarkerPointList },
    };
    const { code } = transformSync(sourceAt('../use-marker-loader.js'), {
        babelrc: false,
        configFile: false,
        plugins: ['@babel/plugin-transform-modules-commonjs'],
    });
    const module = { exports: {} };
    new Function(
        'require',
        'module',
        'exports',
        'fetch',
        'setTimeout',
        'clearTimeout',
        code,
    )(
        (name) => {
            assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
            return dependencies[name];
        },
        module,
        module.exports,
        (url, options) =>
            new Promise((resolve, reject) =>
                requests.push({ url, ...options, resolve, reject }),
            ),
        (callback) => {
            timers.set(++timerId, callback);
            return timerId;
        },
        (id) => timers.delete(id),
    );
    return {
        ...module.exports,
        requests,
        cleanups,
        timers,
        flushTimers() {
            const pending = [...timers.values()];
            timers.clear();
            pending.forEach((callback) => callback());
        },
        async respond(index, points) {
            requests[index].resolve({
                ok: true,
                json: async () => ({ points: { data: points } }),
            });
            await new Promise(setImmediate);
        },
    };
}

const bounds = boundsHelpers.getDrivingMarkerRequiredBounds({
    latitude: 41.88,
    longitude: -87.63,
});
const marker = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-87.63, 41.88] },
    properties: { osm_id: 123 },
};

test('both car surfaces use one API request and the exact same marker snapshot', async () => {
    const harness = createHarness();
    const center = harness.useMarkerLoader({ shared: true });
    const cluster = harness.useMarkerLoader({ shared: true });
    assert.strictEqual(center, cluster);
    center().scheduleMarkerLoad(bounds, 0);
    cluster().scheduleMarkerLoad(bounds, 0);
    assert.equal(harness.timers.size, 1, 'coalesce pending requests');
    harness.flushTimers();
    cluster().scheduleMarkerLoad(bounds, 0);
    assert.equal(harness.requests.length, 1, 'coalesce in-flight requests');
    assert.equal(new URL(harness.requests[0].url).pathname, '/api/markers');
    await harness.respond(0, [marker]);
    assert.strictEqual(center(), cluster());
    assert.deepEqual(center().markerPoints, [marker]);
    assert.ok(cluster().markerCoverage);
    center().scheduleMarkerLoad(bounds, 0);
    harness.flushTimers();
    assert.equal(harness.requests.length, 1, 'reuse loaded coverage');
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('either screen can disconnect during the shared request without aborting the remaining screen', async () => {
    for (const disconnectIndex of [0, 1]) {
        const harness = createHarness();
        const center = harness.useMarkerLoader({ shared: true });
        const cluster = harness.useMarkerLoader({ shared: true });
        center().scheduleMarkerLoad(bounds, 0);
        harness.flushTimers();
        harness.cleanups[disconnectIndex]();
        assert.equal(harness.requests[0].signal.aborted, false);
        await harness.respond(0, [marker]);
        assert.deepEqual(cluster().markerPoints, [marker]);
        const reconnected = harness.useMarkerLoader({ shared: true });
        assert.strictEqual(reconnected().markerPoints, center().markerPoints);
        harness.cleanups[1 - disconnectIndex]();
        harness.cleanups[2]();
        assert.equal(harness.timers.size, 0);
    }
});

test('last disconnect cancels requests and stale responses cannot replace reconnected data', async () => {
    const harness = createHarness();
    const center = harness.useMarkerLoader({ shared: true });
    center().scheduleMarkerLoad(bounds, 0);
    harness.flushTimers();
    harness.cleanups[0]();
    assert.equal(harness.requests[0].signal.aborted, true);
    const reconnected = harness.useMarkerLoader({ shared: true });
    reconnected().scheduleMarkerLoad(bounds, 0);
    harness.flushTimers();
    await harness.respond(1, [marker]);
    await harness.respond(0, []);
    assert.deepEqual(reconnected().markerPoints, [marker]);
    harness.cleanups[1]();
});

test('request errors allow recovery through the other screen and local phone loaders stay isolated', async () => {
    const harness = createHarness();
    const center = harness.useMarkerLoader({ shared: true });
    const cluster = harness.useMarkerLoader({ shared: true });
    const phone = harness.useMarkerLoader();
    center().scheduleMarkerLoad(bounds, 0);
    harness.flushTimers();
    harness.requests[0].reject(new Error('offline'));
    await new Promise(setImmediate);
    assert.equal(cluster().markerLoadError, 'Markers could not be loaded.');
    cluster().scheduleMarkerLoad(bounds, 0);
    harness.flushTimers();
    await harness.respond(1, [marker]);
    assert.equal(center().markerLoadError, '');
    assert.deepEqual(center().markerPoints, [marker]);
    assert.deepEqual(phone().markerPoints, []);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('the common car surface opts into the shared loader', () => {
    assert.match(
        sourceAt('../../auto-play-map-surface-content.js'),
        /const markerLoader = useMarkerLoader\(\{ shared: Platform\.OS === 'android' \}\)/,
    );
});

test('shared marker updates notify both subscribers and reconnect refreshes old coverage', async () => {
    const harness = createHarness();
    const loader = harness.createMarkerLoader();
    let centerUpdates = 0;
    let clusterUpdates = 0;
    const cleanupCenter = loader.subscribe(() => centerUpdates++);
    const cleanupCluster = loader.subscribe(() => clusterUpdates++);
    loader.getSnapshot().scheduleMarkerLoad(bounds, 0);
    harness.flushTimers();
    await harness.respond(0, [marker]);
    assert.ok(centerUpdates > 0);
    assert.equal(centerUpdates, clusterUpdates);
    harness.flushTimers();
    assert.equal(loader.getSnapshot().markerLoadingIndicatorIsVisible, false);
    loader.getSnapshot().handleMarkerLoadingIndicatorHidden();
    assert.equal(loader.getSnapshot().renderMarkerLoadingIndicator, false);
    cleanupCenter();
    cleanupCluster();
    const cleanupReconnected = loader.subscribe(() => {});
    loader.getSnapshot().scheduleMarkerLoad(bounds, 0);
    harness.flushTimers();
    assert.equal(harness.requests.length, 2);
    await harness.respond(1, []);
    assert.deepEqual(loader.getSnapshot().markerPoints, []);
    cleanupReconnected();
});
