import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createLocationBoundCameraFollowState,
    reconcileLocationBoundCameraFollowState,
} from '../location-bound-camera-follow.js';

const initialSettings = {
    padding: {
        paddingBottom: 24,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 48,
    },
    pitch: 55,
    zoomLevel: 17,
};

test('holds passive follow settings until a fresh location arrives', () => {
    const desiredSettings = {
        ...initialSettings,
        zoomLevel: 16.5,
    };
    const initialState = createLocationBoundCameraFollowState({
        isFollowing: true,
        locationKey: 'location-1',
        settings: initialSettings,
    });
    const queuedState = reconcileLocationBoundCameraFollowState({
        desiredSettings,
        isFollowing: true,
        locationKey: 'location-1',
        state: initialState,
    });

    assert.deepEqual(queuedState.appliedSettings, initialSettings);
    assert.deepEqual(queuedState.pendingSettings, desiredSettings);

    const appliedState = reconcileLocationBoundCameraFollowState({
        desiredSettings,
        isFollowing: true,
        locationKey: 'location-2',
        state: queuedState,
    });

    assert.deepEqual(appliedState.appliedSettings, desiredSettings);
    assert.equal(appliedState.pendingSettings, null);
});

test('keeps only the latest pending settings for a shared location update', () => {
    const initialState = createLocationBoundCameraFollowState({
        isFollowing: true,
        locationKey: 'location-1',
        settings: initialSettings,
    });
    const firstQueuedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: {
            ...initialSettings,
            zoomLevel: 16.5,
        },
        isFollowing: true,
        locationKey: 'location-1',
        state: initialState,
    });
    const latestSettings = {
        ...initialSettings,
        padding: {
            ...initialSettings.padding,
            paddingTop: 96,
        },
        zoomLevel: 16,
    };
    const latestQueuedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: latestSettings,
        isFollowing: true,
        locationKey: 'location-1',
        state: firstQueuedState,
    });
    const appliedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: latestSettings,
        isFollowing: true,
        locationKey: 'location-2',
        state: latestQueuedState,
    });

    assert.deepEqual(latestQueuedState.pendingSettings, latestSettings);
    assert.deepEqual(appliedState.appliedSettings, latestSettings);
    assert.equal(appliedState.pendingSettings, null);
});

test('holds a setting derived from the current location until the following fix', () => {
    const speedDerivedSettings = {
        ...initialSettings,
        zoomLevel: 16.5,
    };
    const initialState = createLocationBoundCameraFollowState({
        isFollowing: true,
        locationKey: 'location-1',
        settings: initialSettings,
    });
    const deferredState = reconcileLocationBoundCameraFollowState({
        deferSettingsUntilNextLocation: true,
        desiredSettings: speedDerivedSettings,
        isFollowing: true,
        locationKey: 'location-2',
        state: initialState,
    });

    assert.deepEqual(deferredState.appliedSettings, initialSettings);
    assert.deepEqual(deferredState.pendingSettings, speedDerivedSettings);

    const appliedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: speedDerivedSettings,
        isFollowing: true,
        locationKey: 'location-3',
        state: deferredState,
    });

    assert.deepEqual(appliedState.appliedSettings, speedDerivedSettings);
    assert.equal(appliedState.pendingSettings, null);
});

test('applies the prior speed setting while queueing the latest one', () => {
    const firstSpeedSettings = {
        ...initialSettings,
        zoomLevel: 16.5,
    };
    const secondSpeedSettings = {
        ...initialSettings,
        zoomLevel: 16,
    };
    const initialState = createLocationBoundCameraFollowState({
        isFollowing: true,
        locationKey: 'location-1',
        settings: initialSettings,
    });
    const firstDeferredState = reconcileLocationBoundCameraFollowState({
        deferSettingsUntilNextLocation: true,
        desiredSettings: firstSpeedSettings,
        isFollowing: true,
        locationKey: 'location-2',
        state: initialState,
    });
    const secondDeferredState = reconcileLocationBoundCameraFollowState({
        deferSettingsUntilNextLocation: true,
        desiredSettings: secondSpeedSettings,
        isFollowing: true,
        locationKey: 'location-3',
        state: firstDeferredState,
    });

    assert.deepEqual(secondDeferredState.appliedSettings, firstSpeedSettings);
    assert.deepEqual(secondDeferredState.pendingSettings, secondSpeedSettings);
});

test('applies settings immediately while not following or when follow starts', () => {
    const updatedSettings = {
        ...initialSettings,
        zoomLevel: 18,
    };
    const inactiveState = createLocationBoundCameraFollowState({
        isFollowing: false,
        locationKey: 'location-1',
        settings: initialSettings,
    });
    const configuredState = reconcileLocationBoundCameraFollowState({
        desiredSettings: updatedSettings,
        isFollowing: false,
        locationKey: 'location-1',
        state: inactiveState,
    });
    const startedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: updatedSettings,
        isFollowing: true,
        locationKey: 'location-1',
        state: configuredState,
    });

    assert.deepEqual(configuredState.appliedSettings, updatedSettings);
    assert.deepEqual(startedState.appliedSettings, updatedSettings);
    assert.equal(startedState.pendingSettings, null);
});
