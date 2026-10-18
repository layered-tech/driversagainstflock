import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
    ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG,
    getAndroidAutoClusterState,
} from '../../android-auto-cluster-state.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const sourceAt = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const surfaceSource = sourceAt('../../auto-play-map-surface-content.js');

function loadModule(path, dependencies) {
    const { code } = transformSync(sourceAt(path), {
        babelrc: false,
        configFile: false,
        plugins: [
            ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
            '@babel/plugin-transform-modules-commonjs',
        ],
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        (name) => {
            assert.ok(name in dependencies, `unmocked dependency: ${name}`);
            return dependencies[name];
        },
        module,
        module.exports,
    );
    return module.exports;
}

function evaluateDeclaration(name, context) {
    const pending = [
        parse(surfaceSource, { sourceType: 'module', plugins: ['jsx'] }),
    ];
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
                `${surfaceSource.slice(node.start, node.end)}\nreturn ${name};`,
            )(...Object.values(context));
        }
        pending.push(
            ...Object.values(node)
                .flat()
                .filter((value) => value && typeof value === 'object'),
        );
    }
    assert.fail(`missing declaration: ${name}`);
}

test('only Android advertises cluster rendering', () => {
    const config = require('../../../car-display-config.js');
    assert.equal(config.androidInstrumentClusterEnabled, true);
    assert.equal(config.carPlayInstrumentClusterEnabled, false);
});

test('the cluster shows only an active shared route and always follows in perspective', () => {
    const route = { selectedRouteKey: 'private', requestedAt: 1000 };
    const active = getAndroidAutoClusterState({
        directionsRoute: route,
        drivingModeIsActive: true,
    });
    assert.equal(active.directionsRoute, route);
    assert.equal(active.isNavigating, true);
    assert.equal(active.drivingMapViewMode, 'perspective');
    assert.equal(active.drivingModeIsActive, true);
    assert.deepEqual(active.submittedSearchResults, []);
    assert.equal(active.submittedSearchQuery, '');

    for (const state of [
        { directionsRoute: route, drivingModeIsActive: false },
        { directionsRoute: null, drivingModeIsActive: true },
        { directionsRoute: null, drivingModeIsActive: false },
    ]) {
        const idle = getAndroidAutoClusterState(state);
        assert.equal(idle.isNavigating, false);
        assert.equal(idle.directionsRoute, null);
        assert.equal(idle.drivingModeIsActive, true);
    }
});

test('the Android adapter registers the cluster component through the public API', async () => {
    const registrations = [];
    const ClusterSurface = () => {};
    const { autoPlayPlatform } = loadModule(
        '../../auto-play-platform.android.js',
        {
            './android-auto-map-surface': { AndroidAutoMapSurface() {} },
            './android-auto-cluster-surface': {
                AndroidAutoClusterSurface: ClusterSurface,
            },
            '../car-display-config': require('../../../car-display-config.js'),
        },
    );

    autoPlayPlatform.registerPlatformListeners({
        autoPlayModule: {
            AutoPlayCluster: {
                setComponent: async (component) =>
                    registrations.push(component),
            },
            HybridAutoPlay: {
                addListenerRenderState() {},
                addListenerVoiceInput() {},
            },
        },
        onSessionRenderState() {},
        onVoiceNavigation() {},
    });
    await Promise.resolve();
    assert.deepEqual(registrations, [ClusterSurface]);
});

