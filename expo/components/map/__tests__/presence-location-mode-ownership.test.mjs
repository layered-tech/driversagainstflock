import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getFollowZoomUpdate } from '../follow-zoom-update.js';

const require = createRequire(import.meta.url);

function loadHook(filename, hookName, events) {
    const { code } = require('@babel/core').transformSync(
        readFileSync(new URL(filename, import.meta.url), 'utf8'),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                require.resolve('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    );
    const mocks = {
        react: {
            useCallback: (fn) => fn,
            useMemo: (fn) => fn(),
            useRef: (value) => ({ current: value }),
            useState: (value) => [
                value,
                (next) => events.push(['state', next]),
            ],
            useEffect: () => {},
        },
        'react-native': { useWindowDimensions: () => ({ height: 800 }) },
        '../lib/safe-area-insets': { useSafeAreaInsets: () => ({ bottom: 0 }) },
        './map-location-mode-shared': {
            EMPTY_CAMERA_PADDING: {},
            getCameraPadding: (value) => value ?? {},
            getLocationCoordinate: (value) => [value.longitude, value.latitude],
            getTrackingZoomLevel: (ref) => ref.current,
            LOCATION_CAMERA_CENTER_ANIMATION_DURATION_MS: 100,
            LOCATION_CAMERA_CENTER_ANIMATION_MODE: 'easeTo',
            LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS: 100,
            LOCATION_TRACKING_FOLLOW: 'follow',
            LOCATION_TRACKING_LOCK_ON: 'lock-on',
            LOCATION_TRACKING_NONE: 'none',
            LOCATION_ZOOM_LEVEL: 17,
        },
        './map/follow-camera-padding': { getFollowCameraPadding: () => ({}) },
        './map/follow-zoom-update': { getFollowZoomUpdate },
    };
    const exports = {};
    new Function('require', 'exports', code)((name) => {
        assert.ok(mocks[name], name);
        return mocks[name];
    }, exports);
    return exports[hookName];
}

for (const mode of ['follow', 'lock-on']) {
    test(`${mode} callbacks from before confirmation cannot mutate camera or tracking while it owns the camera`, () => {
        const events = [];
        let allowed = true;
        const hook = loadHook(
            mode === 'follow'
                ? '../../map-follow-location-mode.js'
                : '../../map-lock-on-location-mode.js',
            mode === 'follow'
                ? 'useFollowLocationMode'
                : 'useLockOnLocationMode',
            events,
        );
        const location = { latitude: 43, longitude: -88, speed: 22 };
        const options = {
            cameraUpdatesAreAllowed: () => allowed,
            cameraRef: {
                current: {
                    setCamera: (camera) => events.push(['camera', camera]),
                },
            },
            currentZoomRef: { current: 17 },
            clampZoomLevel: (value) => value,
            isDrivingMode: true,
            isMapReadyRef: { current: true },
            locationTrackingMode: mode,
            locationTrackingModeRef: { current: mode },
            markerLoadsEnabledRef: { current: true },
            pendingCameraStopRef: { current: null },
            setTrackingMode: (value) => events.push(['tracking', value]),
            moveCameraToUser: (value) => events.push(['move', value]),
            userLocationRef: { current: location },
            followSpeedZoomEnabled: true,
        };
        const controller = hook(options);
        controller.start(location);
        assert.ok(events.length > 0);
        events.length = 0;
        allowed = false;
        controller.start(location);
        controller.startAfterPermissionGrant(location);
        controller.handleLocationUpdate(mode, location);
        controller.handleZoomLevelChange(mode, 12, location);
        controller.recenter?.(location);
        controller.keepSyncedAfterZoomChange?.(mode);
        controller.orientNorthUp?.(location);
        assert.deepEqual(events, []);
        assert.equal(options.pendingCameraStopRef.current, null);
        allowed = true;
        controller.start(location);
        assert.ok(events.some(([type]) => type === 'tracking'));
    });
}

test('MapCanvas requires both native and fallback camera release to succeed', async () => {
    const source = readFileSync(
        new URL('../map-canvas.js', import.meta.url),
        'utf8',
    );
    const callback = source.slice(
        source.indexOf(
            '    const releaseLocationPuckCameraFollow = useCallback(',
        ),
        source.indexOf(
            '    useLayoutEffect(() => {\n        locationPuckCameraFallbackReleaseGate.handleCameraCommit',
        ),
    );
    for (const nativeReleased of [false, true]) {
        for (const fallbackReleased of [false, true]) {
            const values = {
                useCallback: (fn) => fn,
                locationPuckCameraFallbackReleaseGate: {
                    release: async () => fallbackReleased,
                },
                locationPuckCameraFollowLifecycle: {
                    release: async () => nativeReleased,
                },
                locationPuckMapLoadEpoch: 1,
                mapViewRef: { current: {} },
                mapboxFallbackCameraIsFollowing: false,
                nativeLocationPuckCameraControllerIsEligible: true,
                nativeLocationPuckCameraFollowProps: {},
            };
            const release = new Function(
                ...Object.keys(values),
                `${callback}\nreturn releaseLocationPuckCameraFollow;`,
            )(...Object.values(values));
            assert.equal(await release(), nativeReleased && fallbackReleased);
        }
    }
});
