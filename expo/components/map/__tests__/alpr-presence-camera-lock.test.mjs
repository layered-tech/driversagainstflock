import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPresenceCameraDiagnostics } from '../alpr-presence-debug.js';
import { getLocationPuckCameraFollowFallbackProps } from '../location-puck-camera-follow-lifecycle.js';

const source = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const callbacks = source.slice(
    source.indexOf('    const focusPresenceCamera = useCallback('),
    source.indexOf('    const scheduleMarkerLoad = useCallback('),
);
const settle = () => new Promise((resolve) => setImmediate(resolve));
function harness() {
    const events = [];
    const effects = [];
    let locked = false;
    let release;
    const refs = {
        isMapReadyRef: { current: true },
        isMountedRef: { current: true },
        cameraRef: {
            current: { setCamera: (camera) => events.push(['camera', camera]) },
        },
        presenceCameraGenerationRef: { current: 0 },
        manualMapGestureGenerationRef: { current: 0 },
        presenceCameraOwnerRef: { current: false },
        presenceCameraFocusRef: { current: null },
        presenceCameraDiagnosticsRef: {
            current: createPresenceCameraDiagnostics(),
        },
        viewportMetricsRef: { current: { cameraPadding: undefined } },
        presenceCameraReleaseRef: { current: null },
        presenceCameraCommitRef: { current: null },
        pendingCameraStopRef: { current: { camera: 'old' } },
        userLocationRef: { current: { latitude: 43, longitude: -88 } },
        presenceFollowModeRef: {
            current: {
                pauseUntilRecenter: () => events.push(['pause']),
                recenter: (location) => events.push(['recenter', location]),
            },
        },
        locationPuckCameraFollowReleaseRef: {
            current: (options) => {
                events.push(['release', options]);
                return options?.resumeFollow
                    ? Promise.resolve(false)
                    : new Promise((resolve) => {
                          release = resolve;
                      });
            },
        },
    };
    const values = {
        ...refs,
        cameraUpdatesAreAllowed: () => !refs.presenceCameraOwnerRef.current,
        useCallback: (callback) => callback,
        useEffect: (callback) => effects.push(callback),
        viewportMetrics: { key: 'initial' },
        setPresenceCameraLockGeneration: (value) => {
            locked = value !== null;
        },
    };
    const api = new Function(
        ...Object.keys(values),
        `${source.slice(source.indexOf('    const getCameraUpdateGuard = useCallback('), source.indexOf('    const presenceFollowModeRef ='))}\n${callbacks}\nreturn { focusPresenceCamera, restorePresenceCamera, getCameraUpdateGuard };`,
    )(...Object.values(values));
    return {
        ...api,
        refs,
        events,
        updateViewport: (padding) => {
            refs.viewportMetricsRef.current = { cameraPadding: padding };
            effects.forEach((effect) => effect());
        },
        get locked() {
            return locked;
        },
        commit: () => refs.presenceCameraCommitRef.current?.(true),
        release: () => release?.(true),
    };
}

test('focus waits for follow-disabled React commit and native release before applying the node camera', async () => {
    const h = harness();
    const camera = { centerCoordinate: [-88, 43], pitch: 55, zoomLevel: 17 };
    const pending = h.focusPresenceCamera(camera, () => true);
    assert.equal(h.locked, true);
    await settle();
    assert.equal(
        h.events.some(([type]) => type === 'release'),
        false,
    );
    h.commit();
    await settle();
    assert.equal(
        h.events.some(([type]) => type === 'release'),
        true,
    );
    assert.equal(
        h.events.some(([type]) => type === 'camera'),
        false,
    );
    h.release();
    assert.equal(await pending, true);
    assert.deepEqual(
        h.events.filter(([type]) => type === 'camera'),
        [['camera', camera]],
    );
    assert.equal(h.locked, true);
    h.restorePresenceCamera();
    assert.equal(h.locked, false);
    assert.deepEqual(h.events.at(-1), [
        'recenter',
        h.refs.userLocationRef.current,
    ]);
});

test('manual interruption before commit cancels a pending focus and does not resume following', async () => {
    const h = harness();
    const pending = h.focusPresenceCamera({}, () => true);
    h.restorePresenceCamera(true);
    h.commit();
    await settle();
    h.release();
    assert.equal(await pending, false);
    assert.equal(h.locked, false);
    assert.equal(
        h.events.some(([type]) => type === 'camera' || type === 'recenter'),
        false,
    );
});

