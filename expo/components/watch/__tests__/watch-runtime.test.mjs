import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function harness() {
    const modules = new Map();
    let sharedLocation = null;
    let rawLocation = null;
    let route = null;
    let readSnapshot;
    let locationListener;
    let updates = 0;
    const mocks = {
        expo: {
            requireOptionalNativeModule: () => ({
                addListener() {},
                pendingAreaReads: async () => [],
            }),
        },
        'expo-crypto': { randomUUID: () => 'phone' },
        'expo-constants': {
            default: { expoConfig: { version: 'test' } },
            __esModule: true,
        },
        'react-native': {
            Platform: { OS: 'android' },
            AppState: { addEventListener() {} },
        },
        'accepted-device-location.js': {
            getLatestAcceptedDeviceLocation: () => rawLocation,
            addAcceptedDeviceLocationListener() {},
        },
        'shared-map-preferences-sync.js': {
            getSharedMapUserLocation: () => sharedLocation,
            addSharedMapPreferencesStateListener: (listener) => {
                locationListener = listener;
            },
        },
        'shared-routing-state.js': {
            getSharedRoutingState: () => ({
                drivingModeIsActive: Boolean(route),
                directionsRoute: route,
            }),
            getDirectionsRouteGeometrySyncKey: (value) => value,
            sharedRoutingStateCanPublish: () => true,
            addSharedRoutingStateListener() {},
        },
        'shared-navigation-controller.js': {
            getSharedNavigationRerouting: () => false,
            subscribeSharedNavigationRerouting() {},
        },
        'scorecard-runtime-instance.js': {
            getScorecardActiveDriveSummary: () => null,
            getScorecardRuntimeSnapshot: () => null,
            subscribeScorecardRuntime() {},
        },
        'watch-publisher.js': {
            createWatchPublisher: (options) => {
                readSnapshot = options.readSnapshot;
                return {
                    update: () => {
                        updates++;
                    },
                };
            },
        },
        'watch-cues.js': { createWatchCuePlanner() {} },
        'watch-camera-cues.js': { createWatchCameraCuePlanner() {} },
        'watch-camera-preferences.js': {
            getWatchCameraPreferences: () => ({}),
            loadWatchCameraPreferences: async () => {},
            subscribeWatchCameraPreferences() {},
        },
        'watch-haptic-preferences.js': {
            loadWatchHapticPreferences: async () => {},
            subscribeWatchHaptics() {},
            watchHapticsEnabled: () => true,
        },
        'watch-areas-runtime.js': { refreshWatchAreas: async () => {} },
        'watch-shared-state.js': {
            getWatchUpcomingAlerts: () => [],
            getWatchAreas: () => null,
            subscribeWatchSharedState() {},
        },
        'watch-projections.js': {
            createWatchCameraAppearanceTracker: () => () => null,
            projectWatchCamera: () => null,
            projectWatchRecap: () => null,
            projectWatchPrivacyScore: () => null,
        },
        'crashlytics.js': { addCrashlyticsLog() {} },
        'config.js': {
            APP_ENVIRONMENT: 'development',
            buildApiURL: () => 'https://test.invalid',
        },
        'api-mocks.js': { mapApiMocksAreEnabled: () => false },
        'place-details-cache.js': {},
        'constants.js': {
            MINIMUM_DRIVING_COURSE_SPEED_MPS: 1.5,
            EMPTY_FEATURE_COLLECTION: {
                type: 'FeatureCollection',
                features: [],
            },
        },
    };
    function load(url) {
        const mock = mocks[url.pathname.split('/').at(-1)];
        if (mock) return mock;
        if (modules.has(url.href)) return modules.get(url.href).exports;
        const module = { exports: {} };
        modules.set(url.href, module);
        const { code } = transformSync(readFileSync(url, 'utf8'), {
            babelrc: false,
            configFile: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        });
        new Function('require', 'module', 'exports', 'setInterval', code)(
            (specifier) =>
                mocks[specifier] ??
                load(new URL(`${specifier.replace(/\.js$/, '')}.js`, url)),
            module,
            module.exports,
            () => 0,
        );
        return module.exports;
    }
    const directions = load(
        new URL('../../map/directions.js', import.meta.url),
    );
    load(
        new URL('../watch-runtime.js', import.meta.url),
    ).initializeWatchRuntime();
    return {
        directions,
        setRoute(value) {
            route = value;
        },
        setLocation(value) {
            sharedLocation = value;
            rawLocation = {
                coords: {
                    latitude: value.latitude,
                    longitude: value.longitude,
                },
                timestamp: value.recordedAt,
            };
        },
        clearSharedLocation() {
            sharedLocation = null;
        },
        setRawLocation(value) {
            rawLocation = value;
        },
        read: () => readSnapshot(1),
        notify: async () => {
            const before = updates;
            locationListener?.();
            await Promise.resolve();
            return updates - before;
        },
    };
}

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

