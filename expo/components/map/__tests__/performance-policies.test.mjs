import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getLocationWatchOptions,
    shouldUseDeviceLocationWatch,
} from '../location-watch-options.js';
import { createMapPreferencesPersistenceScheduler } from '../map-preferences-persistence.js';

const accuracies = {
    Balanced: 'balanced',
    BestForNavigation: 'navigation',
    High: 'high',
};

describe('getLocationWatchOptions', () => {
    test('uses a low-power policy while the map is idle', () => {
        assert.deepEqual(getLocationWatchOptions({ accuracies }), {
            accuracy: 'balanced',
            distanceInterval: 10,
            timeInterval: 5000,
        });
    });

    test('uses responsive fixes while actively tracking', () => {
        assert.deepEqual(
            getLocationWatchOptions({
                accuracies,
                isLocationTrackingActive: true,
            }),
            {
                accuracy: 'high',
                distanceInterval: 3,
                timeInterval: 1000,
            },
        );
    });

    test('limits navigation fixes to one update per second', () => {
        assert.deepEqual(
            getLocationWatchOptions({ accuracies, isDrivingMode: true }),
            {
                accuracy: 'navigation',
                distanceInterval: 3,
                mayShowUserSettingsDialog: true,
                timeInterval: 1000,
            },
        );
    });
});

describe('shouldUseDeviceLocationWatch', () => {
    test('uses the device watcher when Mapbox map events are unavailable', () => {
        assert.equal(
            shouldUseDeviceLocationWatch({
                autoDriveSimulationIsActive: false,
                enhancedNavigationLocationWatchEnabled: false,
                phoneLocationUpdatesAreEnabled: true,
            }),
            true,
        );
    });

    test('defers to enhanced navigation and simulation location sources', () => {
        assert.equal(
            shouldUseDeviceLocationWatch({
                autoDriveSimulationIsActive: false,
                enhancedNavigationLocationWatchEnabled: true,
                phoneLocationUpdatesAreEnabled: true,
            }),
            false,
        );
        assert.equal(
            shouldUseDeviceLocationWatch({
                autoDriveSimulationIsActive: true,
                enhancedNavigationLocationWatchEnabled: false,
                phoneLocationUpdatesAreEnabled: true,
            }),
            false,
        );
    });
});

describe('createMapPreferencesPersistenceScheduler', () => {
    test('deduplicates values and writes the latest value on the trailing edge', async () => {
        let currentTime = 1000;
        let pendingTimer = null;
        const writes = [];
        const scheduler = createMapPreferencesPersistenceScheduler({
            clearTimeoutFn: () => {
                pendingTimer = null;
            },
            intervalMs: 30_000,
            now: () => currentTime,
            setTimeoutFn: (callback, delay) => {
                pendingTimer = { callback, delay };
                return pendingTimer;
            },
            write: (value) => writes.push(value),
        });

        scheduler.schedule('first');
        scheduler.schedule('first');
        await scheduler.flush();

        assert.deepEqual(writes, ['first']);

        currentTime = 2000;
        scheduler.schedule('second');
        scheduler.schedule('third');

        assert.equal(pendingTimer.delay, 29_000);
        assert.deepEqual(writes, ['first']);

        currentTime = 31_000;
        pendingTimer.callback();
        await scheduler.flush();

        assert.deepEqual(writes, ['first', 'third']);
    });

    test('flushes immediately when a preference changes', async () => {
        let currentTime = 1000;
        let pendingTimer = null;
        const writes = [];
        const scheduler = createMapPreferencesPersistenceScheduler({
            clearTimeoutFn: () => {
                pendingTimer = null;
            },
            intervalMs: 30_000,
            now: () => currentTime,
            setTimeoutFn: (callback, delay) => {
                pendingTimer = { callback, delay };
                return pendingTimer;
            },
            write: (value) => writes.push(value),
        });

        scheduler.schedule('location-one');
        await scheduler.flush();
        currentTime = 2000;
        scheduler.schedule('location-two');
        scheduler.schedule('settings-change', { immediate: true });
        await scheduler.flush();

        assert.equal(pendingTimer, null);
        assert.deepEqual(writes, ['location-one', 'settings-change']);
    });

    test('serializes writes so the newest value finishes last', async () => {
        const writes = [];
        const writeResolvers = [];
        const scheduler = createMapPreferencesPersistenceScheduler({
            now: () => 1000,
            write: (value) => {
                writes.push(value);

                return new Promise((resolve) => writeResolvers.push(resolve));
            },
        });

        scheduler.schedule('older');
        scheduler.schedule('newer', { immediate: true });

        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(writes, ['older']);

        writeResolvers.shift()();
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(writes, ['older', 'newer']);

        writeResolvers.shift()();
        await scheduler.flush();
    });
});
