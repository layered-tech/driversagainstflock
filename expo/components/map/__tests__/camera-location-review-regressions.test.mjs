import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as cameraLifecycle from '../location-puck-camera-follow-lifecycle.js';
import { locationUpdateIsStale } from '../location-watch-options.js';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

function readSource(path) {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function callback(source, name, context) {
    const pending = [parse(source, { sourceType: 'module', plugins: ['jsx'] })];
    while (pending.length) {
        const node = pending.pop();
        if (!node || typeof node !== 'object') continue;
        if (
            node.type === 'VariableDeclaration' &&
            node.declarations.some(
                (declaration) => declaration.id?.name === name,
            )
        ) {
            return new Function(
                ...Object.keys(context),
                `${source.slice(node.start, node.end)}\nreturn ${name};`,
            )(...Object.values(context));
        }
        pending.push(
            ...Object.values(node)
                .flat()
                .filter((value) => value && typeof value === 'object'),
        );
    }
    assert.fail(name);
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

test('a delayed current-position request cannot overwrite or recenter to an older fix', async () => {
    const source = readSource('../use-device-location.js');
    const fix = deferred();
    const newer = { latitude: 41, longitude: -87, recordedAt: 2000 };
    const published = [];
    const context = {
        useCallback: (fn) => fn,
        setIsLocating() {},
        setLocationError() {},
        getCurrentPositionForActiveLocationSource: () => fix.promise,
        Location: {},
        getLastRoadMatchedLocationAsync() {},
        isMountedRef: { current: true },
        roadMatchedLocationWatchEnabledRef: { current: false },
        currentCourseHeadingRef: { current: null },
        getSharedMapUserLocation: () => newer,
        getLocationUpdate: (position) => ({
            ...position.coords,
            recordedAt: position.timestamp,
        }),
        locationUpdateIsStale,
        getLocationCourseHeading: () => null,
        getSmoothedCourseHeading: (_, heading) => heading,
        isRoadMatchedLocationUpdate: () => false,
        setUserLocation: (location) => published.push(location),
    };
    const findCurrentLocation = callback(
        source,
        'findCurrentLocation',
        context,
    );
    const pending = findCurrentLocation();
    fix.resolve({ coords: { latitude: 40, longitude: -88 }, timestamp: 1000 });
    assert.equal(await pending, newer);
    assert.deepEqual(published, []);
});

test('current-position publication preserves the GPS timestamp', async () => {
    const source = readSource('../use-device-location.js');
    const published = [];
    const findCurrentLocation = callback(source, 'findCurrentLocation', {
        useCallback: (fn) => fn,
        setIsLocating() {},
        setLocationError() {},
        getCurrentPositionForActiveLocationSource: async () => ({
            coords: { latitude: 41, longitude: -87 },
            timestamp: 1234,
        }),
        Location: {},
        getLastRoadMatchedLocationAsync() {},
        isMountedRef: { current: true },
        roadMatchedLocationWatchEnabledRef: { current: false },
        currentCourseHeadingRef: { current: null },
        getSharedMapUserLocation: () => null,
        getLocationUpdate: (position) => ({
            ...position.coords,
            recordedAt: position.timestamp,
        }),
        locationUpdateIsStale,
        getLocationCourseHeading: () => null,
        getSmoothedCourseHeading: (_, heading) => heading,
        isRoadMatchedLocationUpdate: () => false,
        setUserLocation: (location) => published.push(location),
    });
    assert.equal((await findCurrentLocation()).recordedAt, 1234);
    assert.equal(published[0].recordedAt, 1234);
});

test('car cluster expansion waits for camera release and cancels after recenter', async () => {
    for (const recenter of [false, true]) {
        const release = deferred();
        const moves = [];
        const generation = { current: 0 };
        const handler = callback(
            readSource('../../auto-play-map-surface-content.js'),
            'handleMarkerSourcePress',
            {
                useCallback: (fn) => fn,
                presenceInterruptRef: { current: null },
                presenceCameraOwnerRef: { current: false },
                getCameraUpdateGuard: () => () => true,
                manualMapGestureGenerationRef: generation,
                markerShapeSourceRef: {
                    current: { getClusterExpansionZoom: async () => 17 },
                },
                clampZoomLevel: (zoom) => zoom,
                markerLoadsEnabledRef: { current: false },
                currentZoomRef: { current: 15 },
                isDrivingMode: true,
                followLocationMode: { pauseUntilRecenter() {} },
                locationPuckCameraFollowReleaseRef: {
                    current: () => release.promise,
                },
                setTrackingMode() {},
                getViewportCameraPadding: () => ({}),
                cameraRef: {
                    current: { setCamera: (stop) => moves.push(stop) },
                },
                getFlatCameraStop: (stop) => stop,
            },
        );
        const pending = handler({
            features: [
                {
                    properties: { cluster: true },
                    geometry: { coordinates: [-87, 41] },
                },
            ],
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(moves.length, 0);
        if (recenter) generation.current += 1;
        release.resolve(true);
        await pending;
        assert.equal(moves.length, recenter ? 0 : 1);
    }
});

test('CarPlay fallback release acknowledges native idle without requesting handset frames', async () => {
    assert.equal(
        typeof cameraLifecycle.waitForLocationPuckCameraFallbackCommit,
        'function',
    );
    let checks = 0;
    const result =
        await cameraLifecycle.waitForLocationPuckCameraFallbackCommit({
            platform: 'ios',
            isCameraIdle: async () => ++checks === 3,
            waitForNextCheck: async () => {},
            waitForFrameCommit: () => assert.fail('handset frame requested'),
        });
    assert.equal(result, true);
    assert.equal(checks, 3);
    assert.equal(
        await cameraLifecycle.waitForLocationPuckCameraFallbackCommit({
            platform: 'ios',
            isCameraIdle: async () => false,
            waitForNextCheck: async () => {},
        }),
        false,
    );
});

test('a failed native idle acknowledgement cannot release fallback camera ownership', async () => {
    let idle = false;
    let checks = 0;
    const gate = cameraLifecycle.createLocationPuckCameraFallbackReleaseGate({
        waitForCameraCommit: async () => {
            checks += 1;
            return idle;
        },
    });
    const pending = gate.release({ fallbackCameraIsFollowing: true });
    gate.handleCameraCommit({ fallbackCameraIsFollowing: false });
    assert.equal(await pending, false);
    idle = true;
    assert.equal(
        await gate.release({ fallbackCameraIsFollowing: false }),
        true,
    );
    assert.equal(checks, 2);
});

test('camera controller replacements do not reapply the startup position', () => {
    const source = readSource('../map-canvas.js');
    const received = [];
    const cameraHasReportedPositionRef = { current: false };
    const initialCameraSettings = {
        centerCoordinate: [-88, 40],
        zoomLevel: 15,
    };
    const handler = callback(source, 'handleMapCameraChanged', {
        useCallback: (fn) => fn,
        cameraHasReportedPositionRef,
        handleCameraChanged: (state) => received.push(state),
    });
    const expression = source.match(/defaultSettings=\{([^}]+)\}/)[1];
    const getDefaults = () =>
        new Function(
            'cameraHasReportedPositionRef',
            'initialCameraSettings',
            `return (${expression});`,
        )(cameraHasReportedPositionRef, initialCameraSettings);
    assert.equal(getDefaults(), initialCameraSettings);
    const state = {
        properties: { center: [-87, 41], zoom: 17, heading: 90, pitch: 55 },
    };
    handler(state);
    assert.deepEqual(received, [state]);
    assert.equal(getDefaults(), undefined);
});

test('phone manual camera moves await ownership, preserve synchronous browsing, and reject stale releases', async () => {
    const source = readSource('../use-map-location-controller.js');
    for (const driving of [false, true]) {
        for (const releaseResult of [false, true]) {
            const release = deferred();
            const generation = { current: 0 };
            const moves = [];
            const apply = callback(source, 'applyManualCameraMove', {
                useCallback: (fn) => fn,
                manualCameraGenerationRef: generation,
                isMountedRef: { current: true },
                clearDrivingModeExitCameraRetry() {},
                isDrivingMode: driving,
                LOCATION_TRACKING_NONE: 'none',
                setTrackingMode() {},
                followLocationMode: { pauseUntilRecenter() {} },
                locationPuckCameraFollowReleaseRef: {
                    current: () => release.promise,
                },
            });
            const result = apply(() => {
                moves.push('move');
                return true;
            });
            if (!driving) {
                assert.equal(result, true);
            } else {
                assert.equal(moves.length, 0);
                release.resolve(releaseResult);
                assert.equal(await result, releaseResult);
            }
            assert.equal(moves.length, !driving || releaseResult ? 1 : 0);
            if (driving) {
                const stale = apply(() =>
                    assert.fail('recenter was overwritten'),
                );
                generation.current += 1;
                assert.equal(await stale, false);
            }
        }
    }
});

test('every phone manual destination delegates to the camera ownership handoff', () => {
    const source = readSource('../use-map-location-controller.js');
    for (const name of [
        'moveCameraToPlace',
        'moveCameraToCoordinate',
        'handleMarkerSourcePress',
        'fitCameraToBounds',
        'fitDrivingCameraToBounds',
    ]) {
        // Compiling the callbacks also catches accidental synchronous returns
        // before the common handoff in any of the supported entry points.
        const text = source.slice(
            source.indexOf(`    const ${name} = useCallback(`),
        );
        assert.match(
            text.slice(0, text.indexOf('\n    const ', 10)),
            /applyManualCameraMove\(/,
            name,
        );
    }
});

test('free-driving car status accepts the shared road match while its permission check is stale', () => {
    const source = readSource('../../auto-play-map-surface-content.js');
    const declaration = source.match(/const freeDriveIsActive = [\s\S]*?;/)[0];
    const resolve = new Function(
        'isRootMapSurface',
        'controller',
        'mapPreferences',
        'isRoadMatchedLocationUpdate',
        `${declaration}\nreturn freeDriveIsActive;`,
    );
    const matched = { roadMatch: { speedLimit: { speedLimitMph: 35 } } };
    for (const isRoot of [false, true]) {
        assert.equal(
            resolve(
                isRoot,
                { roadMatchedLocationWatchEnabled: false },
                { userLocation: matched },
                (location) => Boolean(location?.roadMatch),
            ),
            true,
        );
        assert.equal(
            resolve(
                isRoot,
                { roadMatchedLocationWatchEnabled: false },
                { userLocation: null },
                (location) => Boolean(location?.roadMatch),
            ),
            false,
        );
    }
});

test('a car permission refresh accepts a later phone grant and ignores an unmounted surface', async () => {
    const states = [];
    const errors = [];
    const isMountedRef = { current: true };
    const refresh = callback(
        readSource('../../auto-play-map-surface-content.js'),
        'refreshLocationPermission',
        {
            useCallback: (fn) => fn,
            Location: {
                getForegroundPermissionsAsync: async () => ({ granted: true }),
            },
            hasPreciseLocation: (permission) => permission.granted,
            isMountedRef,
            setLocationAccessGranted: (granted) => states.push(granted),
            setLocationError: (error) => errors.push(error),
        },
    );
    assert.equal(await refresh(), true);
    assert.deepEqual(states, [true]);
    assert.deepEqual(errors, ['']);
    isMountedRef.current = false;
    assert.equal(await refresh(), false);
    assert.deepEqual(states, [true]);
});

test('returning to the phone app refreshes car permission without polling', async () => {
    const source = readSource('../../auto-play-map-surface-content.js');
    const listenerIndex = source.indexOf("AppState.addEventListener('change'");
    const start = source.lastIndexOf('    useEffect(', listenerIndex);
    const end =
        source.indexOf('}, [refreshLocationPermission]);', listenerIndex) +
        '}, [refreshLocationPermission]);'.length;
    assert.ok(start >= 0 && end > start);
    let listener;
    let cleanup;
    let checks = 0;
    let removals = 0;
    new Function(
        'useEffect',
        'AppState',
        'refreshLocationPermission',
        source.slice(start, end),
    )(
        (effect) => {
            cleanup = effect();
        },
        {
            addEventListener: (_event, callback) => {
                listener = callback;
                return { remove: () => removals++ };
            },
        },
        () => checks++,
    );
    listener('background');
    assert.equal(checks, 0);
    listener('active');
    assert.equal(checks, 1);
    cleanup();
    assert.equal(removals, 1);
});
