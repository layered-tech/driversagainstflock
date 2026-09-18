import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as advancedSettings from '../advanced-route-settings.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonjs = require('@babel/plugin-transform-modules-commonjs');
const jsx = require('@babel/plugin-transform-react-jsx');

function loadModule(filename, mocks, globals = {}) {
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
    const { code } = transformSync(source, {
        babelrc: false,
        configFile: false,
        plugins: [[jsx, { runtime: 'automatic' }], commonjs],
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', ...Object.keys(globals), code)(
        (name) => {
            assert.ok(name in mocks, `Missing mock for ${name}`);
            return mocks[name];
        },
        module,
        module.exports,
        ...Object.values(globals),
    );
    return module.exports;
}

function flatten(node) {
    if (!node || typeof node !== 'object') return [];
    const children = [node.props?.children].flat(Infinity);
    return [node, ...children.flatMap(flatten)];
}

function createSheetHarness(avoidanceMode = 'directional') {
    const state = [];
    let cursor = 0;
    const applied = [];
    const context = {
        directionsRoute: { advancedRouteSettings: { avoidanceMode } },
        directionsRouteSheetTrackingHandlers: {},
        insets: { bottom: 0 },
        mapPreferencesAreLoaded: true,
        directionsRouteIsLoading: false,
        handleDirectionsAdvancedSettingsApply: (settings) =>
            applied.push(settings),
    };
    const element = (type, props) => ({ type, props });
    const { DirectionsRouteSheet } = loadModule(
        '../directions-route-sheet.js',
        {
            'react/jsx-runtime': { jsx: element, jsxs: element },
            react: {
                useEffect: () => {},
                useState: (initial) => {
                    const index = cursor++;
                    if (!(index in state)) state[index] = initial;
                    return [
                        state[index],
                        (next) => {
                            state[index] =
                                typeof next === 'function'
                                    ? next(state[index])
                                    : next;
                        },
                    ];
                },
            },
            'react-native': {
                Pressable: 'Pressable',
                Switch: 'Switch',
                Text: 'Text',
                View: 'View',
            },
            '@gorhom/bottom-sheet': { BottomSheetScrollView: 'ScrollView' },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/primitives': {
                DafButton: 'Button',
                DafIconButton: 'IconButton',
                DafTextInput: 'Input',
            },
            '../scorecard/scorecard-engine': {
                getAvoidableRouteCameraCount: () => 0,
            },
            './advanced-route-settings': advancedSettings,
            './directions': {
                DIRECTIONS_ROUTE_FASTEST: 'direct',
                DIRECTIONS_ROUTE_PRIVATE: 'ideal',
                formatDirectionsDuration: () => '',
                getDirectionsRouteOptions: () => [],
                getSelectedDirectionsRouteKey: () => 'ideal',
            },
            './map-screen-context': {
                useDirectionsRouteContext: () => context,
            },
            './native-components': {
                NativeWindBottomSheetModal: 'Modal',
                NativeWindBottomSheetView: 'View',
            },
            './route-option-card': { RouteOptionCard: 'RouteOptionCard' },
            './use-bottom-sheet-presented-state': {
                useBottomSheetPresentedState: () => ({
                    bottomSheetIsPresented: true,
                }),
            },
        },
    );
    const render = () => {
        cursor = 0;
        return flatten(DirectionsRouteSheet());
    };
    const control = (id) =>
        render().find((node) => node.props.testID === id)?.props;
    control('directions-route-advanced-settings-toggle').onPress();
    return { control, context, applied };
}

test('renders accessible shape choices and applies circular mode with the other settings', () => {
    const { control, context, applied } = createSheetHarness();
    const circular = control('directions-route-avoidance-circular');
    assert.equal(circular.accessibilityLabel, 'Circular radius');
    assert.equal(circular.accessibilityRole, 'radio');
    assert.equal(circular.accessibilityState.checked, false);
    assert.equal(
        control('directions-route-avoidance-directional').accessibilityState
            .checked,
        true,
    );
    circular.onPress();
    assert.equal(
        control('directions-route-avoidance-circular').accessibilityState
            .checked,
        true,
    );
    control('directions-route-advanced-settings-apply').onPress();
    assert.deepEqual(applied, [
        {
            allowAlprNearStartDestination: true,
            avoidBufferMeters: 50,
            avoidanceMode: 'circular',
        },
    ]);
    context.directionsRouteIsLoading = true;
    assert.equal(control('directions-route-avoidance-circular').disabled, true);
    assert.equal(
        control('directions-route-avoidance-circular').accessibilityState
            .disabled,
        true,
    );
});

test('restores circular selection when reopening a saved route', () => {
    const { control } = createSheetHarness('circular');
    assert.equal(
        control('directions-route-avoidance-circular').accessibilityState
            .checked,
        true,
    );
});

