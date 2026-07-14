import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createLocationBoundCameraFollowState,
    getFallbackCameraFollowProps,
    getLocationUpdateKey,
    getMapboxCameraFollowPadding,
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

test('hands off fallback follow only after the navigation camera owns movement', () => {
    const followProps = {
        enabled: true,
        padding: initialSettings.padding,
        pitch: initialSettings.pitch,
        zoomLevel: initialSettings.zoomLevel,
    };

    const inactiveFollowProps = getFallbackCameraFollowProps(
        followProps,
        'following',
    );

    assert.strictEqual(
        getFallbackCameraFollowProps(followProps, 'idle'),
        followProps,
    );
    assert.strictEqual(
        getFallbackCameraFollowProps(followProps, 'transition_to_overview'),
        followProps,
    );
    assert.deepEqual(inactiveFollowProps, {
        enabled: false,
    });
    assert.strictEqual(
        getFallbackCameraFollowProps({ ...followProps }, 'following'),
        inactiveFollowProps,
    );
    assert.strictEqual(
        getFallbackCameraFollowProps(
            { ...followProps },
            'transition_to_following',
        ),
        inactiveFollowProps,
    );
});

test('leaves Android Auto follow padding to the native navigation camera', () => {
    const followProps = {
        enabled: true,
        padding: initialSettings.padding,
    };

    assert.equal(getMapboxCameraFollowPadding(followProps, true), undefined);
    assert.strictEqual(
        getMapboxCameraFollowPadding(followProps, false),
        initialSettings.padding,
    );
});

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

test('applies a speed setting with the same accepted location update', () => {
    const speedDerivedSettings = {
        ...initialSettings,
        zoomLevel: 16.5,
    };
    const initialState = createLocationBoundCameraFollowState({
        isFollowing: true,
        locationKey: 'location-1',
        settings: initialSettings,
    });
    const updatedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: speedDerivedSettings,
        isFollowing: true,
        locationKey: 'location-2',
        state: initialState,
    });

    assert.deepEqual(updatedState.appliedSettings, speedDerivedSettings);
    assert.equal(updatedState.locationKey, 'location-2');
    assert.equal(updatedState.pendingSettings, null);
});

test('does not leave a prior speed setting queued one location behind', () => {
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
    const firstUpdatedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: firstSpeedSettings,
        isFollowing: true,
        locationKey: 'location-2',
        state: initialState,
    });
    const secondUpdatedState = reconcileLocationBoundCameraFollowState({
        desiredSettings: secondSpeedSettings,
        isFollowing: true,
        locationKey: 'location-3',
        state: firstUpdatedState,
    });

    assert.deepEqual(firstUpdatedState.appliedSettings, firstSpeedSettings);
    assert.equal(firstUpdatedState.pendingSettings, null);
    assert.deepEqual(secondUpdatedState.appliedSettings, secondSpeedSettings);
    assert.equal(secondUpdatedState.pendingSettings, null);
});

test('activates fallback follow without waiting for another location', () => {
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
    assert.equal(startedState.isFollowing, true);
    assert.deepEqual(startedState.appliedSettings, updatedSettings);
    assert.equal(startedState.pendingSettings, null);
});

test('does not treat compass-only changes as accepted position updates', () => {
    const location = {
        compassHeading: 20,
        compassHeadingRecordedAt: 10_500,
        courseHeading: 15,
        latitude: 41.88,
        longitude: -87.63,
        recordedAt: 10_000,
    };
    const headingOnlyLocation = {
        ...location,
        compassHeading: 45,
        compassHeadingRecordedAt: 11_000,
        courseHeading: 40,
    };
    const nextPositionLocation = {
        ...headingOnlyLocation,
        recordedAt: 11_500,
    };

    assert.equal(
        getLocationUpdateKey(headingOnlyLocation),
        getLocationUpdateKey(location),
    );
    assert.notEqual(
        getLocationUpdateKey(nextPositionLocation),
        getLocationUpdateKey(location),
    );
});
