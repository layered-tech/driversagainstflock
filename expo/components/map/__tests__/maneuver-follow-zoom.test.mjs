import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const modules = new Map();
const nativeModules = {
    'crashlytics.js': { addCrashlyticsLog() {} },
    'config.js': { buildApiURL: () => 'https://road-corridor.test' },
    'api-mocks.js': { mapApiMocksAreEnabled: () => false },
    'place-details-cache.js': {},
    'shared-map-preferences-sync.js': {},
};

function loadMapModule(url) {
    const nativeModule = nativeModules[url.pathname.split('/').at(-1)];
    if (nativeModule) {
        return nativeModule;
    }
    if (url.pathname.endsWith('/constants.js')) {
        return {
            EMPTY_FEATURE_COLLECTION: {
                type: 'FeatureCollection',
                features: [],
            },
        };
    }

    if (modules.has(url.href)) {
        return modules.get(url.href).exports;
    }

    const module = { exports: {} };
    modules.set(url.href, module);
    const source = transformSync(readFileSync(url, 'utf8'), {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
    }).code;
    new Function('require', 'module', 'exports', source)(
        (specifier) =>
            loadMapModule(new URL(`${specifier.replace(/\.js$/, '')}.js`, url)),
        module,
        module.exports,
    );
    return module.exports;
}

const directions = loadMapModule(new URL('../directions.js', import.meta.url));

const route = directions.normalizeDirectionsRoute({
    coordinates: [
        [0, 0],
        [0.02, 0],
        [0.02, 0.02],
    ],
    maneuvers: [
        { type: 11, way_points: [0, 1] },
        { type: 1, way_points: [1, 2] },
        { type: 10, way_points: [2, 2] },
    ],
});
const epoch = 1800000000000;
function location(longitude, latitude = 0, recordedAt = epoch) {
    return { longitude, latitude, speed: 65 * 0.44704, recordedAt };
}

Object.assign(nativeModules, {
    'react.js': {
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
        useState: (value) => [
            typeof value === 'function' ? value() : value,
            () => {},
        ],
        useRef: (value) => ({ current: value }),
        useEffect: () => {},
    },
    'react-native.js': {
        Platform: { OS: 'android' },
        useWindowDimensions: () => ({ height: 800 }),
    },
    'safe-area-insets.js': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'map-location-mode-shared.js': {
        EMPTY_CAMERA_PADDING: {},
        getCameraPadding: (value) => value ?? {},
        LOCATION_TRACKING_FOLLOW: 'follow',
        LOCATION_TRACKING_NONE: 'none',
        LOCATION_ZOOM_LEVEL: 17,
    },
});
const { getFollowSpeedZoomLevel, useFollowLocationMode } = loadMapModule(
    new URL('../../map-follow-location-mode.js', import.meta.url),
);

test('north-up keeps native location follow enabled and tracks speed zoom three levels farther out', () => {
    const makeFollow = (northUp) => {
        const currentZoomRef = { current: 17 };
        const hook = useFollowLocationMode({
            cameraRef: { current: { setCamera() {} } },
            cameraUpdatesAreAllowed: () => true,
            clampZoomLevel: (value) => value,
            currentZoomRef,
            followHeading: northUp ? 0 : undefined,
            followPitch: northUp ? 0 : 55,
            followZoomOffset: northUp ? -3 : 0,
            followSpeedZoomEnabled: true,
            isDrivingMode: true,
            locationTrackingMode: 'follow',
            locationTrackingModeRef: { current: 'follow' },
            markerLoadsEnabledRef: { current: true },
            navigationRoute: null,
            setTrackingMode() {},
            userLocationRef: { current: null },
        });
        return { hook, currentZoomRef };
    };
    const perspective = makeFollow(false);
    const northUp = makeFollow(true);
    assert.equal(northUp.hook.nativeCameraFollowProps.enabled, true);
    assert.equal(northUp.hook.nativeCameraFollowProps.heading, 0);
    assert.equal(northUp.hook.nativeCameraFollowProps.pitch, 0);
    assert.equal(perspective.hook.nativeCameraFollowProps.heading, undefined);
    for (const [index, speedMph] of [0, 30, 45, 65].entries()) {
        const fix = {
            longitude: index / 100,
            latitude: 0,
            heading: index * 45,
            speed: speedMph * 0.44704,
            recordedAt: epoch + index * 10000,
        };
        for (const { hook } of [perspective, northUp]) {
            hook.handleLocationUpdate('follow', fix);
        }
        assert.equal(
            northUp.currentZoomRef.current,
            perspective.currentZoomRef.current - 3,
        );
        assert.equal(northUp.hook.nativeCameraFollowProps.heading, 0);
    }
});

