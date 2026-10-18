import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getDrivingMarkerRequiredBounds } from '../marker-load-bounds.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function createHarness() {
    const effects = [];
    const timers = new Map();
    let nextTimer = 0;
    const source = readFileSync(
        new URL('../../use-android-auto-cluster-markers.js', import.meta.url),
        'utf8',
    );
    const { code } = transformSync(source, {
        babelrc: false,
        configFile: false,
        plugins: ['@babel/plugin-transform-modules-commonjs'],
    });
    const module = { exports: {} };
    const dependencies = {
        react: { useEffect: (effect) => effects.push(effect) },
        './map/marker-load-bounds': { getDrivingMarkerRequiredBounds },
    };
    new Function(
        'require',
        'module',
        'exports',
        'setInterval',
        'clearInterval',
        code,
    )(
        (name) => {
            assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
            return dependencies[name];
        },
        module,
        module.exports,
        (callback, delay) => {
            assert.ok(delay >= 10000, 'recovery must not poll aggressively');
            timers.set(++nextTimer, callback);
            return nextTimer;
        },
        (id) => timers.delete(id),
    );
    return {
        timers,
        mount(options) {
            module.exports.useAndroidAutoClusterMarkers(options);
            return effects.pop()();
        },
        tick() {
            for (const callback of timers.values()) callback();
        },
    };
}

const location = { latitude: 41.88, longitude: -87.63 };

test('cluster loads nearby markers without map-ready or camera-bound events', () => {
    const harness = createHarness();
    const requests = [];
    const cleanup = harness.mount({
        enabled: true,
        userLocation: location,
        scheduleMarkerLoad: (...args) => requests.push(args),
    });
    assert.deepEqual(requests, [[getDrivingMarkerRequiredBounds(location), 0]]);
    harness.tick();
    assert.equal(requests.length, 2, 'retry even while stationary');
    cleanup();
    harness.tick();
    assert.equal(requests.length, 2, 'stop recovery after unmount');
    assert.equal(harness.timers.size, 0);
});

test('cluster reconnect with a new location schedules fresh coverage', () => {
    const harness = createHarness();
    const requests = [];
    const options = {
        enabled: true,
        userLocation: location,
        scheduleMarkerLoad: (bounds) => requests.push(bounds),
    };
    harness.mount(options)();
    const nextLocation = { latitude: 42, longitude: -88 };
    const cleanup = harness.mount({ ...options, userLocation: nextLocation });
    assert.deepEqual(requests, [
        getDrivingMarkerRequiredBounds(location),
        getDrivingMarkerRequiredBounds(nextLocation),
    ]);
    cleanup();
});

test('disabled markers and missing or invalid locations never schedule recovery', () => {
    for (const options of [
        { enabled: false, userLocation: location },
        { enabled: true, userLocation: null },
        { enabled: true, userLocation: { latitude: 100, longitude: 0 } },
    ]) {
        const harness = createHarness();
        harness.mount({
            ...options,
            scheduleMarkerLoad: () => assert.fail('unexpected load'),
        });
        assert.equal(harness.timers.size, 0);
    }
});

test('only the cluster with visible ALPR markers enables location recovery', () => {
    const source = readFileSync(
        new URL('../../auto-play-map-surface-content.js', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /useAndroidAutoClusterMarkers\(\{\s*enabled:\s*isClusterMapSurface\s*&&\s*alertSurfaceVisibility\.surveillanceMarkersVisible,\s*userLocation: mapPreferences\.userLocation,\s*scheduleMarkerLoad: markerLoader\.scheduleMarkerLoad,/,
    );
});
