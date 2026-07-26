import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createLocationPuckCameraFollowLifecycle,
    getLocationPuckCameraControllerKey,
    getLocationPuckCameraFollowFallbackProps,
} from '../location-puck-camera-follow-lifecycle.js';

const defaultFollowProps = {
    enabled: true,
    padding: {
        paddingBottom: 320,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 72,
    },
    pitch: 55,
    zoomLevel: 16.5,
};

function requestFollow(lifecycle, mapViewRef, overrides = {}) {
    return lifecycle.request({
        attachmentKey: overrides.attachmentKey ?? 1,
        cameraIsPrepared: overrides.cameraIsPrepared ?? false,
        followProps: {
            ...defaultFollowProps,
            enabled: overrides.enabled ?? defaultFollowProps.enabled,
            zoomLevel: overrides.zoomLevel ?? 16.5,
        },
        mapViewRef,
    });
}

describe('location puck camera follow fallback', () => {
    test('enables Mapbox fallback when a supported native handoff fails', () => {
        const pendingNativeProps = getLocationPuckCameraFollowFallbackProps({
            followProps: defaultFollowProps,
            followUserMode: 'follow-with-heading',
            nativeFollowIsSupported: true,
            nativeFollowStatus: 'inactive',
            platform: 'ios',
        });
        const activeNativeProps = getLocationPuckCameraFollowFallbackProps({
            followProps: defaultFollowProps,
            followUserMode: 'follow-with-heading',
            nativeFollowIsSupported: true,
            nativeFollowStatus: 'active',
            platform: 'ios',
        });
        const preparingNativeProps = getLocationPuckCameraFollowFallbackProps({
            followProps: defaultFollowProps,
            followUserMode: 'follow-with-heading',
            nativeFollowIsSupported: true,
            nativeFollowStatus: 'preparing-native',
            platform: 'ios',
        });
        const failedNativeProps = getLocationPuckCameraFollowFallbackProps({
            followProps: defaultFollowProps,
            followUserMode: 'follow-with-heading',
            nativeFollowIsSupported: true,
            nativeFollowStatus: 'failed',
            platform: 'ios',
        });

        assert.deepEqual(pendingNativeProps, { followUserLocation: false });
        assert.deepEqual(activeNativeProps, { followUserLocation: false });
        assert.deepEqual(preparingNativeProps, {
            followUserLocation: false,
        });
        assert.deepEqual(failedNativeProps, {
            followPadding: defaultFollowProps.padding,
            followPitch: defaultFollowProps.pitch,
            followUserLocation: true,
            followUserMode: 'follow-with-heading',
            followZoomLevel: defaultFollowProps.zoomLevel,
        });
    });

    test('remounts an idle camera before replacing fallback ownership', () => {
        assert.equal(
            getLocationPuckCameraControllerKey({
                nativeFollowIsSupported: true,
                nativeFollowStatus: 'failed',
            }),
            'mapbox-location-puck-camera-fallback',
        );
        assert.equal(
            getLocationPuckCameraControllerKey({
                nativeFollowIsSupported: true,
                nativeFollowStatus: 'preparing-native',
            }),
            'native-location-puck-camera',
        );
        assert.equal(
            getLocationPuckCameraControllerKey({
                nativeFollowIsSupported: true,
                nativeFollowStatus: 'active',
            }),
            'native-location-puck-camera',
        );
    });

    test('keeps fallback disabled when follow itself is disabled', () => {
        const fallbackProps = getLocationPuckCameraFollowFallbackProps({
            followProps: {
                ...defaultFollowProps,
                enabled: false,
            },
            followUserMode: 'follow-with-heading',
            nativeFollowIsSupported: false,
            nativeFollowStatus: 'inactive',
            platform: 'android',
        });

        assert.equal(fallbackProps.followUserLocation, false);
        assert.equal(fallbackProps.followPadding, undefined);
    });
});

