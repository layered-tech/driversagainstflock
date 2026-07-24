import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getCurrentPositionForActiveLocationSource,
    getLocationWatchOptions,
    shouldAcceptLocationUpdate,
    shouldUseDeviceLocationWatch,
    shouldUseRoadMatchedLocationWatch,
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
    test('uses the device watcher when road-matched updates are unavailable', () => {
        assert.equal(
            shouldUseDeviceLocationWatch({
                autoDriveSimulationIsActive: false,
                roadMatchedLocationWatchEnabled: false,
                phoneLocationUpdatesAreEnabled: true,
            }),
            true,
        );
    });

    test('defers to road-matched and simulation location sources', () => {
        assert.equal(
            shouldUseDeviceLocationWatch({
                autoDriveSimulationIsActive: false,
                roadMatchedLocationWatchEnabled: true,
                phoneLocationUpdatesAreEnabled: true,
            }),
            false,
        );
        assert.equal(
            shouldUseDeviceLocationWatch({
                autoDriveSimulationIsActive: true,
                roadMatchedLocationWatchEnabled: false,
                phoneLocationUpdatesAreEnabled: true,
            }),
            false,
        );
    });
});

describe('shouldAcceptLocationUpdate', () => {
    test('rejects stale raw fixes while road matching owns location updates', () => {
        assert.equal(
            shouldAcceptLocationUpdate({
                location: { coords: { latitude: 30, longitude: -97 } },
                roadMatchedLocationWatchEnabled: true,
            }),
            false,
        );
    });

    test('accepts matched and unmatched output from the road-matching session', () => {
        assert.equal(
            shouldAcceptLocationUpdate({
                location: { roadMatch: { edgeId: 'road:0:forward' } },
                roadMatchedLocationWatchEnabled: true,
            }),
            true,
        );
        assert.equal(
            shouldAcceptLocationUpdate({
                location: { roadMatch: { isOffRoad: true } },
                roadMatchedLocationWatchEnabled: true,
            }),
            true,
        );
    });

    test('accepts raw fixes when the device watcher owns location updates', () => {
        assert.equal(
            shouldAcceptLocationUpdate({
                location: { coords: { latitude: 30, longitude: -97 } },
                roadMatchedLocationWatchEnabled: false,
            }),
            true,
        );
    });

    test('rejects a stale matcher fix after ownership returns to the device', () => {
        assert.equal(
            shouldAcceptLocationUpdate({
                location: { roadMatch: { edgeId: 'road:0:forward' } },
                roadMatchedLocationWatchEnabled: false,
            }),
            false,
        );
    });
});

describe('getCurrentPositionForActiveLocationSource', () => {
    const rawPosition = {
        coords: { latitude: 30.266984, longitude: -97.74414 },
    };
    const roadMatchedPosition = {
        coords: { latitude: 30.2672, longitude: -97.74414 },
        roadMatch: { edgeId: 'road:0:forward' },
        timestamp: 1234,
    };

    test('uses the current matched fix without requesting a raw position', async () => {
        let rawPositionRequestCount = 0;
        const result = await getCurrentPositionForActiveLocationSource({
            getCurrentPositionAsync: async () => {
                rawPositionRequestCount += 1;
                return rawPosition;
            },
            getLastRoadMatchedLocation: async () => roadMatchedPosition,
            isMountedRef: { current: true },
            roadMatchedLocationWatchEnabledRef: { current: true },
        });

        assert.equal(result, roadMatchedPosition);
        assert.equal(rawPositionRequestCount, 0);
    });

    test('discards an in-flight raw fix after ownership transfers', async () => {
        let resolveRawPosition;
        let markRawPositionRequested;
        const rawPositionRequested = new Promise((resolve) => {
            markRawPositionRequested = resolve;
        });
        const rawPositionPromise = new Promise((resolve) => {
            resolveRawPosition = resolve;
        });
        const ownerRef = { current: false };
        const pendingPosition = getCurrentPositionForActiveLocationSource({
            getCurrentPositionAsync: () => {
                markRawPositionRequested();
                return rawPositionPromise;
            },
            getLastRoadMatchedLocation: async () => roadMatchedPosition,
            isMountedRef: { current: true },
            roadMatchedLocationWatchEnabledRef: ownerRef,
        });

        await rawPositionRequested;
        ownerRef.current = true;
        resolveRawPosition(rawPosition);

        assert.equal(await pendingPosition, roadMatchedPosition);
    });

    test('waits for matcher output instead of falling back to raw GPS', async () => {
        let rawPositionRequestCount = 0;
        const result = await getCurrentPositionForActiveLocationSource({
            getCurrentPositionAsync: async () => {
                rawPositionRequestCount += 1;
                return rawPosition;
            },
            getLastRoadMatchedLocation: async () => null,
            isMountedRef: { current: true },
            roadMatchedLocationWatchEnabledRef: { current: true },
        });

        assert.equal(result, null);
        assert.equal(rawPositionRequestCount, 0);
    });

    test('returns raw GPS while the device watcher owns location', async () => {
        let roadMatchedLocationRequestCount = 0;
        const result = await getCurrentPositionForActiveLocationSource({
            getCurrentPositionAsync: async () => rawPosition,
            getLastRoadMatchedLocation: async () => {
                roadMatchedLocationRequestCount += 1;
                return roadMatchedPosition;
            },
            isMountedRef: { current: true },
            roadMatchedLocationWatchEnabledRef: { current: false },
        });

        assert.equal(result, rawPosition);
        assert.equal(roadMatchedLocationRequestCount, 0);
    });
});

describe('shouldUseRoadMatchedLocationWatch', () => {
    const supportedLocationOptions = {
        autoDriveSimulationIsActive: false,
        locationAccessGranted: true,
        roadMatchingIsSupported: true,
    };

    test('keeps the persistent driving session alive in the background', () => {
        assert.equal(
            shouldUseRoadMatchedLocationWatch({
                ...supportedLocationOptions,
                isDrivingMode: true,
                persistentRoadMatchingWatchIsActive: true,
                phoneLocationUpdatesAreEnabled: false,
            }),
            true,
        );
    });

    test('observes another persistent session only while the phone is active', () => {
        assert.equal(
            shouldUseRoadMatchedLocationWatch({
                ...supportedLocationOptions,
                isDrivingMode: false,
                persistentRoadMatchingWatchIsActive: true,
                phoneLocationUpdatesAreEnabled: true,
            }),
            true,
        );
        assert.equal(
            shouldUseRoadMatchedLocationWatch({
                ...supportedLocationOptions,
                isDrivingMode: false,
                persistentRoadMatchingWatchIsActive: true,
                phoneLocationUpdatesAreEnabled: false,
            }),
            false,
        );
    });

    test('does not start matching without permission or native support', () => {
        assert.equal(
            shouldUseRoadMatchedLocationWatch({
                ...supportedLocationOptions,
                isDrivingMode: true,
                locationAccessGranted: false,
                persistentRoadMatchingWatchIsActive: false,
                phoneLocationUpdatesAreEnabled: true,
            }),
            false,
        );
        assert.equal(
            shouldUseRoadMatchedLocationWatch({
                ...supportedLocationOptions,
                isDrivingMode: true,
                persistentRoadMatchingWatchIsActive: false,
                phoneLocationUpdatesAreEnabled: true,
                roadMatchingIsSupported: false,
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
