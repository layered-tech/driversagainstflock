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
const { getCurrentLocationRoadHint } = loadMapModule(
    new URL('../route-snapping.js', import.meta.url),
);
const { createSharedNavigationReroutingController } = loadMapModule(
    new URL('../shared-navigation-rerouting.js', import.meta.url),
);

function location(longitude, latitude, recordedAt) {
    return { longitude, latitude, recordedAt, accuracy: 5 };
}
function makeRoute(
    coordinates = [
        [0, 0],
        [0.01, 0],
        [0.02, 0],
    ],
) {
    return {
        ...directions.normalizeDirectionsRouteResponse({
            routes: {
                ideal: {
                    coordinates,
                    distance: 2000,
                    duration: 1000,
                    maneuvers: [
                        { way_points: [0, 1], duration: 100, type: 11 },
                        { way_points: [1, 2], duration: 900, type: 10 },
                    ],
                    timing_segments: [
                        { way_points: [0, 1], duration: 100 },
                        { way_points: [1, 2], duration: 900 },
                    ],
                },
            },
        }),
        destination: { location: { longitude: 0.02, latitude: 0 } },
        stopWaypoints: [],
        requestedAt: 0,
        advancedRouteSettings: {
            avoidanceMode: 'circular',
            avoidBufferMeters: 75,
        },
    };
}
const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};
function harness() {
    let time = 10000;
    let state = { drivingModeIsActive: true, directionsRoute: makeRoute() };
    const requests = [],
        published = [],
        statuses = [];
    let settle, reject;
    const controller = createSharedNavigationReroutingController({
        now: () => time,
        getRoutingState: () => state,
        getDirections: (body) => {
            requests.push(body);
            return new Promise((resolve, fail) => {
                settle = resolve;
                reject = fail;
            });
        },
        publishRoute: (route) => {
            published.push(route);
            state = { ...state, directionsRoute: route };
            controller.update();
        },
        onStatusChange: (status) => statuses.push(status),
    });
    return {
        controller,
        requests,
        published,
        statuses,
        tick: (ms, lng = 0.005, lat = 0.001) => {
            time += ms;
            controller.update(location(lng, lat, time));
        },
        resolve: (route) => settle({ route, exclusionZone: null }),
        reject: () => reject(new Error('Offline')),
        setState: (next) => {
            state = next;
            controller.update();
        },
        state: () => state,
    };
}

test('road hints require a fresh confident match and never substitute a place name', () => {
    const loc = {
        recordedAt: 10000,
        accuracy: 5,
        roadMatch: {
            isOffRoad: false,
            confidence: 0.95,
            distanceFromObservationMeters: 3,
            roadName: ' Main Street ',
        },
    };
    assert.equal(getCurrentLocationRoadHint(loc, 11000), 'Main Street');
    for (const changed of [
        { ...loc, recordedAt: 1000 },
        { ...loc, accuracy: 100 },
        { ...loc, roadMatch: { ...loc.roadMatch, confidence: 0.1 } },
        { ...loc, roadMatch: { ...loc.roadMatch, isOffRoad: true } },
        { ...loc, roadMatch: { ...loc.roadMatch, isTeleport: true } },
        {
            ...loc,
            roadMatch: { ...loc.roadMatch, distanceFromObservationMeters: 40 },
        },
    ])
        assert.equal(getCurrentLocationRoadHint(changed, 11000), null);
    const current = directions.createCurrentLocationDirectionsWaypoint({
        ...loc,
        recordedAt: Date.now(),
        longitude: 0,
        latitude: 0,
    });
    assert.equal(
        directions.getDirectionsWaypointApiCoord(current).road_hint,
        'Main Street',
    );
    assert.equal(
        directions.getDirectionsWaypointApiCoord({ ...current, kind: 'place' })
            .road_hint,
        undefined,
    );
});

test('remaining ETA follows segment timing rather than whole-route average speed', () => {
    const route = makeRoute();
    const halfway = directions.getRemainingDirectionsRouteValues(
        route,
        location(0.01, 0, 10000),
    );
    assert.ok(Math.abs(halfway.distanceRemaining - 1000) < 0.01);
    assert.ok(Math.abs(halfway.durationRemaining - 900) < 0.01);
    const late = directions.getRemainingDirectionsRouteValues(
        route,
        location(0.015, 0, 10000),
    );
    assert.ok(Math.abs(late.durationRemaining - 450) < 0.01);
    assert.equal(
        directions.getRemainingDirectionsRouteValues(
            route,
            location(0.02, 0, 10000),
        ).durationRemaining,
        0,
    );
    route.routes.ideal.timingSegments = [];
    assert.ok(
        Math.abs(
            directions.getRemainingDirectionsRouteValues(
                route,
                location(0.01, 0, 10000),
            ).durationRemaining - 900,
        ) < 0.01,
    );
    route.routes.ideal.maneuvers = [];
    assert.ok(
        Math.abs(
            directions.getRemainingDirectionsRouteValues(
                route,
                location(0.01, 0, 10000),
            ).durationRemaining - 500,
        ) < 0.01,
    );
});