test('presence uses the overview follow gate, including RNMapbox fallback after native failure', () => {
    const expression = source.match(
        /followIsEnabled:\s*([\s\S]*?),\n\s*followSpeedZoomEnabled/,
    )[1];
    const enabled = new Function(
        'drivingMapViewMode',
        'presenceCameraIsLocked',
        'DRIVING_MAP_VIEW_ROUTE_OVERVIEW',
        `return (${expression});`,
    );
    for (const [mode, locked, expected] of [
        ['perspective', false, true],
        ['perspective', true, false],
        ['route-overview', false, false],
        ['route-overview', true, false],
    ]) {
        const value = enabled(mode, locked, 'route-overview');
        assert.equal(value, expected);
        assert.equal(
            getLocationPuckCameraFollowFallbackProps({
                followProps: { enabled: value },
                mapIsReady: true,
                nativeFollowIsSupported: true,
                nativeFollowStatus: 'failed',
                platform: 'android',
            }).followUserLocation,
            expected,
        );
    }
});

test('GPS fixes update the puck but cannot start following or change zoom while confirmation owns the camera', async () => {
    const h = harness();
    const updates = [];
    const writes = [];
    const handlerSource = source.slice(
        source.indexOf('    const handleUserLocationUpdate = useCallback('),
        source.indexOf('    // While the Play Store auto-drive simulation'),
    );
    const values = {
        ...h.refs,
        useCallback: (callback) => callback,
        shouldAcceptLocationUpdate: () => true,
        getLocationUpdate: (location) => location,
        locationUpdateIsStale: () => false,
        getLocationCourseHeading: (location) => location.heading,
        getDrivingMotionState: ({ locationCourseHeading }) => ({
            courseHeading: locationCourseHeading,
        }),
        getLocationWithDrivingMotionState: ({ nextLocation }) => nextLocation,
        getSmoothedCourseHeading: (_old, next) => next,
        roadMatchedLocationWatchEnabledRef: { current: true },
        currentCourseHeadingRef: { current: 90 },
        currentCompassHeadingRef: { current: 90 },
        mapBrowsingContextIsActiveRef: { current: false },
        locationTrackingModeRef: { current: 'follow' },
        LOCATION_TRACKING_FOLLOW: 'follow',
        isDrivingMode: true,
        setUserLocation: (location) => updates.push(location),
        lockOnLocationMode: {
            handleLocationUpdate: () => {
                writes.push('lock-on');
                return false;
            },
        },
        followLocationMode: {
            start: () => writes.push('start'),
            handleLocationUpdate: () => writes.push('speed zoom'),
        },
    };
    const handleLocation = new Function(
        ...Object.keys(values),
        `${handlerSource}\nreturn handleUserLocationUpdate;`,
    )(...Object.values(values));
    const pending = h.focusPresenceCamera({}, () => true);
    for (let i = 0; i < 20; i++) {
        values.locationTrackingModeRef.current = i % 2 ? 'none' : 'follow';
        handleLocation({
            latitude: 43 + i * 0.0001,
            longitude: -88,
            speed: 20 + i / 10,
            heading: 90,
            recordedAt: 100000 + i * 1000,
        });
    }
    assert.equal(updates.length, 20);
    assert.deepEqual(writes, []);
    h.commit();
    await settle();
    h.release();
    assert.equal(await pending, true);
    h.restorePresenceCamera();
    assert.deepEqual(h.events.at(-1), ['recenter', updates.at(-1)]);
    values.locationTrackingModeRef.current = 'follow';
    handleLocation({
        latitude: 43.002,
        longitude: -88,
        recordedAt: 120000,
        heading: 90,
    });
    assert.deepEqual(writes, ['lock-on', 'speed zoom']);
});

test('confirmation centers in the latest safe area after release and subsequent host inset changes', async () => {
    const h = harness();
    const camera = {
        centerCoordinate: [-88, 43],
        pitch: 55,
        zoomLevel: 17,
        heading: 90,
        padding: {
            paddingTop: 0,
            paddingLeft: 0,
            paddingRight: 0,
            paddingBottom: 0,
        },
    };
    const pending = h.focusPresenceCamera(camera, () => true);
    h.commit();
    await settle();
    const padding = {
        paddingTop: 100,
        paddingLeft: 300,
        paddingRight: 20,
        paddingBottom: 40,
    };
    h.updateViewport(padding);
    assert.equal(
        h.events.some(([type]) => type === 'camera'),
        false,
    );
    h.release();
    assert.equal(await pending, true);
    assert.deepEqual(h.events.at(-1), ['camera', { ...camera, padding }]);
    const updatedPadding = { ...padding, paddingTop: 180 };
    h.updateViewport(updatedPadding);
    assert.deepEqual(h.events.at(-1), [
        'camera',
        { ...camera, padding: updatedPadding, animationDuration: 0 },
    ]);
    h.restorePresenceCamera(true);
    const eventCount = h.events.length;
    h.updateViewport(padding);
    assert.equal(h.events.length, eventCount);
});

