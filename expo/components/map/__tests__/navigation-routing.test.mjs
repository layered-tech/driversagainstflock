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

test('direction steps retain passed maneuvers and jump directly to the current step', () => {
    const route = makeRoute();
    const option = directions.getSelectedDirectionsRouteOption(route);
    option.maneuvers = [
        { stepIndex: 0, type: 11, distance: 100, way_points: [0, 1] },
        { stepIndex: 1, type: 1, distance: 600, way_points: [1, 2] },
        { stepIndex: 2, type: 7, distance: 300, exit_number: 3 },
        { stepIndex: 3, type: 10, distance: 0 },
    ];
    const steps = directions.getDirectionsSteps(route, {
        stepIndex: 1,
        distanceToManeuver: 75,
    });
    assert.deepEqual(
        steps.map((step) => step.stepIndex),
        [0, 1, 2, 3],
    );
    assert.deepEqual(
        steps.map((step) => step.isCurrent),
        [false, true, false, false],
    );
    assert.deepEqual(
        steps.map((step) => step.displayDistance),
        [100, 75, 300, 0],
    );
    assert.equal(steps[2].exit_number, 3);
    assert.equal(option.maneuvers[1].isCurrent, undefined);
    assert.deepEqual(steps[0].coordinate, [0, 0]);
    assert.equal(steps[1].coordinate, option.coordinates[1]);
    assert.equal(steps[2].coordinate, null);
    assert.deepEqual(
        directions
            .getDirectionsSteps(route, {
                stepIndex: 3,
                distanceToManeuver: 0,
            })
            .filter((step) => step.isCurrent)
            .map((step) => step.type),
        [10],
    );
});

test('direction steps reset for replacement routes and tolerate missing maneuvers', () => {
    assert.deepEqual(directions.getDirectionsSteps(null, null), []);
    const route = makeRoute();
    const steps = directions.getDirectionsSteps(route, {
        stepIndex: 20,
    });
    assert.equal(steps.length, 2);
    assert.equal(
        steps.some((step) => step.isCurrent),
        false,
    );
});
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

function loadGuidanceCards(
    directionOverrides = {},
    colorScheme = 'light',
    fontScale = 1,
) {
    const module = { exports: {} };
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
        react: { useMemo: (factory) => factory() },
        'react-native-gesture-handler': {
            GestureDetector: 'GestureDetector',
            Gesture: {
                Pan: () => {
                    const gesture = { config: {} };
                    for (const name of [
                        'enabled',
                        'activeOffsetX',
                        'failOffsetY',
                        'maxPointers',
                        'runOnJS',
                        'onEnd',
                    ]) {
                        gesture[name] = (value) => {
                            gesture.config[name] = value;
                            return gesture;
                        };
                    }
                    return gesture;
                },
            },
        },
        'react/jsx-runtime': { jsx: element, jsxs: element },
        'react-native': {
            View: 'View',
            Text: 'Text',
            Pressable: 'Pressable',
            useColorScheme: () => colorScheme,
            useWindowDimensions: () => ({ fontScale }),
        },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/primitives': { DafButton: 'Button' },
        '../design-system/tokens': {
            dafSemanticColors: {},
            getDafTheme: (scheme) => ({
                text: { primary: scheme === 'dark' ? '#F5F7F9' : '#11151B' },
            }),
        },
        './constants': { DRIVING_DESTINATION_BOTTOM_PADDING: 0 },
        './roundabout-guidance': { getRoundaboutExitNumber: () => null },
        './directions': { ...directions, ...directionOverrides },
    };
    new Function('require', 'module', 'exports', source)(
        (name) => mocked[name],
        module,
        module.exports,
    );
    return module.exports;
}