test('switching north-up on and off immediately recalculates zoom, including after manual zoom', (t) => {
    const slots = [];
    let cursor = 0;
    let effects = [];
    const react = nativeModules['react.js'];
    t.mock.method(react, 'useRef', (value) => {
        const index = cursor++;
        slots[index] ??= { current: value };
        return slots[index];
    });
    t.mock.method(react, 'useState', (value) => {
        const index = cursor++;
        slots[index] ??= {
            value: typeof value === 'function' ? value() : value,
        };
        return [
            slots[index].value,
            (next) => {
                slots[index].value = next;
            },
        ];
    });
    t.mock.method(react, 'useEffect', (effect) => {
        effects.push(effect);
    });
    const fix = {
        longitude: 0,
        latitude: 0,
        speed: 45 * 0.44704,
        recordedAt: epoch,
    };
    const options = {
        cameraRef: { current: { setCamera() {} } },
        cameraUpdatesAreAllowed: () => true,
        clampZoomLevel: (value) => value,
        currentZoomRef: { current: 17 },
        followZoomOffset: 0,
        followPitch: 55,
        followSpeedZoomEnabled: true,
        isDrivingMode: true,
        locationTrackingMode: 'follow',
        locationTrackingModeRef: { current: 'follow' },
        markerLoadsEnabledRef: { current: true },
        navigationRoute: null,
        setTrackingMode() {},
        userLocationRef: { current: fix },
    };
    const render = () => {
        cursor = 0;
        effects = [];
        const hook = useFollowLocationMode(options);
        effects.forEach((effect) => effect());
        return hook;
    };
    let hook = render();
    hook.start(fix);
    hook = render();
    const followZoom = hook.nativeCameraFollowProps.zoomLevel;
    hook.handleZoomLevelChange('follow', 20);
    assert.equal(render().nativeCameraFollowProps.zoomLevel, 20);
    Object.assign(options, {
        followZoomOffset: -3,
        followPitch: 0,
        followHeading: 0,
    });
    render();
    hook = render();
    assert.equal(hook.nativeCameraFollowProps.enabled, true);
    assert.equal(hook.nativeCameraFollowProps.zoomLevel, followZoom - 3);
    assert.equal(hook.nativeCameraFollowProps.heading, 0);
    assert.equal(hook.nativeCameraFollowProps.pitch, 0);
    Object.assign(options, {
        followZoomOffset: 0,
        followPitch: 55,
        followHeading: undefined,
    });
    render();
    hook = render();
    assert.equal(hook.nativeCameraFollowProps.zoomLevel, followZoom);
    assert.equal(hook.nativeCameraFollowProps.pitch, 55);
    assert.equal(hook.nativeCameraFollowProps.heading, undefined);
});

test('speed-derived follow zoom changes only at bracket boundaries', () => {
    const zoomAtMph = (speedMph) =>
        getFollowSpeedZoomLevel(speedMph * 0.44704, (zoom) => zoom);

    for (const [speedMph, zoomLevel] of [
        [0, 18.5],
        [25, 18.5],
        [29.99, 18.5],
        [30, 18.25],
        [34.99, 18.25],
        [35, 17.5],
        [37, 17.5],
        [39.99, 17.5],
        [40, 16.75],
        [44.99, 16.75],
        [45, 16],
        [49.99, 16],
        [50, 15.25],
        [54.99, 15.25],
        [55, 14.5],
        [64.99, 14.5],
        [65, 13.75],
        [80, 13.75],
    ]) {
        assert.equal(zoomAtMph(speedMph), zoomLevel, `${speedMph} mph`);
    }

    assert.equal(
        getFollowSpeedZoomLevel(NaN, (zoom) => zoom),
        18.5,
    );
});

test('shared follow keeps speed zoom near turns and respects manual zoom, panning and camera ownership', (t) => {
    let now = epoch;
    t.mock.method(Date, 'now', () => now);
    let allowed = true;
    const currentZoomRef = { current: 17 };
    const userLocationRef = { current: location(0.01) };
    const hook = useFollowLocationMode({
        cameraRef: { current: { setCamera() {} } },
        cameraUpdatesAreAllowed: () => allowed,
        clampZoomLevel: (value) => value,
        currentZoomRef,
        followSpeedZoomEnabled: true,
        isDrivingMode: true,
        locationTrackingMode: 'follow',
        locationTrackingModeRef: { current: 'follow' },
        markerLoadsEnabledRef: { current: true },
        navigationRoute: route,
        setTrackingMode() {},
        userLocationRef,
    });
    hook.start(userLocationRef.current);
    assert.equal(currentZoomRef.current, 13.75);
    for (let second = 1; second <= 15; second++) {
        now = epoch + second * 1000;
        hook.handleLocationUpdate('follow', location(0.0199, 0, now));
    }
    assert.equal(currentZoomRef.current, 13.75);
    hook.handleZoomLevelChange('follow', 16);
    now += 1000;
    hook.handleLocationUpdate('follow', location(0.0199, 0, now));
    assert.equal(currentZoomRef.current, 16);
    hook.recenter(location(0.0199, 0, now));
    assert.equal(currentZoomRef.current, 13.75);
    allowed = false;
    now += 1000;
    hook.handleLocationUpdate('follow', location(0.01, 0, now));
    assert.equal(currentZoomRef.current, 13.75);
    allowed = true;
    hook.pauseUntilRecenter();
    now += 1000;
    hook.handleLocationUpdate('follow', location(0.01, 0, now));
    assert.equal(currentZoomRef.current, 13.75);
});

