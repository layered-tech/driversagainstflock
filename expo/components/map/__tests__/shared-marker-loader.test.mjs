import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createMarkerCache, MARKER_CACHE_FRESH_MS } from '../marker-cache.js';
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

function createHarness({ stored = null, readCache } = {}) {
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
        '../../lib/private-cache-storage': {
            getPrivateCacheItem: readCache ?? (async () => stored),
            setPrivateCacheItem: async (_, value) => {
                stored = value;
            },
        },
        './marker-cache': { createMarkerCache, MARKER_CACHE_FRESH_MS },
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
        (callback, delay = 0) => {
            timers.set(++timerId, { callback, delay });
            return timerId;
        },
        (id) => timers.delete(id),
    );
    return {
        ...module.exports,
        requests,
        cleanups,
        timers,
        async flushTimers(maxDelay = Infinity) {
            const pending = [...timers.entries()].filter(
                ([, timer]) => timer.delay <= maxDelay,
            );
            pending.forEach(([id]) => timers.delete(id));
            pending.forEach(([, timer]) => timer.callback());
            await new Promise(setImmediate);
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
    await harness.flushTimers();
    cluster().scheduleMarkerLoad(bounds, 0);
    assert.equal(harness.requests.length, 1, 'coalesce in-flight requests');
    assert.equal(new URL(harness.requests[0].url).pathname, '/api/markers');
    await harness.respond(0, [marker]);
    assert.strictEqual(center(), cluster());
    assert.deepEqual(center().markerPoints, [marker]);
    assert.ok(cluster().markerCoverage);
    center().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 1, 'reuse loaded coverage');
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('either screen can disconnect during the shared request without aborting the remaining screen', async () => {
    for (const disconnectIndex of [0, 1]) {
        const harness = createHarness();
        const center = harness.useMarkerLoader({ shared: true });
        const cluster = harness.useMarkerLoader({ shared: true });
        center().scheduleMarkerLoad(bounds, 0);
        await harness.flushTimers();
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
    await harness.flushTimers();
    harness.cleanups[0]();
    assert.equal(harness.requests[0].signal.aborted, true);
    const reconnected = harness.useMarkerLoader({ shared: true });
    reconnected().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
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
    await harness.flushTimers();
    harness.requests[0].reject(new Error('offline'));
    await new Promise(setImmediate);
    assert.equal(cluster().markerLoadError, 'Markers could not be loaded.');
    cluster().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    await harness.respond(1, [marker]);
    assert.equal(center().markerLoadError, '');
    assert.deepEqual(center().markerPoints, [marker]);
    assert.deepEqual(phone().markerPoints, []);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('the common car surface owns an independent viewport loader', () => {
    assert.match(
        sourceAt('../../auto-play-map-surface-content.js'),
        /const markerLoader = useMarkerLoader\(\)/,
    );
});

test('three display viewports can load and pan without cancelling or replacing each other', async () => {
    const harness = createHarness();
    const displays = Array.from({ length: 3 }, () => harness.useMarkerLoader());
    const viewports = [
        bounds,
        ...[42, 43].map((latitude) =>
            boundsHelpers.getDrivingMarkerRequiredBounds({
                latitude,
                longitude: -88,
            }),
        ),
    ];
    displays.forEach((display, index) =>
        display().scheduleMarkerLoad(viewports[index], 0),
    );
    await harness.flushTimers();
    assert.equal(harness.requests.length, 3);
    assert.ok(harness.requests.every((request) => !request.signal.aborted));
    for (const index of [2, 0, 1]) {
        await harness.respond(index, [{ ...marker, id: index }]);
    }
    displays.forEach((display, index) =>
        assert.equal(display().markerPoints[0].id, index),
    );
    displays[0]().scheduleMarkerLoad(
        boundsHelpers.getDrivingMarkerRequiredBounds({
            latitude: 44,
            longitude: -89,
        }),
        0,
    );
    await harness.flushTimers();
    await harness.respond(3, [{ ...marker, id: 'panned-phone' }]);
    assert.equal(displays[0]().markerPoints[0].id, 'panned-phone');
    assert.equal(displays[1]().markerPoints[0].id, 1);
    assert.equal(displays[2]().markerPoints[0].id, 2);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('rapid pans keep one request active and load only the latest queued area', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    const middle = boundsHelpers.getDrivingMarkerRequiredBounds({
        latitude: 42,
        longitude: -87.63,
    });
    const latest = boundsHelpers.getDrivingMarkerRequiredBounds({
        latitude: 43,
        longitude: -87.63,
    });

    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    phone().scheduleMarkerLoad(middle, 0);
    await harness.flushTimers(1000);
    phone().scheduleMarkerLoad(latest, 0);
    await harness.flushTimers(1000);

    assert.equal(harness.requests.length, 1);
    assert.equal(harness.requests[0].signal.aborted, false);
    await harness.respond(0, [{ ...marker, id: 'superseded' }]);
    assert.deepEqual(phone().markerPoints, []);
    await harness.flushTimers(1000);

    assert.equal(harness.requests.length, 2);
    assert.equal(
        new URL(harness.requests[1].url).searchParams.get('sw_lat'),
        String(boundsHelpers.expandBoundsForMarkerRequest(latest).sw_lat),
    );
    const returningDisplay = harness.useMarkerLoader();
    returningDisplay().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 2, 'cache the completed older area');
    assert.equal(returningDisplay().markerPoints[0].id, 'superseded');
    assert.deepEqual(phone().markerPoints, []);
    await harness.respond(1, [{ ...marker, id: 'latest' }]);
    assert.equal(phone().markerPoints[0].id, 'latest');
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('independent displays share compatible downloads but keep independent state', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    const car = harness.useMarkerLoader();

    phone().scheduleMarkerLoad(
        {
            sw: bounds.sw.map((coordinate) => coordinate - 0.1),
            ne: bounds.ne.map((coordinate) => coordinate + 0.1),
        },
        0,
    );
    car().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();

    assert.equal(harness.requests.length, 1);
    harness.cleanups[0]();
    assert.equal(harness.requests[0].signal.aborted, false);
    await harness.respond(0, [marker]);
    assert.deepEqual(car().markerPoints, [marker]);
    assert.deepEqual(phone().markerPoints, []);
    harness.cleanups[1]();
    assert.equal(harness.requests[0].signal.aborted, false);
});

test('the last independent consumer disconnect aborts the shared download and rejects late data', async () => {
    for (const disconnectOrder of [
        [0, 1],
        [1, 0],
    ]) {
        const harness = createHarness();
        const displays = [harness.useMarkerLoader(), harness.useMarkerLoader()];
        displays.forEach((display) => display().scheduleMarkerLoad(bounds, 0));
        await harness.flushTimers(1000);
        assert.equal(harness.requests.length, 1);
        harness.cleanups[disconnectOrder[0]]();
        assert.equal(harness.requests[0].signal.aborted, false);
        harness.cleanups[disconnectOrder[1]]();
        assert.equal(harness.requests[0].signal.aborted, true);
        assert.equal(harness.timers.size, 0);

        const reconnected = harness.useMarkerLoader();
        reconnected().scheduleMarkerLoad(bounds, 0);
        await harness.flushTimers(1000);
        assert.equal(harness.requests.length, 2);
        await harness.respond(1, [marker]);
        await harness.respond(0, []);
        assert.deepEqual(reconnected().markerPoints, [marker]);
        harness.cleanups[2]();
    }
});

test('returning to the active area drops queued work without restarting the download', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    phone().scheduleMarkerLoad(
        boundsHelpers.getDrivingMarkerRequiredBounds({
            latitude: 44,
            longitude: -89,
        }),
        0,
    );
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.requests[0].signal.aborted, false);
    await harness.respond(0, [marker]);
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(phone().markerPoints, [marker]);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('repeated scheduling does not bypass marker retry backoff', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    harness.requests[0].reject(new Error('offline'));
    await new Promise(setImmediate);

    for (let index = 0; index < 5; index++) {
        phone().scheduleMarkerLoad(bounds, 0);
    }
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 1);

    await harness.flushTimers();
    assert.equal(harness.requests.length, 2);
    await harness.respond(1, [marker]);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('retry exhaustion stays bounded under repeated scheduling', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    harness.requests[0].reject(new Error('offline'));
    await new Promise(setImmediate);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 2);
    harness.requests[1].reject(new Error('still offline'));
    await new Promise(setImmediate);

    for (let index = 0; index < 5; index++) {
        phone().scheduleMarkerLoad(bounds, 0);
        await harness.flushTimers(1000);
    }
    assert.equal(harness.requests.length, 2);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 2, 'only one automatic retry');
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 3, 'recovery after backoff');
    await harness.respond(2, [marker]);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('a failed download retries only the latest queued area after backoff', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    const latest = boundsHelpers.getDrivingMarkerRequiredBounds({
        latitude: 44,
        longitude: -89,
    });
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    phone().scheduleMarkerLoad(latest, 0);
    harness.requests[0].reject(new Error('offline'));
    await new Promise(setImmediate);
    phone().scheduleMarkerLoad(latest, 0);
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 1);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 2);
    assert.equal(
        new URL(harness.requests[1].url).searchParams.get('sw_lat'),
        String(boundsHelpers.expandBoundsForMarkerRequest(latest).sw_lat),
    );
    await harness.respond(1, [marker]);
    assert.deepEqual(phone().markerPoints, [marker]);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('panning back into loaded coverage cancels the obsolete viewport request', async () => {
    for (const inFlight of [false, true]) {
        const harness = createHarness();
        const phone = harness.useMarkerLoader();
        phone().scheduleMarkerLoad(bounds, 0);
        await harness.flushTimers();
        await harness.respond(0, [marker]);
        await harness.flushTimers();
        phone().scheduleMarkerLoad(
            boundsHelpers.getDrivingMarkerRequiredBounds({
                latitude: 44,
                longitude: -89,
            }),
            0,
        );
        if (inFlight) await harness.flushTimers();
        phone().scheduleMarkerLoad(bounds, 0);
        await harness.flushTimers();
        if (inFlight) {
            assert.equal(harness.requests[1].signal.aborted, true);
            await harness.respond(1, []);
        } else {
            assert.equal(harness.requests.length, 1);
        }
        assert.deepEqual(phone().markerPoints, [marker]);
        assert.equal(phone().markersAreLoading, false);
        harness.cleanups.forEach((cleanup) => cleanup());
    }
});

test('shared marker updates notify both subscribers and reconnect reuses fresh coverage', async () => {
    const harness = createHarness();
    const loader = harness.createMarkerLoader();
    let centerUpdates = 0;
    let clusterUpdates = 0;
    const cleanupCenter = loader.subscribe(() => centerUpdates++);
    const cleanupCluster = loader.subscribe(() => clusterUpdates++);
    loader.getSnapshot().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    await harness.respond(0, [marker]);
    assert.ok(centerUpdates > 0);
    assert.equal(centerUpdates, clusterUpdates);
    await harness.flushTimers();
    assert.equal(loader.getSnapshot().markerLoadingIndicatorIsVisible, false);
    loader.getSnapshot().handleMarkerLoadingIndicatorHidden();
    assert.equal(loader.getSnapshot().renderMarkerLoadingIndicator, false);
    cleanupCenter();
    cleanupCluster();
    const cleanupReconnected = loader.subscribe(() => {});
    loader.getSnapshot().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(loader.getSnapshot().markerPoints, [marker]);
    cleanupReconnected();
});

test('another display reuses downloaded coverage without sharing viewport state', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    await harness.respond(0, [marker]);
    const car = harness.useMarkerLoader();
    car().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(car().markerPoints, [marker]);
    assert.notStrictEqual(phone, car);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('malformed responses preserve markers and remain retryable', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    await harness.respond(0, [marker]);
    const elsewhere = boundsHelpers.getDrivingMarkerRequiredBounds({
        latitude: 44,
        longitude: -89,
    });
    phone().scheduleMarkerLoad(elsewhere, 0);
    await harness.flushTimers();
    harness.requests[1].resolve({
        ok: true,
        json: async () => ({ message: 'unavailable' }),
    });
    await new Promise(setImmediate);
    assert.deepEqual(phone().markerPoints, [marker]);
    assert.equal(phone().markerLoadError, 'Markers could not be loaded.');
    phone().scheduleMarkerLoad(elsewhere, 0);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 3);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('a hung download times out and allows another request for the same bounds', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    await harness.flushTimers();
    assert.equal(harness.requests[0].signal.aborted, true);
    assert.equal(phone().markersAreLoading, false);
    assert.equal(phone().markerLoadError, 'Markers could not be loaded.');
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    await harness.respond(1, [marker]);
    await harness.respond(0, []);
    assert.deepEqual(phone().markerPoints, [marker]);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('contribution updates invalidate cached coverage before another display loads it', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    await harness.respond(0, [marker]);
    phone().upsertMarkerPoints([
        { ...marker, properties: { osm_id: 123, updated: true } },
    ]);
    assert.equal(phone().markerPoints[0].properties.updated, true);
    const car = harness.useMarkerLoader();
    car().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    assert.equal(harness.requests.length, 2);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('contributions prevent shared in-flight responses from restoring invalidated coverage', async () => {
    const harness = createHarness();
    const phone = harness.useMarkerLoader();
    const car = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    car().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 1);
    const updated = { ...marker, properties: { osm_id: 123, updated: true } };
    phone().upsertMarkerPoints([updated]);
    assert.equal(harness.requests[0].signal.aborted, false);
    await harness.respond(0, [marker]);
    assert.deepEqual(phone().markerPoints, [updated]);
    assert.deepEqual(car().markerPoints, []);
    const reconnected = harness.useMarkerLoader();
    reconnected().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers(1000);
    assert.equal(harness.requests.length, 2, 'invalidated data is not cached');
    await harness.respond(1, [updated]);
    assert.deepEqual(reconnected().markerPoints, [updated]);
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('restart restores stale markers while an offline refresh fails, and retries without camera movement', async () => {
    const entry = {
        bounds: boundsHelpers.expandBoundsForMarkerRequest(bounds),
        points: [marker],
        loadedAt: Date.now() - MARKER_CACHE_FRESH_MS - 1000,
    };
    const harness = createHarness({ stored: JSON.stringify([entry]) });
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    assert.deepEqual(phone().markerPoints, [marker]);
    assert.equal(phone().markerCoverage.loadedAt, entry.loadedAt);
    harness.requests[0].reject(Error('offline'));
    await new Promise(setImmediate);
    assert.deepEqual(phone().markerPoints, [marker]);
    await harness.flushTimers();
    assert.equal(
        harness.requests.length,
        2,
        'automatic recovery without a pan',
    );
    await harness.respond(1, []);
    assert.deepEqual(
        phone().markerPoints,
        [],
        'successful empty area removes deleted cameras',
    );
    assert.equal(phone().markerLoadError, '');
    harness.cleanups.forEach((cleanup) => cleanup());
});

test('late disk hydration cannot overwrite the newer viewport', async () => {
    let resolveCache;
    const harness = createHarness({
        readCache: () =>
            new Promise((resolve) => {
                resolveCache = resolve;
            }),
    });
    const phone = harness.useMarkerLoader();
    phone().scheduleMarkerLoad(bounds, 0);
    await harness.flushTimers();
    const elsewhere = boundsHelpers.getDrivingMarkerRequiredBounds({
        latitude: 44,
        longitude: -89,
    });
    phone().scheduleMarkerLoad(elsewhere, 0);
    await harness.flushTimers();
    resolveCache(
        JSON.stringify([
            {
                bounds: boundsHelpers.expandBoundsForMarkerRequest(bounds),
                points: [marker],
                loadedAt: Date.now(),
            },
        ]),
    );
    await new Promise(setImmediate);
    assert.deepEqual(phone().markerPoints, []);
    assert.equal(harness.requests.length, 1);
    assert.equal(
        new URL(harness.requests[0].url).searchParams.get('sw_lat'),
        String(boundsHelpers.expandBoundsForMarkerRequest(elsewhere).sw_lat),
    );
    harness.cleanups.forEach((cleanup) => cleanup());
});