test('the phone card renders remaining distance, duration and arrival estimate', () => {
    const calls = [];
    const { DestinationCard } = loadGuidanceCards({
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
    });
    DestinationCard({
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

test('the separate maneuver bars focus the same steps as the list', () => {
    const { ManeuverCard } = loadGuidanceCards();
    const route = makeRoute();
    const option = directions.getSelectedDirectionsRouteOption(route);
    const [maneuver, nextManeuver] = option.maneuvers;
    maneuver.instruction = 'Continue on Main Street';
    nextManeuver.instruction = 'Arrive at destination';
    const focused = [];
    const card = ManeuverCard({
        directionsRoute: route,
        maneuver,
        nextManeuver,
        onStepFocus: (coordinate, stepIndex) =>
            focused.push({ coordinate, stepIndex }),
    });
    const steps = directions.getDirectionsSteps(route, maneuver);
    const mainBar = card.props.children[0].props.children[1].props.children;
    const thenBar = card.props.children[1];
    assert.equal(mainBar.type, 'Pressable');
    assert.equal(mainBar.props.disabled, false);
    const subtitle = mainBar.props.children[1].props.children[1];
    assert.equal(subtitle.props.instruction, maneuver.instruction);
    mainBar.props.onPress();
    assert.equal(thenBar.props.disabled, false);
    thenBar.props.onPress();
    assert.deepEqual(
        focused,
        steps.map(({ coordinate, stepIndex }) => ({ coordinate, stepIndex })),
    );
});

test('maneuver focus is disabled without a valid coordinate', () => {
    const { ManeuverCard } = loadGuidanceCards();
    const card = ManeuverCard({
        maneuver: { instruction: 'Continue' },
        nextManeuver: { instruction: 'Turn right' },
        onStepFocus() {
            assert.fail('invalid coordinate focused');
        },
    });
    assert.equal(
        card.props.children[0].props.children[1].props.children.props.disabled,
        true,
    );
    assert.equal(card.props.children[1].props.disabled, true);
});

test('focused maneuver tabs page in either direction and disable at route boundaries', () => {
    const { ManeuverCard } = loadGuidanceCards();
    const events = [];
    const props = {
        maneuver: { instruction: 'Turn right', distanceToManeuver: 100 },
        nextManeuver: { instruction: 'Continue' },
        isFocused: true,
    };
    const card = ManeuverCard({
        ...props,
        onPreviousStep: () => events.push('previous'),
        onNextStep: () => events.push('next'),
    });
    assert.equal(card.props.children[1], null);
    const [previous, , next] = card.props.children[0].props.children;
    previous.props.onPress();
    next.props.onPress();
    assert.deepEqual(events, ['previous', 'next']);
    const boundaries = ManeuverCard(props).props.children[0].props.children;
    assert.equal(boundaries[0].props.disabled, true);
    assert.equal(boundaries[2].props.disabled, true);
});

test('focused step arrow tabs match the design geometry, chevrons and theme shadows', () => {
    for (const colorScheme of ['light', 'dark']) {
        const { ManeuverCard } = loadGuidanceCards({}, colorScheme);
        const card = ManeuverCard({
            maneuver: { instruction: 'Turn right' },
            isFocused: true,
            onNextStep() {},
        });
        const [previous, banner, next] = card.props.children[0].props.children;
        for (const tab of [previous, next]) {
            for (const token of [
                'relative',
                'z-[1]',
                'my-2.5',
                'w-[50px]',
                'shrink-0',
                'bg-white/95',
                'dark:bg-[rgba(17,21,27,0.95)]',
            ]) {
                assert.ok(
                    tab.props.className.split(' ').includes(token),
                    token,
                );
            }
            assert.equal(tab.props.children.props.size, 22);
            assert.equal(tab.props.children.props.stroke, 2.4);
            assert.equal(
                tab.props.children.props.color,
                colorScheme === 'dark' ? '#F5F7F9' : '#11151B',
            );
            assert.equal(
                tab.props.style.boxShadow,
                colorScheme === 'dark'
                    ? '0 1px 2px rgba(0,0,0,0.40), 0 10px 30px rgba(0,0,0,0.50)'
                    : '0 1px 2px rgba(11,14,18,0.14), 0 6px 22px rgba(11,14,18,0.16)',
            );
        }
        assert.match(previous.props.className, /-mr-\[14px\]/);
        assert.match(previous.props.className, /pr-\[14px\]/);
        assert.match(previous.props.className, /rounded-l-dafSm/);
        assert.match(previous.props.className, /border-r-0/);
        assert.match(previous.props.className, /opacity-40/);
        assert.match(next.props.className, /-ml-\[14px\]/);
        assert.match(next.props.className, /pl-\[14px\]/);
        assert.match(next.props.className, /rounded-r-dafSm/);
        assert.match(next.props.className, /border-l-0/);
        assert.match(next.props.className, /active:scale-\[0.97\]/);
        assert.match(banner.props.children.props.className, /z-\[2\]/);
    }
});

test('native fitting leaves room for two full-size instruction lines', () => {
    for (const fontScale of [1, 1.5]) {
        const { ManeuverInstruction } = loadGuidanceCards(
            {},
            'light',
            fontScale,
        );
        const instructions = [
            'Turn left',
            'Turn right onto Stonegate Court',
            'Turn right onto Martin Luther King Junior Boulevard',
        ];
        const rendered = instructions.map((instruction) =>
            ManeuverInstruction({ instruction }),
        );
        for (const [index, text] of rendered.entries()) {
            assert.equal(text.type, 'Text');
            assert.equal(text.props.children, instructions[index]);
            assert.equal(text.props.adjustsFontSizeToFit, true);
            assert.equal(text.props.minimumFontScale, 14 / 20);
            assert.equal(text.props.numberOfLines, 2);
            assert.equal(text.props.style.maxHeight, 48 * fontScale);
            assert.equal(text.props.includeFontPadding, false);
            assert.equal(text.props.onTextLayout, undefined);
            assert.match(text.props.className, /text-\[20px\]/);
            assert.doesNotMatch(text.props.className, /leading-/);
        }
        assert.deepEqual(rendered[0].props.style, rendered[1].props.style);
    }
});

test('the next-next step bar has the design floating shadow in both themes', () => {
    for (const scheme of ['light', 'dark']) {
        const { ManeuverCard } = loadGuidanceCards({}, scheme);
        const bar = ManeuverCard({
            maneuver: { instruction: 'Turn right' },
            nextManeuver: { instruction: 'Continue' },
        }).props.children[1];
        assert.equal(
            bar.props.style.boxShadow,
            scheme === 'dark'
                ? '0 1px 2px rgba(0,0,0,0.40), 0 10px 30px rgba(0,0,0,0.50)'
                : '0 1px 2px rgba(11,14,18,0.14), 0 6px 22px rgba(11,14,18,0.16)',
        );
    }
});

test('the main step casts a native shadow above the next-next step without clipping', () => {
    for (const scheme of ['light', 'dark']) {
        const { ManeuverCard } = loadGuidanceCards({}, scheme);
        const card = ManeuverCard({
            maneuver: { instruction: 'Turn right' },
            nextManeuver: { instruction: 'Continue' },
        });
        const [upperLayer, nextBar] = card.props.children;
        const mainBar = upperLayer.props.children[1].props.children;
        assert.equal(
            mainBar.props.style.boxShadow,
            nextBar.props.style.boxShadow,
        );
        assert.ok(mainBar.props.style.boxShadow);
        assert.match(upperLayer.props.className, /z-10/);
        assert.match(upperLayer.props.className, /overflow-visible/);
        assert.match(nextBar.props.className, /z-\[1\]/);
        assert.doesNotMatch(mainBar.props.className, /shadow-/);
    }
});

test('distance and instruction center together within a fixed-height banner', () => {
    for (const fontScale of [1, 1.5]) {
        const { ManeuverCard } = loadGuidanceCards({}, 'light', fontScale);
        for (const instruction of [
            'Turn left',
            'Turn right onto Stonegate Court',
            'Turn right onto Martin Luther King Junior Boulevard',
        ]) {
            for (const isFocused of [false, true]) {
                const card = ManeuverCard({
                    maneuver: { instruction },
                    isFocused,
                });
                const mainBar =
                    card.props.children[0].props.children[1].props.children;
                assert.match(mainBar.props.className, /\bpy-2\.5\b/);
                const column =
                    card.props.children[0].props.children[1].props.children
                        .props.children[1];
                assert.equal(column.props.style.height, 78 * fontScale);
                assert.match(column.props.className, /justify-center/);
                assert.equal(
                    column.props.children[0].props.testID,
                    'driving-maneuver-distance',
                );
                assert.equal(
                    column.props.children[1].props.instruction,
                    instruction,
                );
            }
        }
    }
});

test('focused banner swipes page once on release and share the arrow actions', () => {
    const { ManeuverCard } = loadGuidanceCards();
    const events = [];
    const card = ManeuverCard({
        maneuver: { instruction: 'Turn right' },
        isFocused: true,
        onPreviousStep: () => events.push('earlier'),
        onNextStep: () => events.push('later'),
    });
    const [previous, detector, next] = card.props.children[0].props.children;
    assert.equal(detector.type, 'GestureDetector');
    const gesture = detector.props.gesture.config;
    assert.equal(gesture.enabled, true);
    assert.equal(gesture.runOnJS, true);
    assert.equal(gesture.maxPointers, 1);
    assert.deepEqual(gesture.activeOffsetX, [-20, 20]);
    assert.deepEqual(gesture.failOffsetY, [-16, 16]);
    gesture.onEnd({ translationX: -60, translationY: 4 }, true);
    gesture.onEnd({ translationX: 60, translationY: -4 }, true);
    next.props.onPress();
    previous.props.onPress();
    assert.deepEqual(events, ['later', 'earlier', 'later', 'earlier']);
    for (const [event, success] of [
        [{ translationX: 10, translationY: 0 }, true],
        [{ translationX: -60, translationY: 80 }, true],
        [{ translationX: -60, translationY: 0 }, false],
    ]) {
        gesture.onEnd(event, success);
    }
    assert.equal(events.length, 4);
});

test('swipes are disabled during live guidance and do not wrap past route boundaries', () => {
    const { ManeuverCard } = loadGuidanceCards();
    const events = [];
    const props = { maneuver: { instruction: 'Turn right' } };
    const gestureFor = (options) =>
        ManeuverCard({ ...props, ...options }).props.children[0].props
            .children[1].props.gesture.config;
    const live = gestureFor({ onNextStep: () => events.push('unexpected') });
    assert.equal(live.enabled, false);
    live.onEnd({ translationX: -70, translationY: 0 }, true);
    assert.deepEqual(events, []);
    const first = gestureFor({
        isFocused: true,
        onNextStep: () => events.push('later'),
    });
    first.onEnd({ translationX: 70, translationY: 0 }, true);
    assert.deepEqual(events, []);
    first.onEnd({ translationX: -70, translationY: 0 }, true);
    const last = gestureFor({
        isFocused: true,
        onPreviousStep: () => events.push('earlier'),
    });
    last.onEnd({ translationX: -70, translationY: 0 }, true);
    assert.deepEqual(events, ['later']);
    last.onEnd({ translationX: 70, translationY: 0 }, true);
    assert.deepEqual(events, ['later', 'earlier']);
});