test('one controller reroutes from either location source while retaining stops, selection and avoidance', async (t) => {
    const h = harness();
    t.after(() => h.controller.cancel());
    h.state().directionsRoute.stopWaypoints = [
        { location: { longitude: 0.015, latitude: 0 } },
    ];
    h.tick(0);
    h.tick(2100);
    await flush();
    assert.equal(h.requests.length, 1);
    h.tick(1000);
    await flush();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].waypoints.length, 1);
    assert.ok(Math.abs(h.requests[0].waypoints[0].longitude - 0.015) < 1e-9);
    assert.equal(h.requests[0].advancedRouteSettings.avoidanceMode, 'circular');
    h.resolve(
        makeRoute([
            [0.005, 0.001],
            [0.01, 0.001],
            [0.02, 0],
        ]),
    );
    await flush();
    assert.equal(h.published.length, 1);
    assert.equal(h.published[0].selectedRouteKey, 'ideal');
    assert.equal(h.published[0].stopWaypoints.length, 1);
    assert.deepEqual(h.statuses, [true, false]);
    h.controller.cancel();
});

test('cancelling or replacing navigation prevents an in-flight response from restoring it', async () => {
    for (const replacement of [null, makeRoute()]) {
        const h = harness();
        h.tick(0);
        h.tick(2100);
        await flush();
        h.setState({
            drivingModeIsActive: Boolean(replacement),
            directionsRoute: replacement,
        });
        assert.equal(h.requests[0].signal.aborted, true);
        h.resolve(
            makeRoute([
                [0.005, 0.001],
                [0.01, 0],
                [0.02, 0],
            ]),
        );
        await flush();
        assert.equal(h.published.length, 0);
        h.controller.cancel();
    }
});

test('stale positions and GPS jitter do not cause reroutes', async () => {
    const h = harness();
    h.controller.update(location(0.005, 0.001, 1));
    h.tick(3000, 0.005, 0.0001);
    await flush();
    assert.equal(h.requests.length, 0);
    h.tick(0);
    h.tick(1000, 0.005, 0);
    h.tick(1500);
    await flush();
    assert.equal(h.requests.length, 0);
    h.controller.cancel();
});

test('slow responses are discarded if the driver has moved away from the returned route', async () => {
    const h = harness();
    h.tick(0);
    h.tick(2100);
    await flush();
    h.tick(5000, 0.005, 0.01);
    h.resolve(
        makeRoute([
            [0.005, 0.001],
            [0.01, 0.001],
            [0.02, 0],
        ]),
    );
    await flush();
    assert.equal(h.published.length, 0);
    h.controller.cancel();
});

test('failed reroutes retain the old route and apply a cooldown', async () => {
    const h = harness();
    h.tick(0);
    h.tick(2100);
    await flush();
    h.reject();
    await flush();
    h.tick(2000);
    h.tick(2100);
    await flush();
    assert.equal(h.requests.length, 1);
    assert.equal(h.published.length, 0);
    h.tick(5000);
    h.tick(2100);
    await flush();
    assert.equal(h.requests.length, 2);
    h.controller.cancel();
});

test('rerouting rejects unexpectedly distant snapped starts', async () => {
    const h = harness();
    h.tick(0);
    h.tick(2100);
    await flush();
    const response = makeRoute([
        [0.005, 0.001],
        [0.01, 0.001],
        [0.02, 0],
    ]);
    response.routes.ideal.snappedWaypoints = [
        [0.006, 0.001],
        [0.02, 0],
    ];
    h.resolve(response);
    await flush();
    assert.equal(h.published.length, 0);
    h.controller.cancel();
});