function makeClusterSurface({ delayedSession = false } = {}) {
    let sharedState = { directionsRoute: null, drivingModeIsActive: false };
    const effects = [];
    const sessionOptions = [];
    const colorSchemes = [];
    let colorSchemeListener;
    let colorListenerRemovals = 0;
    let releases = 0;
    let resolveSession;
    const session = { remove: () => releases++ };
    const sessionPromise = delayedSession
        ? new Promise((resolve) => {
              resolveSession = resolve;
          })
        : Promise.resolve(session);
    const getSharedRoutingState = () => sharedState;
    const addSharedRoutingStateListener = () => {};
    const { AndroidAutoClusterSurface } = loadModule(
        '../../android-auto-cluster-surface.js',
        {
            react: {
                useEffect: (effect) => effects.push(effect),
                useSyncExternalStore(subscribe, snapshot) {
                    assert.equal(subscribe, addSharedRoutingStateListener);
                    return snapshot();
                },
            },
            'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
            './android-auto-cluster-state': {
                ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG,
                getAndroidAutoClusterState,
            },
            './auto-play-map-surface': {
                setAutoPlayMapColorScheme: (colorScheme) =>
                    colorSchemes.push(colorScheme),
                createAutoPlayMapSurface(config) {
                    assert.equal(config.followPitch, 60);
                    assert.equal(config.hostOwnsNavigationUI, true);
                    assert.equal(config.isClusterMapSurface, true);
                    return () => {};
                },
            },
            './map/road-matching-session': {
                retainRoadMatchingSessionAsync(options) {
                    sessionOptions.push(options);
                    return sessionPromise;
                },
            },
            './map/shared-routing-state': {
                addSharedRoutingStateListener,
                getSharedRoutingState,
                hydrateSharedRoutingStateAsync: async () => {},
            },
            '@iternio/react-native-auto-play': {
                AutoPlayCluster: {
                    addListenerColorScheme(listener) {
                        colorSchemeListener = listener;
                        return () => colorListenerRemovals++;
                    },
                },
            },
        },
    );
    return {
        effects,
        colorSchemes,
        emitColorScheme: (id, colorScheme) =>
            colorSchemeListener(id, colorScheme),
        colorListenerRemovals: () => colorListenerRemovals,
        sessionOptions,
        releases: () => releases,
        resolveSession: () => resolveSession(session),
        render: () => AndroidAutoClusterSurface({ id: 'cluster-1' }).props,
        setRoutingState: (state) => {
            sharedState = state;
        },
    };
}

test('the cluster follows route changes and cancellation without the center-screen state', () => {
    const cluster = makeClusterSurface();
    const firstRoute = { selectedRouteKey: 'private' };
    const rerouted = { selectedRouteKey: 'reroute' };
    assert.equal(cluster.render().stateOverride.directionsRoute, null);
    for (const route of [firstRoute, rerouted]) {
        cluster.setRoutingState({
            directionsRoute: route,
            drivingModeIsActive: true,
        });
        const rendered = cluster.render();
        assert.equal(rendered.id, 'cluster-1');
        assert.equal(rendered.stateOverride.directionsRoute, route);
        assert.equal(rendered.stateOverride.isNavigating, true);
    }
    cluster.setRoutingState({
        directionsRoute: null,
        drivingModeIsActive: false,
    });
    assert.equal(cluster.render().stateOverride.directionsRoute, null);
});

for (const delayedSession of [false, true]) {
    test(`cluster location ownership releases after unmount, including delayed acquisition: ${delayedSession}`, async () => {
        const cluster = makeClusterSurface({ delayedSession });
        cluster.render();
        const cleanup = cluster.effects[1]();
        assert.deepEqual(cluster.sessionOptions, [{ persistent: true }]);
        if (!delayedSession) await Promise.resolve();
        cleanup();
        if (delayedSession) cluster.resolveSession();
        await Promise.resolve();
        assert.equal(cluster.releases(), 1);
    });
}

test('a cluster-only session follows host day and night changes and releases its listener', () => {
    const cluster = makeClusterSurface();
    cluster.render();
    const cleanup = cluster.effects[0]();
    cluster.emitColorScheme('another-cluster', 'dark');
    cluster.emitColorScheme('cluster-1', 'dark');
    cluster.emitColorScheme('cluster-1', 'light');
    assert.deepEqual(cluster.colorSchemes, ['dark', 'light']);
    cleanup();
    assert.equal(cluster.colorListenerRemovals(), 1);
});

test('the cluster keeps only the selected route line and hides waypoint pins', () => {
    const selected = { properties: { selected: true } };
    const alternate = { properties: { selected: false } };
    const resolve = (isClusterMapSurface) =>
        evaluateDeclaration('directionsRouteFeatureCollection', {
            useMemo: (fn) => fn(),
            makeDirectionsRouteFeatureCollection: () => ({
                type: 'FeatureCollection',
                features: [selected, alternate],
            }),
            displayedDirectionsRoute: {},
            isClusterMapSurface,
        });
    assert.deepEqual(resolve(true).features, [selected]);
    assert.deepEqual(resolve(false).features, [selected, alternate]);
    assert.deepEqual(
        evaluateDeclaration('directionsWaypointMarkers', {
            useMemo: (fn) => fn(),
            isClusterMapSurface: true,
            displayedDirectionsRoute: {},
            makeAutoPlayDirectionsWaypointMarkers: () =>
                assert.fail('cluster waypoint pins'),
        }),
        [],
    );
});

