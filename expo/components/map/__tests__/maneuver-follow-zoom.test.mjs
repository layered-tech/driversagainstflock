import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const modules = new Map();
const nativeModules = {
    'sentry.js': { addSentryBreadcrumb() {} },
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

const { createManeuverFollowZoomController, getManeuverZoomTarget } =
    loadMapModule(new URL('../maneuver-follow-zoom.js', import.meta.url));

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

test('progressively closes in on decisions and preserves speed zoom away from them', () => {
    const targets = [700, 500, 250, 25, 0].map((distance) =>
        getManeuverZoomTarget({
            speedZoom: 13.75,
            speed: 29,
            maneuver: { type: 1, distanceToManeuver: distance },
        }),
    );
    assert.equal(targets[0], 13.75);
    assert.equal(targets.at(-1), 16.5);
    assert.equal(targets.at(-2), 16.5);
    assert.ok(
        targets[1] > targets[0] &&
            targets[2] > targets[1] &&
            targets[3] > targets[2],
    );
    assert.equal(
        getManeuverZoomTarget({
            speedZoom: 19,
            speed: 0,
            maneuver: { type: 1, distanceToManeuver: 0 },
        }),
        18.5,
    );
});

test('maneuver zoom targets use the speed band below, at and above 40 mph', () => {
    for (const [speedMph, expectedZoom] of [
        [0, 18.5],
        [25, 18.5],
        [39.99, 18.5],
        [40, 16.5],
        [40.01, 16.5],
        [65, 16.5],
    ]) {
        for (const distanceToManeuver of [25, 0]) {
            assert.equal(
                getManeuverZoomTarget({
                    speedZoom: 16.75,
                    speed: speedMph * 0.44704,
                    maneuver: { type: 1, distanceToManeuver },
                }),
                expectedZoom,
                `${speedMph} mph, ${distanceToManeuver} meters`,
            );
        }
        assert.equal(
            getManeuverZoomTarget({
                speedZoom: 16.75,
                speed: speedMph * 0.44704,
                maneuver: { type: 1, distanceToManeuver: 700 },
            }),
            16.75,
        );
    }
});

test('changing speed bands smoothly updates the maneuver zoom target', () => {
    const controller = createManeuverFollowZoomController();
    const update = (speedMph, second, force = false) =>
        controller.update({
            route,
            location: {
                ...location(0.0199, 0, epoch + second * 1000),
                speed: speedMph * 0.44704,
            },
            speedZoom: 16,
            now: epoch + second * 1000,
            force,
        });
    let previous = update(35, 0, true);
    assert.equal(previous, 18.5);
    for (let second = 1; second <= 6; second++) {
        const zoom = update(45, second);
        assert.ok(zoom <= previous && previous - zoom <= 0.400001);
        previous = zoom;
    }
    assert.equal(previous, 16.5);
    for (let second = 7; second <= 13; second++) {
        const zoom = update(35, second);
        assert.ok(zoom >= previous && zoom - previous <= 0.400001);
        previous = zoom;
    }
    assert.equal(previous, 18.5);
});

test('a maneuver eases down to its cap when normal follow zoom is closer', () => {
    const controller = createManeuverFollowZoomController();
    const update = (longitude, elapsed) =>
        controller.update({
            route,
            location: {
                ...location(longitude, 0, epoch + elapsed),
                speed: 40 * 0.44704,
            },
            speedZoom: 16.75,
            now: epoch + elapsed,
        });
    assert.equal(update(0.01, 0), 16.75);
    assert.equal(update(0.0199, 100), 16.71);
    assert.equal(update(0.0199, 1100), 16.5);
});

test('invalid, continue and departure maneuvers leave speed zoom unchanged', () => {
    for (const maneuver of [
        null,
        {},
        { type: 1 },
        ...[null, NaN, Infinity, -1, '0'].map((distanceToManeuver) => ({
            type: 1,
            distanceToManeuver,
        })),
        ...[6, 11, -1, 99, null].map((type) => ({
            type,
            distanceToManeuver: 0,
        })),
    ]) {
        assert.equal(
            getManeuverZoomTarget({ speedZoom: 14, speed: 30, maneuver }),
            14,
        );
    }
});

test('GPS route replay approaches a turn, advances to the next maneuver and recovers smoothly', () => {
    const controller = createManeuverFollowZoomController();
    let previous = 13.75;
    const samples = [];
    for (let second = 0; second <= 70; second++) {
        const traveled = second * 29;
        const distanceBeforeTurn = 800 - traveled;
        const fix =
            distanceBeforeTurn >= 0
                ? location(
                      0.02 - distanceBeforeTurn / 111195,
                      0,
                      epoch + second * 1000,
                  )
                : location(
                      0.02,
                      -distanceBeforeTurn / 111195,
                      epoch + second * 1000,
                  );
        const zoom = controller.update({
            route,
            location: fix,
            speedZoom: 13.75,
            now: fix.recordedAt,
        });
        assert.ok(
            Math.abs(zoom - previous) <= 0.400001,
            `second ${second}: ${previous} -> ${zoom}`,
        );
        samples.push(zoom);
        previous = zoom;
    }
    assert.equal(samples[0], 13.75);
    assert.ok(samples[20] > samples[10]);
    assert.ok(samples[27] > 16.4);
    assert.ok(samples[29] < samples[27]);
    assert.equal(samples.at(-1), 13.75);
});

test('missing, stale, future, off-route and invalid fixes use speed zoom', () => {
    for (const fix of [
        null,
        location(0.0199, 0, epoch - 10001),
        location(0.0199, 0, epoch + 1001),
        location(0.0199, 0, null),
        location(0.0199, 0.01),
        location(NaN),
        { ...location(0.0199), roadMatch: { isOffRoad: true } },
    ]) {
        const controller = createManeuverFollowZoomController();
        assert.equal(
            controller.update({
                route,
                location: fix,
                speedZoom: 13.75,
                now: epoch,
            }),
            13.75,
        );
    }
    for (const missingRoute of [null, {}, { coordinates: [] }]) {
        assert.equal(
            createManeuverFollowZoomController().update({
                route: missingRoute,
                location: location(0.0199),
                speedZoom: 13.75,
                now: epoch,
            }),
            13.75,
        );
    }
});

test('cancellation, stale data and rerouting release the close view without a jump', () => {
    for (const change of [
        { route: null },
        { location: location(0.0199, 0, epoch - 20000) },
        {
            route: directions.normalizeDirectionsRoute({
                coordinates: [
                    [0, 0],
                    [0.1, 0],
                ],
                maneuvers: [
                    { type: 11, way_points: [0, 1] },
                    { type: 10, way_points: [1, 1] },
                ],
            }),
        },
    ]) {
        const controller = createManeuverFollowZoomController();
        assert.equal(
            controller.update({
                route,
                location: location(0.0199),
                speedZoom: 13.75,
                now: epoch,
                force: true,
            }),
            16.5,
        );
        let previous = 16.5;
        for (let second = 1; second <= 15; second++) {
            const zoom = controller.update({
                route,
                location: location(0.0199, 0, epoch + second * 1000),
                speedZoom: 13.75,
                now: epoch + second * 1000,
                ...change,
            });
            assert.ok(zoom <= previous && previous - zoom <= 0.400001);
            previous = zoom;
        }
        assert.equal(previous, 13.75);
    }
});

test('out-of-order fixes fall back and long gaps do not permit large zoom jumps', () => {
    const controller = createManeuverFollowZoomController();
    controller.update({
        route,
        location: location(0.01),
        speedZoom: 13.75,
        now: epoch,
    });
    assert.equal(
        controller.update({
            route,
            location: location(0.0199, 0, epoch - 1),
            speedZoom: 13.75,
            now: epoch + 1000,
        }),
        13.75,
    );
    assert.equal(
        controller.update({
            route,
            location: location(0.0199, 0, epoch + 60000),
            speedZoom: 13.75,
            now: epoch + 60000,
        }),
        14.15,
    );
});

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
    'react-native.js': { useWindowDimensions: () => ({ height: 800 }) },
    'safe-area-insets.js': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'map-location-mode-shared.js': {
        EMPTY_CAMERA_PADDING: {},
        getCameraPadding: (value) => value ?? {},
        LOCATION_TRACKING_FOLLOW: 'follow',
        LOCATION_TRACKING_NONE: 'none',
        LOCATION_ZOOM_LEVEL: 17,
    },
});
const { useFollowLocationMode } = loadMapModule(
    new URL('../../map-follow-location-mode.js', import.meta.url),
);