test('phone and automotive follow no longer depend on route or maneuver state', () => {
    const source = readFileSync(
        new URL('../../map-follow-location-mode.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /navigationRoute|maneuverZoom/);
});

test('shared follow holds adjacent speed reversals until stable and still follows larger changes quickly', () => {
    const currentZoomRef = { current: 17 };
    const hook = useFollowLocationMode({
        cameraRef: { current: { setCamera() {} } },
        clampZoomLevel: (value) => value,
        currentZoomRef,
        followSpeedZoomEnabled: true,
        isDrivingMode: true,
        locationTrackingMode: 'follow',
        locationTrackingModeRef: { current: 'follow' },
        markerLoadsEnabledRef: { current: true },
        setTrackingMode() {},
        userLocationRef: { current: null },
    });
    const fix = (mph, seconds) => ({
        ...location(0, 0, epoch + seconds * 1000),
        speed: mph * 0.44704,
    });
    hook.start(fix(49.8, 0));
    hook.handleLocationUpdate('follow', fix(50.2, 1));
    assert.equal(currentZoomRef.current, 15.25);
    for (const [seconds, mph] of [
        [2, 49.9],
        [3, 50.1],
        [4, 49.8],
        [5, 50.2],
    ]) {
        hook.handleLocationUpdate('follow', fix(mph, seconds));
        assert.equal(
            currentZoomRef.current,
            15.25,
            `${mph} mph at ${seconds}s`,
        );
    }
    for (const seconds of [6, 7, 8, 9, 10]) {
        hook.handleLocationUpdate('follow', fix(49, seconds));
        assert.equal(currentZoomRef.current, 15.25);
    }
    hook.handleLocationUpdate('follow', fix(49, 11));
    assert.equal(currentZoomRef.current, 16);
    hook.handleLocationUpdate('follow', fix(50.1, 12));
    assert.equal(currentZoomRef.current, 16);
    hook.handleLocationUpdate('follow', fix(55, 13));
    assert.equal(currentZoomRef.current, 14.5);
    hook.handleLocationUpdate('follow', fix(35, 14));
    assert.equal(currentZoomRef.current, 17.5);
    hook.handleZoomLevelChange('follow', 18);
    hook.handleLocationUpdate('follow', fix(65, 15));
    assert.equal(currentZoomRef.current, 18);
    hook.recenter(fix(50, 16));
    assert.equal(currentZoomRef.current, 15.25);
    hook.handleLocationUpdate('follow', fix(49, 17));
    assert.equal(
        currentZoomRef.current,
        16,
        'recenter clears reversal history',
    );
});

// Exercise the scenarios formerly handled by the maneuver zoom controller through
// the shared camera hook: only speed now determines automatic zoom.
for (const [scenario, fixes] of [
    ['approaching a turn', [location(0.01), location(0.019), location(0.0199)]],
    [
        'passing a turn',
        [location(0.0199), location(0.02, 0.0001), location(0.02, 0.01)],
    ],
    ['arrival', [location(0.02, 0.0199), location(0.02, 0.02)]],
    ['nearby second turns', [location(0.02, 0.0001), location(0.0201, 0.0002)]],
    [
        'roundabout entry and exit',
        [
            { ...location(0.0199), roadMatch: { isRoundabout: true } },
            { ...location(0.02, 0.001), roadMatch: { isRoundabout: false } },
        ],
    ],
    ['off-route driving', [location(0.0199, 0.01)]],
    [
        'off-road driving',
        [{ ...location(0.0199), roadMatch: { isOffRoad: true } }],
    ],
    ['stale route location timestamps', [location(0.0199, 0, epoch - 20000)]],
    ['future route location timestamps', [location(0.0199, 0, epoch + 60000)]],
    [
        'out-of-order route location timestamps',
        [location(0.0199), location(0.02, 0.001, epoch - 1)],
    ],
    [
        'changing speed near a turn',
        [0, 30, 35, 40, 45, 50, 55, 65].map((mph) => ({
            ...location(0.0199),
            speed: mph * 0.44704,
        })),
    ],
    ['departing a turn', [location(0.02, 0.001), location(0.02, 0.01)]],
]) {
    test(`${scenario} uses the normal speed zoom mapping`, () => {
        const currentZoomRef = { current: 17 };
        const hook = useFollowLocationMode({
            cameraRef: { current: { setCamera() {} } },
            cameraUpdatesAreAllowed: () => true,
            clampZoomLevel: (zoom) => zoom,
            currentZoomRef,
            followSpeedZoomEnabled: true,
            isDrivingMode: true,
            locationTrackingMode: 'follow',
            locationTrackingModeRef: { current: 'follow' },
            markerLoadsEnabledRef: { current: true },
            navigationRoute: route,
            setTrackingMode() {},
            userLocationRef: { current: null },
        });
        for (const fix of fixes) {
            hook.recenter(fix);
            assert.equal(
                currentZoomRef.current,
                getFollowSpeedZoomLevel(fix.speed, (zoom) => zoom),
            );
        }
    });
}