test('partial segment timing falls back to complete maneuver timing and unknown totals stay unknown', () => {
    const route = makeRoute();
    route.routes.ideal.timingSegments = [{ way_points: [1, 2], duration: 900 }];
    assert.ok(
        Math.abs(
            directions.getRemainingDirectionsRouteValues(
                route,
                location(0.01, 0, 10000),
            ).durationRemaining - 900,
        ) < 0.01,
    );
    route.routes.ideal.maneuvers = [];
    route.routes.ideal.duration = null;
    route.routes.ideal.distance = null;
    assert.deepEqual(
        directions.getRemainingDirectionsRouteValues(
            route,
            location(0.01, 0, 10000),
        ),
        { distanceRemaining: null, durationRemaining: null },
    );
});

test('the app controller consumes shared and automotive fixes without depending on a map screen', () => {
    const module = { exports: {} };
    const updates = [],
        statusUpdates = [];
    let routingListener,
        locationListener,
        options,
        removed = 0;
    const source = transformSync(
        readFileSync(
            new URL('../shared-navigation-controller.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [transformModulesCommonJs],
        },
    ).code;
    const phoneLocation = location(0.005, 0.001, 10000);
    const mocked = {
        react: {
            useSyncExternalStore: (subscribe, getSnapshot) => {
                subscribe(() => statusUpdates.push(getSnapshot()));
                return getSnapshot();
            },
        },
        './api': { getDirections: () => {} },
        './debug-overlays': { DEBUG_OVERLAY_DIRECTIONS_GEOMETRY: 'geometry' },
        './shared-map-preferences-sync': {
            getSharedMapPreferencesState: () => ({
                userLocation: phoneLocation,
            }),
            addSharedMapPreferencesStateListener: (listener) => {
                locationListener = listener;
                return () => removed++;
            },
        },
        './shared-routing-state': {
            getSharedRoutingState: () => ({}),
            setSharedRoutingState: () => {},
            addSharedRoutingStateListener: (listener) => {
                routingListener = listener;
                return () => removed++;
            },
        },
        './shared-navigation-rerouting': {
            createSharedNavigationReroutingController: (args) => {
                options = args;
                return {
                    update: (loc) => updates.push(loc),
                    cancel: () => updates.push('cancel'),
                };
            },
        },
    };
    new Function('require', 'module', 'exports', source)(
        (name) => mocked[name],
        module,
        module.exports,
    );
    const stop = module.exports.startSharedNavigationController();
    module.exports.useSharedNavigationRerouting();
    routingListener();
    locationListener();
    const carLocation = location(0.006, 0.001, 11000);
    module.exports.updateSharedNavigationLocation(carLocation);
    assert.deepEqual(updates, [undefined, phoneLocation, carLocation]);
    options.onStatusChange(true);
    options.onStatusChange(false);
    assert.deepEqual(statusUpdates, [true, false]);
    stop();
    assert.equal(removed, 2);
    assert.equal(updates.at(-1), 'cancel');
});

test('the phone card renders remaining distance, duration and arrival estimate', () => {
    const module = { exports: {} };
    const calls = [];
    const jsx = require('@babel/plugin-transform-react-jsx');
    const source = transformSync(
        readFileSync(
            new URL('../driving-guidance-cards.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                [jsx, { runtime: 'automatic' }],
                transformModulesCommonJs,
            ],
        },
    ).code;
    const element = (type, props) => ({ type, props });
    const mocked = {
        'react/jsx-runtime': { jsx: element, jsxs: element },
        'react-native': { View: 'View', Text: 'Text' },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/primitives': { DafButton: 'Button' },
        '../design-system/tokens': { dafSemanticColors: {} },
        './constants': { DRIVING_DESTINATION_BOTTOM_PADDING: 0 },
        './roundabout-guidance': { getRoundaboutExitNumber: () => null },
        './directions': {
            DIRECTIONS_ROUTE_PRIVATE: 'ideal',
            formatDirectionsArrivalTime: (v) => {
                calls.push(['arrival', v]);
                return 'arrival';
            },
            formatDirectionsDistance: (v) => {
                calls.push(['distance', v]);
                return 'distance';
            },
            formatDirectionsDuration: (v) => {
                calls.push(['duration', v]);
                return 'duration';
            },
        },
    };
    new Function('require', 'module', 'exports', source)(
        (name) => mocked[name],
        module,
        module.exports,
    );
    module.exports.DestinationCard({
        directionsRoute: makeRoute(),
        routeOption: { distance: 2000, duration: 1000 },
        remainingValues: { distanceRemaining: 500, durationRemaining: 450 },
    });
    assert.deepEqual(calls, [
        ['duration', 450],
        ['distance', 500],
        ['arrival', 450],
    ]);
});