test('a bounds fit started before confirmation cannot overwrite it after native release', async () => {
    const h = harness();
    let releaseFit;
    const camera = { centerCoordinate: [-88.1, 43.1] };
    const values = {
        ...h.refs,
        useCallback: (callback) => callback,
        AUTO_PLAY_ROUTE_PREVIEW_CAMERA_FIT_DURATION_MS: 500,
        getCameraPadding: (padding) => padding,
        getViewportCameraPadding: () => ({}),
        mergeCameraPadding: (padding) => padding,
        getBoundsFitCameraStop: () => ({ zoomLevel: 12 }),
        isDrivingMode: true,
        followLocationMode: h.refs.presenceFollowModeRef.current,
        setTrackingMode: () => {},
        markerLoadsEnabledRef: { current: true },
        currentZoomRef: { current: 17 },
        getCameraUpdateGuard: h.getCameraUpdateGuard,
    };
    const fitSource = source.slice(
        source.indexOf('    const fitCameraToBounds = useCallback('),
        source.indexOf('    const pauseFollowForManualMapGesture'),
    );
    const fit = new Function(
        ...Object.keys(values),
        `${fitSource}\nreturn fitCameraToBounds;`,
    )(...Object.values(values));
    const originalRelease = h.refs.locationPuckCameraFollowReleaseRef.current;
    h.refs.locationPuckCameraFollowReleaseRef.current = () =>
        new Promise((resolve) => {
            releaseFit = resolve;
        });
    const fitting = fit({});
    h.refs.locationPuckCameraFollowReleaseRef.current = originalRelease;
    const focusing = h.focusPresenceCamera(camera, () => true);
    h.commit();
    await settle();
    h.release();
    assert.equal(await focusing, true);
    releaseFit(true);
    assert.equal(await fitting, false);
    assert.deepEqual(
        h.events.filter(([type]) => type === 'camera'),
        [['camera', camera]],
    );
});

for (const finishAfterDismissal of [false, true]) {
    test(`location hydration cannot restore an obsolete owner (dismissed: ${finishAfterDismissal})`, async () => {
        const h = harness();
        let finishLocation;
        const started = [];
        const values = {
            ...h.refs,
            getCameraUpdateGuard: h.getCameraUpdateGuard,
            Location: {
                getForegroundPermissionsAsync: async () => ({ granted: true }),
            },
            hasPreciseLocation: () => true,
            isActive: true,
            setLocationAccessGranted: () => {},
            setLocationError: () => {},
            locationUpdatesEnabledRef: { current: true },
            findCurrentLocation: () =>
                new Promise((resolve) => {
                    finishLocation = resolve;
                }),
            isDrivingModeRef: { current: true },
            mapBrowsingContextIsActiveRef: { current: false },
            followLocationMode: { start: (value) => started.push(value) },
            lockOnLocationMode: { start: (value) => started.push(value) },
        };
        const hydrationSource = source.slice(
            source.indexOf('        async function hydrateLocationAccess()'),
            source.indexOf('        hydrateLocationAccess();'),
        );
        const hydrate = new Function(
            ...Object.keys(values),
            `${hydrationSource}\nreturn hydrateLocationAccess;`,
        )(...Object.values(values));
        const hydrating = hydrate();
        await settle();
        const focusing = h.focusPresenceCamera({}, () => true);
        h.commit();
        await settle();
        h.release();
        assert.equal(await focusing, true);
        if (finishAfterDismissal) h.restorePresenceCamera(true);
        finishLocation({ latitude: 43, longitude: -88 });
        await hydrating;
        assert.deepEqual(started, []);
    });
}

test('replacement confirmation and unmount cancel obsolete focus requests', async () => {
    const h = harness();
    const first = h.focusPresenceCamera({ zoomLevel: 14 }, () => true);
    h.restorePresenceCamera(true);
    const second = h.focusPresenceCamera({ zoomLevel: 17 }, () => true);
    h.commit();
    await settle();
    h.release();
    assert.equal(await first, false);
    assert.equal(await second, true);
    assert.deepEqual(
        h.events.filter(([type]) => type === 'camera'),
        [['camera', { zoomLevel: 17 }]],
    );
    h.restorePresenceCamera(true);
    const third = h.focusPresenceCamera({}, () => true);
    h.commit();
    await settle();
    h.refs.isMountedRef.current = false;
    h.release();
    assert.equal(await third, false);
    assert.equal(h.events.filter(([type]) => type === 'camera').length, 1);
});