function routeFor(directions) {
    return directions.normalizeDirectionsRoute({
        coordinates,
        maneuvers: [
            { type: 11, way_points: [0, 1], instruction: 'Depart' },
            {
                type: 7,
                exit_number: 2,
                way_points: [1, 6],
                instruction: 'Take second exit',
            },
            { type: 1, way_points: [6, 7], instruction: 'Turn right' },
            { type: 10, way_points: [7, 7], instruction: 'Arrive' },
        ],
    });
}

for (const samples of [[2, 5], [5]]) {
    test(`watch leaves roundabout with the phone, including skipped GPS samples: ${samples}`, async () => {
        const watch = harness();
        const route = routeFor(watch.directions);
        watch.setRoute(route);
        for (const index of samples) {
            const location = {
                longitude: coordinates[index][0],
                latitude: coordinates[index][1],
                recordedAt: index * 1000,
                roadMatch: { isOffRoad: false, isRoundabout: index === 2 },
            };
            watch.setLocation(location);
            const nav = watch.read().navigation;
            assert.equal(
                nav.maneuver.kind,
                index === 2 ? 'roundabout' : 'right',
            );
            assert.equal(nav.sourceAt, location.recordedAt);
            assert.equal(
                nav.maneuver.instruction,
                watch.directions.getActiveDirectionsManeuver(route, location)
                    .instruction,
            );
            if (index === 5) assert.ok(nav.maneuver.distanceMeters > 1600);
        }
        assert.equal(
            await watch.notify(),
            1,
            'matched-location updates publish even without another raw fix',
        );
        watch.setRoute(null);
        assert.equal(watch.read().navigation.status, 'idle');
    });
}

test('watch never invents a roundabout exit without a confirmed matched exit road', () => {
    const watch = harness();
    watch.setRoute(routeFor(watch.directions));
    for (const roadMatch of [
        undefined,
        { isOffRoad: true, isRoundabout: false },
        { isOffRoad: false, isRoundabout: null },
    ]) {
        watch.setLocation({
            longitude: coordinates[5][0],
            latitude: coordinates[5][1],
            recordedAt: 5000,
            roadMatch,
        });
        assert.equal(watch.read().navigation.maneuver.kind, 'roundabout');
    }
    watch.clearSharedLocation();
    assert.equal(watch.read().navigation.maneuver.kind, 'roundabout');
    assert.equal(watch.read().navigation.sourceAt, 5000);
});

test('road matching can release a roundabout at the same GPS fix and source time', async () => {
    const watch = harness();
    watch.setRoute(routeFor(watch.directions));
    const fix = {
        longitude: coordinates[5][0],
        latitude: coordinates[5][1],
        recordedAt: 5000,
    };
    watch.setLocation(fix);
    assert.equal(watch.read().navigation.maneuver.kind, 'roundabout');
    watch.setLocation({
        ...fix,
        roadMatch: { isOffRoad: false, isRoundabout: false },
    });
    assert.equal(await watch.notify(), 1);
    const nav = watch.read().navigation;
    assert.equal(nav.maneuver.kind, 'right');
    assert.equal(nav.sourceAt, 5000);
});

test('raw fixes without a source time never refresh watch freshness', () => {
    const watch = harness();
    watch.setRoute(routeFor(watch.directions));
    watch.setRawLocation({
        coords: { longitude: coordinates[5][0], latitude: coordinates[5][1] },
    });
    assert.equal(watch.read().navigation.status, 'waiting-for-location');
    assert.equal(watch.read().navigation.sourceAt, null);
    watch.setRawLocation(null);
    assert.equal(watch.read().navigation.sourceAt, null);
});

test('watch pairs shared guidance with its own source time, not a newer raw fix', () => {
    const watch = harness();
    watch.setRoute(routeFor(watch.directions));
    watch.setLocation({
        longitude: coordinates[5][0],
        latitude: coordinates[5][1],
        recordedAt: 5000,
        roadMatch: { isOffRoad: false, isRoundabout: false },
    });
    watch.setRawLocation({
        coords: { longitude: coordinates[2][0], latitude: coordinates[2][1] },
        timestamp: 6000,
    });
    const nav = watch.read().navigation;
    assert.equal(nav.maneuver.kind, 'right');
    assert.equal(nav.sourceAt, 5000);
});