test('the cluster uses the shared speed and maneuver zoom hook with 60 degree pitch', () => {
    const navigationRoute = { selectedRouteKey: 'private' };
    const options = evaluateDeclaration('followLocationMode', {
        useFollowLocationMode: (options) => options,
        cameraUpdatesAreAllowed() {},
        cameraRef: {},
        viewportMetrics: { cameraPadding: {}, height: 400 },
        clampZoomLevel: (zoom) => zoom,
        currentZoomRef: {},
        getDrivingMapViewFollowConfiguration: () => ({ pitch: 55 }),
        drivingMapViewMode: 'perspective',
        DRIVING_MAP_VIEW_ROUTE_OVERVIEW: 'route-overview',
        followPitch: ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG.followPitch,
        presenceCameraIsLocked: false,
        navigationRoute,
        followViewportAnchorY: 280,
        isDrivingMode: true,
        locationTrackingMode: 'follow',
        locationTrackingModeRef: {},
        markerLoadsEnabledRef: {},
        setTrackingMode() {},
        userLocationRef: {},
    });
    assert.equal(options.followPitch, 60);
    assert.equal(options.followIsEnabled, true);
    assert.equal(options.followSpeedZoomEnabled, true);
    assert.equal(options.navigationRoute, navigationRoute);
    assert.match(
        sourceAt('../../map-follow-location-mode.js'),
        /maneuverZoomController\.update/,
    );
    assert.match(
        sourceAt('../../map-follow-location-mode.js'),
        /const LOCATION_FOLLOW_CAMERA_PITCH = 55;/,
    );
    assert.match(
        surfaceSource,
        /<MapCanvas weatherEffectsEnabled=\{!isClusterMapSurface\}/,
    );
    assert.match(
        sourceAt('../map-canvas.js'),
        /weatherEffectsEnabled \? \(\s*<WeatherEffect/,
    );
});

test('secondary surfaces update follow zoom for every shared location without publishing another fix', () => {
    const pending = [
        parse(surfaceSource, { sourceType: 'module', plugins: ['jsx'] }),
    ];
    let effect;
    while (pending.length) {
        const node = pending.pop();
        if (!node || typeof node !== 'object') continue;
        if (
            node.type === 'CallExpression' &&
            node.callee.name === 'useEffect' &&
            surfaceSource
                .slice(node.arguments[0].start, node.arguments[0].end)
                .includes('\n            locationUpdatesEnabled ||')
        ) {
            effect = surfaceSource.slice(
                node.arguments[0].start,
                node.arguments[0].end,
            );
            break;
        }
        pending.push(
            ...Object.values(node)
                .flat()
                .filter((value) => value && typeof value === 'object'),
        );
    }
    assert.ok(effect);
    const locations = [];
    const context = {
        locationUpdatesEnabled: false,
        cameraUpdatesAreAllowed: () => true,
        locationAccessGranted: true,
        userLocation: { speed: 5, recordedAt: 1000 },
        mapBrowsingContextIsActiveRef: { current: false },
        locationTrackingModeRef: { current: 'follow' },
        LOCATION_TRACKING_NONE: 'none',
        isDrivingMode: true,
        followLocationMode: {
            start: () => assert.fail('already following'),
            handleLocationUpdate: (mode, location) =>
                locations.push({ mode, location }),
        },
        lockOnLocationMode: {
            start: () => assert.fail('cluster stays in follow'),
        },
    };
    const run = () =>
        new Function(...Object.keys(context), `return (${effect})();`)(
            ...Object.values(context),
        );
    run();
    context.userLocation = { speed: 29, recordedAt: 2000 };
    run();
    assert.deepEqual(
        locations.map(({ location }) => location.speed),
        [5, 29],
    );

    context.locationUpdatesEnabled = true;
    run();
    assert.equal(locations.length, 2);
});