describe('location puck camera follow lifecycle', () => {
    test('updates one native follow state without location-driven camera stops', async () => {
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (mapView, followProps) => {
                calls.push({ followProps, mapView: mapView.current });
                return true;
            },
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestFollow(lifecycle, mapViewRef);
        await requestFollow(lifecycle, mapViewRef);
        await requestFollow(lifecycle, mapViewRef, { zoomLevel: 16 });

        assert.equal(calls.length, 2);
        assert.equal(calls[0].mapView, mapViewRef.current);
        assert.equal(calls[1].followProps.zoomLevel, 16);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('retries after post-commit verification observes a late idle', async () => {
        const calls = [];
        let isFollowing = false;
        let waitCount = 0;
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);
                isFollowing = followProps.enabled;
                return true;
            },
            verifyCameraFollow: async () => isFollowing,
            waitForCameraCommit: async () => {
                waitCount += 1;

                if (waitCount === 1) {
                    isFollowing = false;
                }
            },
        });

        assert.equal(
            await requestFollow(lifecycle, { current: { id: 'map' } }),
            true,
        );
        assert.deepEqual(calls, [true, true]);
        assert.equal(waitCount, 2);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('reattaches an idled native viewport on zoom and style updates', async () => {
        const viewport = { isFollowing: false, transitionCount: 0 };
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                if (followProps.enabled) {
                    viewport.isFollowing = true;
                    viewport.transitionCount += 1;
                }

                return true;
            },
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestFollow(lifecycle, mapViewRef);

        viewport.isFollowing = false;
        await requestFollow(lifecycle, mapViewRef, { zoomLevel: 16 });

        assert.equal(viewport.isFollowing, true);
        assert.equal(viewport.transitionCount, 2);

        viewport.isFollowing = false;
        await requestFollow(lifecycle, mapViewRef, {
            attachmentKey: 2,
            zoomLevel: 16,
        });

        assert.equal(viewport.isFollowing, true);
        assert.equal(viewport.transitionCount, 3);
    });

    test('disables the owned viewport before following a replacement map', async () => {
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (mapView, followProps) => {
                calls.push([mapView.current.id, followProps.enabled]);
                return true;
            },
        });
        const mapViewRef = { current: { id: 'first' } };

        await requestFollow(lifecycle, mapViewRef);
        mapViewRef.current = { id: 'second' };
        await requestFollow(lifecycle, mapViewRef, { attachmentKey: 2 });

        assert.deepEqual(calls, [
            ['first', true],
            ['first', false],
            ['second', true],
        ]);
    });

    test('disables an in-flight viewport before following a replacement map', async () => {
        let finishFirstEnable;
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (mapView, followProps) => {
                calls.push([mapView.current.id, followProps.enabled]);

                if (mapView.current.id === 'first' && followProps.enabled) {
                    await new Promise((resolve) => {
                        finishFirstEnable = resolve;
                    });
                }

                return true;
            },
        });
        const mapViewRef = { current: { id: 'first' } };
        const firstRequest = requestFollow(lifecycle, mapViewRef);

        await new Promise((resolve) => setImmediate(resolve));

        mapViewRef.current = { id: 'second' };
        const secondRequest = requestFollow(lifecycle, mapViewRef, {
            attachmentKey: 2,
        });

        finishFirstEnable();
        await Promise.all([firstRequest, secondRequest]);

        assert.deepEqual(calls, [
            ['first', true],
            ['first', false],
            ['second', true],
        ]);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('holds a failed handoff for its attachment until follow is stopped', async () => {
        const calls = [];
        const statuses = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);
                return false;
            },
            onStatusChange: (status) => statuses.push(status),
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestFollow(lifecycle, mapViewRef);
        await requestFollow(lifecycle, mapViewRef, { zoomLevel: 16 });

        assert.deepEqual(calls, [true, false]);
        assert.equal(lifecycle.getStatus(), 'failed');

        await requestFollow(lifecycle, mapViewRef, { enabled: false });

        assert.deepEqual(calls, [true, false, false]);
        assert.equal(lifecycle.getStatus(), 'inactive');
        assert.deepEqual(statuses, [
            'activating',
            'failed',
            'clearing',
            'inactive',
        ]);
    });

    test('prepares an idle camera before retrying a failed native handoff', async () => {
        let enableCallCount = 0;
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);

                if (!followProps.enabled) {
                    return true;
                }

                enableCallCount += 1;
                return enableCallCount > 1;
            },
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestFollow(lifecycle, mapViewRef);
        await requestFollow(lifecycle, mapViewRef, { zoomLevel: 16 });
        assert.deepEqual(calls, [true, false]);

        assert.equal(
            await requestFollow(lifecycle, mapViewRef, { attachmentKey: 2 }),
            false,
        );
        assert.equal(lifecycle.getStatus(), 'preparing-native');
        assert.deepEqual(calls, [true, false]);

        await requestFollow(lifecycle, mapViewRef, { attachmentKey: 2 });
        assert.deepEqual(calls, [true, false]);

        await requestFollow(lifecycle, mapViewRef, {
            attachmentKey: 2,
            cameraIsPrepared: true,
        });

        assert.deepEqual(calls, [true, false, true]);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('prepares an idle camera before retrying on a replacement map', async () => {
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (mapView, followProps) => {
                calls.push([mapView.current.id, followProps.enabled]);
                return mapView.current.id === 'replacement';
            },
        });
        const mapViewRef = { current: { id: 'failed-view' } };

        await requestFollow(lifecycle, mapViewRef);
        await requestFollow(lifecycle, mapViewRef, { zoomLevel: 16 });

        mapViewRef.current = { id: 'replacement' };
        assert.equal(
            await requestFollow(lifecycle, mapViewRef, { attachmentKey: 2 }),
            false,
        );
        assert.equal(lifecycle.getStatus(), 'preparing-native');
        await requestFollow(lifecycle, mapViewRef, {
            attachmentKey: 2,
            cameraIsPrepared: true,
        });

        assert.deepEqual(calls, [
            ['failed-view', true],
            ['failed-view', false],
            ['replacement', true],
        ]);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('exposes a thrown native handoff failure without retrying its attachment', async () => {
        let callCount = 0;
        const statuses = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async () => {
                callCount += 1;
                throw new Error('map view is temporarily unavailable');
            },
            onStatusChange: (status) => statuses.push(status),
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestFollow(lifecycle, mapViewRef);
        await requestFollow(lifecycle, mapViewRef, { zoomLevel: 16 });

        assert.equal(callCount, 2);
        assert.equal(lifecycle.getStatus(), 'failed');
        assert.deepEqual(statuses, ['activating', 'failed']);
    });

    test('waits for partial native cleanup before publishing fallback', async () => {
        let finishCleanup;
        const calls = [];
        const statuses = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);

                if (!followProps.enabled) {
                    await new Promise((resolve) => {
                        finishCleanup = resolve;
                    });
                }

                return false;
            },
            onStatusChange: (status) => statuses.push(status),
        });
        const mapViewRef = { current: { id: 'map' } };
        const request = requestFollow(lifecycle, mapViewRef);

        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(calls, [true, false]);
        assert.equal(lifecycle.getStatus(), 'activating');
        assert.deepEqual(statuses, ['activating']);

        finishCleanup();
        await request;

        assert.equal(lifecycle.getStatus(), 'failed');
        assert.deepEqual(statuses, ['activating', 'failed']);
    });

    test('keeps a replacement attachment queued behind failed-view cleanup', async () => {
        let finishCleanup;
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (mapView, followProps) => {
                calls.push([mapView.current.id, followProps.enabled]);

                if (mapView.current.id === 'first' && !followProps.enabled) {
                    await new Promise((resolve) => {
                        finishCleanup = resolve;
                    });
                }

                return mapView.current.id === 'replacement';
            },
        });
        const mapViewRef = { current: { id: 'first' } };
        const failedRequest = requestFollow(lifecycle, mapViewRef);

        await new Promise((resolve) => setImmediate(resolve));

        mapViewRef.current = { id: 'replacement' };
        const replacementRequest = requestFollow(lifecycle, mapViewRef, {
            attachmentKey: 2,
        });

        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(calls, [
            ['first', true],
            ['first', false],
        ]);

        finishCleanup();
        await Promise.all([failedRequest, replacementRequest]);

        assert.deepEqual(calls, [
            ['first', true],
            ['first', false],
            ['replacement', true],
        ]);
        assert.equal(lifecycle.getStatus(), 'active');
    });

    test('queues disable behind an in-flight native enable', async () => {
        let finishEnable;
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);

                if (followProps.enabled) {
                    await new Promise((resolve) => {
                        finishEnable = resolve;
                    });
                }

                return true;
            },
        });
        const mapViewRef = { current: { id: 'map' } };
        const enabling = requestFollow(lifecycle, mapViewRef);

        await new Promise((resolve) => setImmediate(resolve));

        const disabling = requestFollow(lifecycle, mapViewRef, {
            enabled: false,
        });

        finishEnable();
        await Promise.all([enabling, disabling]);

        assert.deepEqual(calls, [true, false]);
        assert.equal(lifecycle.getStatus(), 'inactive');
    });

    test('clears native follow ownership when invalidated', async () => {
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);
                return true;
            },
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestFollow(lifecycle, mapViewRef);
        await lifecycle.invalidate();

        assert.deepEqual(calls, [true, false]);
    });

    test('attempts to idle a failed native attachment when invalidated', async () => {
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);
                return false;
            },
        });
        const mapViewRef = { current: { id: 'map' } };

        await requestFollow(lifecycle, mapViewRef);
        await lifecycle.invalidate();

        assert.deepEqual(calls, [true, false, false]);
    });

    test('clears an in-flight native follow when invalidated', async () => {
        let finishEnable;
        const calls = [];
        const lifecycle = createLocationPuckCameraFollowLifecycle({
            configureCameraFollow: async (_mapView, followProps) => {
                calls.push(followProps.enabled);

                if (followProps.enabled) {
                    await new Promise((resolve) => {
                        finishEnable = resolve;
                    });
                }

                return true;
            },
        });
        const mapViewRef = { current: { id: 'map' } };
        const enabling = requestFollow(lifecycle, mapViewRef);

        await new Promise((resolve) => setImmediate(resolve));

        const invalidating = lifecycle.invalidate();

        finishEnable();
        await Promise.all([enabling, invalidating]);

        assert.deepEqual(calls, [true, false]);
    });
});
