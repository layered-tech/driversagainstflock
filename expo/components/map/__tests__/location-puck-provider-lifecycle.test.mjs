import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createLocationPuckProviderLifecycle } from '../location-puck-provider-lifecycle.js';

function makeProviderLocation(longitude, latitude, heading, recordedAt) {
    return {
        coordinate: [longitude, latitude],
        heading,
        recordedAt,
    };
}

function makeDeferred() {
    let resolve;

    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
}

function requestProvider(
    lifecycle,
    mapView,
    providerLocation,
    { attachmentKey = 1, enabled = true } = {},
) {
    return lifecycle.request({
        attachmentKey,
        enabled,
        mapViewRef: { current: mapView },
        providerLocation,
    });
}

describe('location puck provider lifecycle', () => {
    test('updates one installed provider without clearing between fixes', async () => {
        const calls = [];
        const mapView = { id: 'map-a' };
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async (mapViewCapture) => {
                calls.push(['clear', mapViewCapture.current.id]);
                return true;
            },
            updateLocationPuck: async (mapViewCapture, location) => {
                calls.push([
                    'update',
                    mapViewCapture.current.id,
                    location.coordinate,
                    location.heading,
                    location.recordedAt,
                ]);
                return true;
            },
        });

        await requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );
        await requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.2, 30.2, 92, 2_000),
        );

        assert.deepEqual(calls, [
            ['update', 'map-a', [-97.1, 30.1], 90, 1_000],
            ['update', 'map-a', [-97.2, 30.2], 92, 2_000],
        ]);
        assert.equal(lifecycle.getStatus(), 'native');
    });

    test('retains only the newest fix behind an in-flight native update', async () => {
        const firstUpdateStarted = makeDeferred();
        const finishFirstUpdate = makeDeferred();
        const calls = [];
        const mapView = { id: 'map-a' };
        let updateCount = 0;
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async () => true,
            updateLocationPuck: async (_mapViewCapture, location) => {
                updateCount += 1;
                calls.push(['update', location.recordedAt]);

                if (updateCount === 1) {
                    firstUpdateStarted.resolve();
                    await finishFirstUpdate.promise;
                }

                return true;
            },
        });

        const firstRequest = requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );

        await firstUpdateStarted.promise;

        const supersededRequest = requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.2, 30.2, 92, 2_000),
        );
        const latestRequest = requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.3, 30.3, 94, 3_000),
        );

        finishFirstUpdate.resolve();

        assert.deepEqual(
            await Promise.all([firstRequest, supersededRequest, latestRequest]),
            [true, false, true],
        );
        assert.deepEqual(calls, [
            ['update', 1_000],
            ['update', 3_000],
        ]);
    });

    test('reasserts a new attachment epoch on the same map without clearing', async () => {
        const calls = [];
        const mapView = { id: 'map-a' };
        const providerLocation = makeProviderLocation(-97.1, 30.1, 90, 1_000);
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async (mapViewCapture) => {
                calls.push(['clear', mapViewCapture.current.id]);
                return true;
            },
            updateLocationPuck: async (mapViewCapture, location) => {
                calls.push([
                    'update',
                    mapViewCapture.current.id,
                    location.recordedAt,
                ]);
                return true;
            },
        });

        await requestProvider(lifecycle, mapView, providerLocation);
        await requestProvider(lifecycle, mapView, providerLocation, {
            attachmentKey: 2,
        });

        assert.deepEqual(calls, [
            ['update', 'map-a', 1_000],
            ['update', 'map-a', 1_000],
        ]);
    });

    test('clears the old map before updating only the newest replacement', async () => {
        const firstUpdateStarted = makeDeferred();
        const finishFirstUpdate = makeDeferred();
        const calls = [];
        const mapA = { id: 'map-a' };
        const mapB = { id: 'map-b' };
        let updateCount = 0;
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async (mapViewCapture) => {
                calls.push(['clear', mapViewCapture.current.id]);
                return true;
            },
            updateLocationPuck: async (mapViewCapture, location) => {
                updateCount += 1;
                calls.push([
                    'update',
                    mapViewCapture.current.id,
                    location.recordedAt,
                ]);

                if (updateCount === 1) {
                    firstUpdateStarted.resolve();
                    await finishFirstUpdate.promise;
                }

                return true;
            },
        });

        const firstRequest = requestProvider(
            lifecycle,
            mapA,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );

        await firstUpdateStarted.promise;

        const supersededReplacement = requestProvider(
            lifecycle,
            mapB,
            makeProviderLocation(-97.2, 30.2, 92, 2_000),
            { attachmentKey: 2 },
        );
        const latestReplacement = requestProvider(
            lifecycle,
            mapB,
            makeProviderLocation(-97.3, 30.3, 94, 3_000),
            { attachmentKey: 2 },
        );

        finishFirstUpdate.resolve();
        await Promise.all([
            firstRequest,
            supersededReplacement,
            latestReplacement,
        ]);

        assert.deepEqual(calls, [
            ['update', 'map-a', 1_000],
            ['clear', 'map-a'],
            ['update', 'map-b', 3_000],
        ]);
    });

    test('clears partial native ownership before publishing stable fallback', async () => {
        const cleanupStarted = makeDeferred();
        const finishCleanup = makeDeferred();
        const calls = [];
        const statuses = [];
        const mapView = { id: 'map-a' };
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async (mapViewCapture) => {
                calls.push(['clear', mapViewCapture.current.id]);
                cleanupStarted.resolve();
                await finishCleanup.promise;
                return true;
            },
            onStatusChange: (status) => statuses.push(status),
            updateLocationPuck: async (mapViewCapture, location) => {
                calls.push([
                    'update',
                    mapViewCapture.current.id,
                    location.recordedAt,
                ]);
                return false;
            },
        });

        const failedRequest = requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );

        await cleanupStarted.promise;

        assert.equal(lifecycle.getStatus(), 'recovering');
        assert.equal(statuses.includes('fallback'), false);

        const queuedFallbackUpdate = requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.2, 30.2, 92, 2_000),
        );

        finishCleanup.resolve();
        assert.deepEqual(
            await Promise.all([failedRequest, queuedFallbackUpdate]),
            [false, false],
        );
        assert.equal(lifecycle.getStatus(), 'fallback');

        const fallbackUpdate = await requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.3, 30.3, 94, 3_000),
        );

        assert.equal(fallbackUpdate, false);
        assert.deepEqual(calls, [
            ['update', 'map-a', 1_000],
            ['clear', 'map-a'],
        ]);
    });

    test('retries fallback only after a new attachment and preparation pass', async () => {
        const calls = [];
        const statuses = [];
        const mapView = { id: 'map-a' };
        let updateCount = 0;
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async (mapViewCapture) => {
                calls.push(['clear', mapViewCapture.current.id]);
                return true;
            },
            onStatusChange: (status) => statuses.push(status),
            updateLocationPuck: async (mapViewCapture) => {
                updateCount += 1;
                calls.push(['update', mapViewCapture.current.id, updateCount]);
                return updateCount > 1;
            },
        });
        const providerLocation = makeProviderLocation(-97.1, 30.1, 90, 1_000);

        await requestProvider(lifecycle, mapView, providerLocation);

        assert.equal(lifecycle.getStatus(), 'fallback');

        const preparation = await requestProvider(
            lifecycle,
            mapView,
            providerLocation,
            { attachmentKey: 2 },
        );

        assert.equal(preparation, false);
        assert.equal(lifecycle.getStatus(), 'preparing-native');
        assert.equal(updateCount, 1);

        assert.equal(
            await requestProvider(lifecycle, mapView, providerLocation, {
                attachmentKey: 2,
            }),
            true,
        );
        assert.equal(lifecycle.getStatus(), 'native');
        assert.deepEqual(calls, [
            ['update', 'map-a', 1],
            ['clear', 'map-a'],
            ['update', 'map-a', 2],
        ]);
        assert.ok(statuses.includes('preparing-native'));
    });

    test('recovers a fallback on the same attachment after a bounded delay', async () => {
        const calls = [];
        const mapView = { id: 'map-a' };
        let currentTime = 1_000;
        let updateCount = 0;
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async () => true,
            fallbackRetryDelayMs: 2_000,
            now: () => currentTime,
            updateLocationPuck: async (_mapViewCapture, location) => {
                updateCount += 1;
                calls.push(location.recordedAt);
                return updateCount > 1;
            },
        });

        await requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );

        currentTime = 2_999;
        assert.equal(
            await requestProvider(
                lifecycle,
                mapView,
                makeProviderLocation(-97.2, 30.2, 92, 2_000),
            ),
            false,
        );
        assert.equal(lifecycle.getStatus(), 'fallback');

        currentTime = 3_000;
        assert.equal(
            await requestProvider(
                lifecycle,
                mapView,
                makeProviderLocation(-97.3, 30.3, 94, 3_000),
            ),
            false,
        );
        assert.equal(lifecycle.getStatus(), 'preparing-native');

        assert.equal(
            await requestProvider(
                lifecycle,
                mapView,
                makeProviderLocation(-97.3, 30.3, 94, 3_000),
            ),
            true,
        );
        assert.equal(lifecycle.getStatus(), 'native');
        assert.deepEqual(calls, [1_000, 3_000]);
    });

    test('keeps disable as a cleanup barrier before re-enabling', async () => {
        const firstUpdateStarted = makeDeferred();
        const finishFirstUpdate = makeDeferred();
        const calls = [];
        const mapView = { id: 'map-a' };
        let updateCount = 0;
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async (mapViewCapture) => {
                calls.push(['clear', mapViewCapture.current.id]);
                return true;
            },
            updateLocationPuck: async (_mapViewCapture, location) => {
                updateCount += 1;
                calls.push(['update', location.recordedAt]);

                if (updateCount === 1) {
                    firstUpdateStarted.resolve();
                    await finishFirstUpdate.promise;
                }

                return true;
            },
        });

        const firstRequest = requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );

        await firstUpdateStarted.promise;

        const disableRequest = requestProvider(lifecycle, mapView, null, {
            enabled: false,
        });
        const reenableRequest = requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.3, 30.3, 94, 3_000),
        );

        finishFirstUpdate.resolve();
        await Promise.all([firstRequest, disableRequest, reenableRequest]);

        assert.deepEqual(calls, [
            ['update', 1_000],
            ['clear', 'map-a'],
            ['update', 3_000],
        ]);
        assert.equal(lifecycle.getStatus(), 'native');
    });

    test('invalidates an in-flight update, drops pending work, and clears once', async () => {
        const updateStarted = makeDeferred();
        const finishUpdate = makeDeferred();
        const calls = [];
        const statuses = [];
        const mapA = { id: 'map-a' };
        const mapB = { id: 'map-b' };
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async (mapViewCapture) => {
                calls.push(['clear', mapViewCapture.current.id]);
                return true;
            },
            onStatusChange: (status) => statuses.push(status),
            updateLocationPuck: async (mapViewCapture) => {
                calls.push(['update', mapViewCapture.current.id]);
                updateStarted.resolve();
                await finishUpdate.promise;
                return true;
            },
        });

        const firstRequest = requestProvider(
            lifecycle,
            mapA,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );

        await updateStarted.promise;

        const pendingRequest = requestProvider(
            lifecycle,
            mapB,
            makeProviderLocation(-97.2, 30.2, 92, 2_000),
            { attachmentKey: 2 },
        );
        const invalidation = lifecycle.invalidate();
        const ignoredRequest = requestProvider(
            lifecycle,
            mapB,
            makeProviderLocation(-97.3, 30.3, 94, 3_000),
            { attachmentKey: 2 },
        );

        finishUpdate.resolve();

        assert.deepEqual(
            await Promise.all([
                firstRequest,
                pendingRequest,
                invalidation,
                ignoredRequest,
            ]),
            [false, false, true, false],
        );
        assert.deepEqual(calls, [
            ['update', 'map-a'],
            ['clear', 'map-a'],
        ]);
        assert.deepEqual(statuses, ['pending']);
    });

    test('does not clear a working provider for invalid same-map data', async () => {
        const calls = [];
        const mapView = { id: 'map-a' };
        const lifecycle = createLocationPuckProviderLifecycle({
            clearLocationPuck: async () => {
                calls.push(['clear']);
                return true;
            },
            updateLocationPuck: async (_mapViewCapture, location) => {
                calls.push(['update', location.recordedAt]);
                return true;
            },
        });

        await requestProvider(
            lifecycle,
            mapView,
            makeProviderLocation(-97.1, 30.1, 90, 1_000),
        );
        const invalidUpdate = await requestProvider(lifecycle, mapView, {
            coordinate: [Number.NaN, 30.2],
        });

        assert.equal(invalidUpdate, false);
        assert.equal(lifecycle.getStatus(), 'native');
        assert.deepEqual(calls, [['update', 1_000]]);
    });
});
