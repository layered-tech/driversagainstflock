import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createWeatherStore } from '../weather-store.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const modules = require('@babel/plugin-transform-modules-commonjs');
const settle = async () => {
    for (let index = 0; index < 12; index++) {
        await Promise.resolve();
    }
};

function runtimeHarness() {
    let locationListener;
    let appListener;
    let activeRoot;
    let locationSubscriptions = 0;
    let locationRemovals = 0;
    let appRemovals = 0;
    const calls = [];
    const timers = new Map();
    let sequence = 0;
    const time = Date.parse('2026-10-01T12:00:00Z');
    const location = {
        latitude: 40,
        longitude: -100,
        recordedAt: time,
        locationProvider: 'expo-location',
    };
    const client = {
        async getObservation(actual) {
            calls.push(actual);
            return {
                condition: 'Rain',
                observedAt: time,
                fresh: true,
                stationLocation: actual,
            };
        },
    };
    const mocks = {
        react: {
            useEffect(callback) {
                activeRoot.cleanups.push(callback());
            },
            useSyncExternalStore(subscribe, snapshot) {
                activeRoot.cleanups.push(subscribe(() => {}));
                return snapshot();
            },
        },
        'react-native': {
            AppState: {
                currentState: 'active',
                addEventListener(name, listener) {
                    assert.equal(name, 'change');
                    appListener = listener;
                    return {
                        remove() {
                            appRemovals++;
                            appListener = null;
                        },
                    };
                },
            },
        },
        '../../lib/private-cache-storage': {
            getPrivateCacheItem: async () => null,
            setPrivateCacheItem: async () => {},
        },
        './accepted-device-location': {
            getLatestAcceptedDeviceLocation: () => location,
            addAcceptedDeviceLocationListener(listener) {
                locationSubscriptions++;
                locationListener = listener;
                return {
                    remove() {
                        locationRemovals++;
                        locationListener = null;
                    },
                };
            },
        },
        './weather-nws-client': { createNwsWeatherClient: () => client },
        './weather-store': {
            createWeatherStore: (options) =>
                createWeatherStore({
                    ...options,
                    now: () => time,
                    setTimeoutFn: (callback) => {
                        const id = ++sequence;
                        timers.set(id, callback);
                        return id;
                    },
                    clearTimeoutFn: (id) => timers.delete(id),
                }),
        },
    };
    const transformed = transformSync(
        readFileSync(new URL('../weather-runtime.js', import.meta.url), 'utf8'),
        {
            babelrc: false,
            configFile: false,
            plugins: [modules],
        },
    ).code;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', transformed)(
        (name) => {
            assert.ok(name in mocks, `Unexpected dependency ${name}`);
            return mocks[name];
        },
        module,
        module.exports,
    );
    return {
        runtime: module.exports,
        calls,
        timers,
        emitLocation(value) {
            locationListener?.(value);
        },
        emitAppState(value) {
            appListener?.(value);
        },
        subscriptions: () => ({
            locationSubscriptions,
            locationRemovals,
            appRemovals,
        }),
        mount(car) {
            activeRoot = { cleanups: [] };
            const root = activeRoot;
            module.exports.useWeatherSurface(car);
            return () => root.cleanups.forEach((cleanup) => cleanup?.());
        },
    };
}

test('phone/car runtime shares subscriptions, real device location, and request state', async () => {
    const harness = runtimeHarness();
    const releasePhone = harness.mount(false);
    const releaseCar = harness.mount(true);
    await settle();
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.subscriptions().locationSubscriptions, 1);
    assert.equal(harness.runtime.weatherStore.getSnapshot().rendered, 'Rain');
    harness.emitLocation({
        latitude: 35,
        longitude: -90,
        locationProvider: 'auto-drive-simulation',
    });
    assert.deepEqual(harness.runtime.weatherStore.getSnapshot().location, {
        latitude: 40,
        longitude: -100,
    });
    harness.emitAppState('background');
    assert.equal(
        harness.timers.size,
        1,
        'car retains weather timers with phone in background',
    );
    releasePhone();
    assert.equal(harness.subscriptions().locationRemovals, 0);
    harness.runtime.weatherStore.setMode('Snow');
    assert.equal(harness.runtime.weatherStore.getSnapshot().rendered, 'Snow');
    releaseCar();
    assert.equal(harness.timers.size, 0);
    assert.deepEqual(harness.subscriptions(), {
        locationSubscriptions: 1,
        locationRemovals: 1,
        appRemovals: 1,
    });
    const reconnect = harness.mount(true);
    await settle();
    assert.equal(harness.subscriptions().locationSubscriptions, 2);
    assert.equal(
        harness.calls.length,
        1,
        'reconnection before refresh deadline shares cached state',
    );
    assert.equal(harness.runtime.weatherStore.getSnapshot().rendered, 'Snow');
    reconnect();
});

test('phone-only runtime pauses in background and resumes on foreground', async () => {
    const harness = runtimeHarness();
    const release = harness.mount(false);
    await settle();
    assert.equal(harness.timers.size, 1);
    harness.emitAppState('background');
    assert.equal(harness.timers.size, 0);
    harness.emitAppState('active');
    assert.equal(harness.timers.size, 1);
    release();
    assert.equal(harness.timers.size, 0);
});
