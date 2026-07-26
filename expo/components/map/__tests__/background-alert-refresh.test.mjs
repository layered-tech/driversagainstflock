import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const backgroundAlertRefreshSource = readFileSync(
    new URL('../background-alert-refresh.js', import.meta.url),
    'utf8',
);
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function createDeferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
}

function createBackgroundAlertRefreshHarness({
    getSharedMapPreferencesState = () => ({
        mapPreferencesAreLoaded: false,
        policeAlertsVisible: false,
    }),
    readMapPreferences = async () => 'enabled',
    resolveRoutingState = async () => ({
        directionsRoute: null,
        drivingModeIsActive: false,
    }),
    storageRetryDelayMs = 5,
    storageTimeoutMs = 5,
} = {}) {
    const calls = {
        alprRefreshes: 0,
        mapPreferenceReads: 0,
        routingStateReads: 0,
        wazeRefreshes: 0,
    };
    const module = { exports: {} };
    const transformedSource = transformSync(backgroundAlertRefreshSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        './background-alert-budget': {
            BACKGROUND_ALERT_STORAGE_RETRY_DELAY_MS: storageRetryDelayMs,
            BACKGROUND_ALERT_STORAGE_TIMEOUT_MS: storageTimeoutMs,
        },
        './constants': {
            MAP_PREFERENCES_STORAGE_KEY: 'map-preferences-test',
        },
        './directions': {
            getSelectedDirectionsRouteOption: () => null,
        },
        './electronic-horizon': {
            getDirectionsRouteCoordinatesAhead: () => [],
            getElectronicHorizonPrimaryCoordinates: () => [
                [-122.68, 45.52],
                [-122.67, 45.53],
            ],
        },
        './electronic-horizon-alpr-store': {
            getElectronicHorizonAlprDirectionsRoutePathKey: () => '',
            getElectronicHorizonAlprPathStateKey: () => 'path',
            refreshElectronicHorizonAlprNodesIfStale: async () => {
                calls.alprRefreshes += 1;
            },
        },
        './map-preferences': {
            getStoredPoliceAlertsVisible: (preferences) =>
                preferences.policeAlertsVisible === true,
            parseStoredMapPreferences: (storedValue) => ({
                policeAlertsVisible: storedValue === 'enabled',
            }),
        },
        './shared-map-preferences-sync': {
            getSharedMapPreferencesState,
        },
        './shared-routing-state': {
            getSharedRoutingStateForBackgroundAsync: () => {
                calls.routingStateReads += 1;

                return resolveRoutingState();
            },
        },
        './waze-police-alert-store': {
            getWazePoliceAlertsCenter: (location) =>
                location
                    ? {
                          latitude: location.latitude,
                          longitude: location.longitude,
                      }
                    : null,
            refreshWazePoliceAlertsIfStale: async () => {
                calls.wazeRefreshes += 1;
            },
            sharedWazePoliceAlertsNeedRefresh: () => true,
        },
        '@react-native-async-storage/async-storage': {
            async getItem(key) {
                calls.mapPreferenceReads += 1;
                assert.equal(key, 'map-preferences-test');

                return readMapPreferences();
            },
        },
    };
    const loadModule = new Function(
        'require',
        'module',
        'exports',
        transformedSource,
    );

    loadModule(
        (specifier) => {
            if (!(specifier in mockedModules)) {
                throw new Error(`Unexpected module request: ${specifier}`);
            }

            return mockedModules[specifier];
        },
        module,
        module.exports,
    );

    return {
        backgroundAlertRefresh: module.exports,
        calls,
    };
}

const locationContext = {
    rawLocation: {
        coords: {
            latitude: 45.52,
            longitude: -122.68,
        },
    },
    roadLookAhead: {
        primaryPath: {
            coordinates: [
                [-122.68, 45.52],
                [-122.67, 45.53],
            ],
        },
    },
};

describe('background alert refresh', () => {
    test('starts preference and routing reads together without delaying ALPR refresh', async () => {
        const preferenceRead = createDeferred();
        const routingStateRead = createDeferred();
        const { backgroundAlertRefresh, calls } =
            createBackgroundAlertRefreshHarness({
                readMapPreferences: () => preferenceRead.promise,
                resolveRoutingState: () => routingStateRead.promise,
                storageTimeoutMs: 1_000,
            });
        const refresh =
            backgroundAlertRefresh.refreshBackgroundAlertsForLocationAsync(
                locationContext,
            );

        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(calls.mapPreferenceReads, 1);
        assert.equal(calls.routingStateReads, 1);

        routingStateRead.resolve({
            directionsRoute: null,
            drivingModeIsActive: false,
        });
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(calls.alprRefreshes, 1);
        assert.equal(calls.wazeRefreshes, 0);

        preferenceRead.resolve('enabled');
        await refresh;

        assert.equal(calls.wazeRefreshes, 1);
    });

    test('times out a stalled preference read without starting another native read', async () => {
        const stalledRead = createDeferred();
        const { backgroundAlertRefresh, calls } =
            createBackgroundAlertRefreshHarness({
                readMapPreferences: () => stalledRead.promise,
            });

        await backgroundAlertRefresh.refreshBackgroundAlertsForLocationAsync(
            locationContext,
        );

        assert.equal(calls.mapPreferenceReads, 1);
        assert.equal(calls.wazeRefreshes, 0);

        await backgroundAlertRefresh.refreshBackgroundAlertsForLocationAsync(
            locationContext,
        );

        assert.equal(calls.mapPreferenceReads, 1);
        assert.equal(calls.wazeRefreshes, 0);

        stalledRead.resolve('enabled');
        await new Promise((resolve) => setImmediate(resolve));

        await backgroundAlertRefresh.refreshBackgroundAlertsForLocationAsync(
            locationContext,
        );

        assert.equal(calls.mapPreferenceReads, 1);
        assert.equal(calls.wazeRefreshes, 1);
    });

    test('backs off failed preference reads before retrying', async () => {
        let readCount = 0;
        const { backgroundAlertRefresh, calls } =
            createBackgroundAlertRefreshHarness({
                readMapPreferences: () => {
                    readCount += 1;

                    return readCount === 1
                        ? Promise.reject(new Error('Storage unavailable'))
                        : Promise.resolve('enabled');
                },
                storageRetryDelayMs: 10,
            });

        await backgroundAlertRefresh.refreshBackgroundAlertsForLocationAsync(
            locationContext,
        );
        await backgroundAlertRefresh.refreshBackgroundAlertsForLocationAsync(
            locationContext,
        );

        assert.equal(calls.mapPreferenceReads, 1);
        assert.equal(calls.wazeRefreshes, 0);

        await new Promise((resolve) => setTimeout(resolve, 15));
        await backgroundAlertRefresh.refreshBackgroundAlertsForLocationAsync(
            locationContext,
        );

        assert.equal(calls.mapPreferenceReads, 2);
        assert.equal(calls.wazeRefreshes, 1);
    });
});