test('shared follow hook applies maneuver zoom and respects manual zoom, panning and camera ownership', (t) => {
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
    assert.equal(currentZoomRef.current, 16.5);
    hook.handleZoomLevelChange('follow', 16);
    now += 1000;
    hook.handleLocationUpdate('follow', location(0.0199, 0, now));
    assert.equal(currentZoomRef.current, 16);
    hook.recenter(location(0.0199, 0, now));
    assert.equal(currentZoomRef.current, 16.5);
    allowed = false;
    now += 1000;
    hook.handleLocationUpdate('follow', location(0.01, 0, now));
    assert.equal(currentZoomRef.current, 16.5);
    allowed = true;
    hook.pauseUntilRecenter();
    now += 1000;
    hook.handleLocationUpdate('follow', location(0.01, 0, now));
    assert.equal(currentZoomRef.current, 16.5);
});

test('phone and automotive map surfaces pass only the active navigation route to shared follow', () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(
        read('../../map-screen.js'),
        /useMapLocationController\(\{\s*navigationRoute: isDrivingMode \? directionsRoute : null/,
    );
    assert.match(
        read('../use-map-location-controller.js'),
        /useFollowLocationMode\(\{[\s\S]*?navigationRoute,/,
    );
    assert.match(
        read('../../auto-play-map-surface-content.js'),
        /const activeDirectionsRoute = autoPlayState.isNavigating\s*\? displayedDirectionsRoute\s*: null/,
    );
    assert.match(
        read('../../auto-play-map-surface-content.js'),
        /useAutoPlayMapController\(\{\s*navigationRoute: activeDirectionsRoute/,
    );
    assert.match(
        read('../../auto-play-map-surface-content.js'),
        /useFollowLocationMode\(\{[\s\S]*?navigationRoute,/,
    );
});

test('arrival releases the close view even while the completed route is retained', () => {
    const controller = createManeuverFollowZoomController();
    controller.update({
        route,
        location: location(0.02, 0.0199),
        speedZoom: 13.75,
        now: epoch,
        force: true,
    });
    let zoom;
    for (let second = 1; second <= 15; second++) {
        zoom = controller.update({
            route,
            location: location(0.02, 0.02, epoch + second * 1000),
            speedZoom: 13.75,
            now: epoch + second * 1000,
        });
    }
    assert.equal(zoom, 13.75);
});

test('a nearby second turn retains a close view after the first turn', () => {
    const shortRoute = directions.normalizeDirectionsRoute({
        coordinates: [
            [0, 0],
            [0.02, 0],
            [0.02, 0.0002],
            [0.04, 0.0002],
        ],
        maneuvers: [
            { type: 11, way_points: [0, 1] },
            { type: 1, way_points: [1, 2] },
            { type: 0, way_points: [2, 3] },
            { type: 10, way_points: [3, 3] },
        ],
    });
    const controller = createManeuverFollowZoomController();
    controller.update({
        route: shortRoute,
        location: location(0.0199),
        speedZoom: 13.75,
        now: epoch,
        force: true,
    });
    assert.equal(
        controller.update({
            route: shortRoute,
            location: location(0.02, 0.0001, epoch + 1000),
            speedZoom: 13.75,
            now: epoch + 1000,
        }),
        16.5,
    );
});

test('roundabout guidance keeps the close view until exiting', () => {
    const coordinates = [
        [-97.745, 30.267],
        [-97.744, 30.267],
        [-97.7438, 30.2672],
        [-97.7436, 30.267],
        [-97.7438, 30.2668],
        [-97.7436, 30.265],
        [-97.7436, 30.25],
        [-97.74, 30.25],
    ];
    const roundaboutRoute = directions.normalizeDirectionsRoute({
        coordinates,
        maneuvers: [
            { type: 11, way_points: [0, 1] },
            { type: 7, way_points: [1, 6], exit_number: 2 },
            { type: 1, way_points: [6, 7] },
            { type: 10, way_points: [7, 7] },
        ],
    });
    const controller = createManeuverFollowZoomController();
    const inside = {
        ...location(...coordinates[2]),
        roadMatch: { isRoundabout: true },
    };
    assert.equal(
        controller.update({
            route: roundaboutRoute,
            location: inside,
            speedZoom: 13.75,
            now: epoch,
            force: true,
        }),
        16.5,
    );
    const outside = {
        ...location(...coordinates[5], epoch + 1000),
        roadMatch: { isOffRoad: false, isRoundabout: false },
    };
    assert.equal(
        controller.update({
            route: roundaboutRoute,
            location: outside,
            speedZoom: 13.75,
            now: epoch + 1000,
        }),
        16.1,
    );
});