test('sends stored or explicit shape preferences through the actual directions API', async () => {
    const requests = [];
    const { getDirections } = loadModule(
        '../api.js',
        {
            '../../lib/sentry': { addSentryBreadcrumb: () => {} },
            './advanced-route-settings': advancedSettings,
            './api-mocks': { mapApiMocksAreEnabled: () => false },
            './config': { buildApiURL: (path) => path },
            './directions': {
                normalizeDirectionsRouteResponse: (route) => route,
                normalizeDirectionsDebugFeatureCollection: (value) => value,
            },
            './geo': {},
            './place-details-cache': {},
            './place-formatters': {},
            './shared-map-preferences-sync': {
                getSharedMapPreferencesState: () => ({
                    advancedRouteSettings: { avoidanceMode: 'circular' },
                }),
            },
        },
        {
            fetch: async (_url, options) => {
                requests.push(JSON.parse(options.body));
                return {
                    ok: true,
                    json: async () => ({
                        ok: true,
                        result: {
                            route: {
                                coordinates: [
                                    [0, 0],
                                    [1, 1],
                                ],
                            },
                        },
                    }),
                };
            },
        },
    );
    const args = {
        start: { longitude: 0, latitude: 0 },
        end: { longitude: 1, latitude: 1 },
    };
    const stored = await getDirections(args);
    await getDirections({
        ...args,
        advancedRouteSettings: { avoidanceMode: 'directional' },
    });
    assert.deepEqual(
        requests.map((request) => request.avoidance_mode),
        ['circular', 'directional'],
    );
    assert.equal(stored.route.advancedRouteSettings.avoidanceMode, 'circular');
});

test('round trips circular mode through the map preference serializer', () => {
    const { getPersistableMapPreferences, parseStoredMapPreferences } =
        loadModule('../map-preferences.js', {
            '../map-location-mode-shared': {},
            './advanced-route-settings': advancedSettings,
            './config': {
                MAPBOX_STANDARD_STYLE_URL: 'standard',
                MAPBOX_STANDARD_LIGHT_PRESET_AUTO: 'auto',
            },
            './constants': { MAP_LAYER_STYLES: [] },
            './debug-overlays': {
                getDebugOverlayVisibilityWithDefaults: () => ({}),
                getDebugOverlayIsVisible: () => false,
            },
            './geo': { getStoredNumber: () => null },
        });
    const settings = {
        avoidanceMode: 'circular',
        avoidBufferMeters: 175,
        allowAlprNearStartDestination: false,
    };
    const serialized = JSON.stringify(
        getPersistableMapPreferences(...Array(12).fill(undefined), settings),
    );
    assert.deepEqual(
        advancedSettings.getStoredAdvancedRouteSettings(
            parseStoredMapPreferences(serialized),
        ),
        settings,
    );
});

test('changing only the mode starts a fresh request and discards the previous result', async () => {
    const requests = [];
    const published = [];
    const { useDirectionsRouteRequest } = loadModule(
        '../use-directions-route-request.js',
        {
            react: {
                useCallback: (callback) => callback,
                useRef: (current) => ({ current }),
            },
            'react-native': { Keyboard: { dismiss: () => {} } },
            './advanced-route-settings': advancedSettings,
            './analytics': {
                logMapDirectionsRequested: () => {},
                logMapDirectionsRouteLoaded: () => {},
            },
            './api': {
                getDirections: (args) =>
                    new Promise((resolve) => requests.push({ args, resolve })),
            },
            './directions': {
                getDirectionsRouteBounds: () => null,
                getDirectionsWaypointApiCoord: (waypoint) => waypoint,
                selectDirectionsRoute: (route) => route,
            },
        },
    );
    const { requestDirectionsRoute } = useDirectionsRouteRequest({
        isMountedRef: { current: true },
        setDirectionsRoute: (route) => published.push(route),
        setDirectionsRouteError: () => {},
        setDirectionsRouteIsLoading: () => {},
        setDirectionsSearchIsFocused: () => {},
    });
    const args = {
        startWaypoint: { longitude: 0, latitude: 0 },
        destinationWaypoint: { longitude: 1, latitude: 1 },
    };
    requestDirectionsRoute(args);
    requestDirectionsRoute({
        ...args,
        advancedRouteSettings: { avoidanceMode: 'circular' },
    });
    assert.deepEqual(
        requests.map(({ args }) => args.advancedRouteSettings.avoidanceMode),
        ['directional', 'circular'],
    );
    assert.equal(requests[0].args.signal.aborted, true);
    requests[1].resolve({ route: { mode: 'circular' } });
    await new Promise(setImmediate);
    requests[0].resolve({ route: { mode: 'directional' } });
    await new Promise(setImmediate);
    assert.equal(published.length, 1);
    assert.equal(published[0].mode, 'circular');
    assert.equal(published[0].advancedRouteSettings.avoidanceMode, 'circular');
});
