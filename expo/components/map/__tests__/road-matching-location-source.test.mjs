import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import {
    getLocationUpdateRecordedAt,
    getRoadMatchingLocationSourcePolicy,
    shouldPublishBackgroundRoadMatchingLocation,
} from '../location-watch-options.js';

const roadMatchingSessionSource = readFileSync(
    new URL('../road-matching-session.js', import.meta.url),
    'utf8',
);
const deviceLocationSource = readFileSync(
    new URL('../use-device-location.js', import.meta.url),
    'utf8',
);
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function createDeferred() {
    let reject;
    let resolve;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        reject = rejectPromise;
        resolve = resolvePromise;
    });

    return { promise, reject, resolve };
}

async function waitFor(predicate) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setImmediate(resolve));
    }

    assert.fail('Timed out waiting for the location source transition.');
}

function makeLocation(latitude, longitude, timestamp) {
    return {
        coords: {
            accuracy: 4,
            altitude: 0,
            heading: 90,
            latitude,
            longitude,
            speed: 12,
        },
        timestamp,
    };
}

function makeMatchedLocation(location) {
    return {
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        bearing: location.coords.heading,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        roadMatch: {
            edgeId: 'edge-1',
            edgeMatchProbability: 0.99,
            isOffRoad: false,
            roadName: 'Test Road',
        },
        speed: location.coords.speed,
        speedLimit: {
            speedLimitMph: 35,
        },
        timestamp: location.timestamp,
    };
}

function createUsableRoadGraph() {
    return {
        edges: [{ id: 'edge-1' }],
    };
}

function createUpdatingRoadMatcher() {
    return {
        update: makeMatchedLocation,
    };
}

function createRoadMatchingSessionHarness({
    createDirectedRoadGraph = () => ({ edges: [] }),
    createRoadMatcherWithHistory = () => null,
    getRoadCoordinateDistanceMeters = () => 0,
    getRoadCorridor = async () => [],
    predictRoadLookAhead = () => null,
    routingState = {
        directionsRoute: null,
        drivingModeIsActive: false,
    },
    settleBackgroundWorkWithinDeadlineAsync = async (work) => work,
} = {}) {
    const backgroundTaskStart = createDeferred();
    const appStateListeners = new Set();
    const autoPlaySessionStateListeners = new Set();
    const sharedRoutingStateListeners = new Set();
    const foregroundLocationCallbacks = [];
    const roadCorridorRequests = [];
    const calls = {
        backgroundStartAppStates: [],
        backgroundStarts: 0,
        backgroundStops: 0,
        foregroundRemovals: 0,
        hasStartedChecks: 0,
        performanceSignposts: [],
    };
    let backgroundTaskIsStarted = false;
    let backgroundLocationTask = null;
    let autoPlaySessionIsConnected = false;
    let currentRoutingState = routingState;
    const AppState = {
        currentState: 'active',
        addEventListener(event, listener) {
            assert.equal(event, 'change');
            appStateListeners.add(listener);

            return {
                remove() {
                    appStateListeners.delete(listener);
                },
            };
        },
    };
    const Location = {
        Accuracy: {
            BestForNavigation: 6,
        },
        ActivityType: {
            AutomotiveNavigation: 1,
        },
        async getForegroundPermissionsAsync() {
            return { granted: true };
        },
        async hasStartedLocationUpdatesAsync() {
            calls.hasStartedChecks += 1;

            return backgroundTaskIsStarted;
        },
        async startLocationUpdatesAsync() {
            calls.backgroundStarts += 1;
            calls.backgroundStartAppStates.push(AppState.currentState);
            await backgroundTaskStart.promise;
            backgroundTaskIsStarted = true;
        },
        async stopLocationUpdatesAsync() {
            calls.backgroundStops += 1;
            backgroundTaskIsStarted = false;
        },
        async watchPositionAsync(options, callback) {
            foregroundLocationCallbacks.push(callback);

            return {
                remove() {
                    calls.foregroundRemovals += 1;
                },
            };
        },
    };
    const taskManager = {
        defineTask(name, callback) {
            backgroundLocationTask = { callback, name };
        },
        isTaskDefined() {
            return false;
        },
    };
    const module = { exports: {} };
    const transformedSource = transformSync(roadMatchingSessionSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        './accepted-device-location': {
            publishAcceptedDeviceLocation() {},
        },
        '../auto-play-session-state': {
            addAutoPlaySessionStateListener(listener) {
                autoPlaySessionStateListeners.add(listener);
                listener({ isConnected: autoPlaySessionIsConnected });

                return () => {
                    autoPlaySessionStateListeners.delete(listener);
                };
            },
            autoPlaySessionOwnsForegroundLocation(platform) {
                return platform === 'android' && autoPlaySessionIsConnected;
            },
        },
        './api': {
            async getRoadCorridor(options) {
                roadCorridorRequests.push(options);

                return getRoadCorridor(options);
            },
        },
        './background-alert-refresh': {
            refreshBackgroundAlertsForLocationAsync: async () => {},
            settleBackgroundWorkWithinDeadlineAsync,
        },
        './directions': {
            getSelectedDirectionsRouteOption(route) {
                return route?.selectedRouteOption ?? route ?? null;
            },
        },
        './location-watch-options': {
            getLocationUpdateRecordedAt,
            getRoadMatchingLocationSourcePolicy,
            shouldPublishBackgroundRoadMatchingLocation,
        },
        './map-performance-signposts': {
            beginMapPerformanceSignpost(operation, metadata) {
                const identifier = calls.performanceSignposts.length + 1;

                calls.performanceSignposts.push({
                    identifier,
                    kind: 'begin',
                    metadata,
                    operation,
                });

                return identifier;
            },
            endMapPerformanceSignpost(operation, identifier, metadata) {
                calls.performanceSignposts.push({
                    identifier,
                    kind: 'end',
                    metadata,
                    operation,
                });
            },
            recordMapPerformanceSignpost(operation, metadata) {
                calls.performanceSignposts.push({
                    kind: 'event',
                    metadata,
                    operation,
                });
            },
        },
        './road-graph': {
            createDirectedRoadGraph,
            getRoadCoordinateDistanceMeters,
        },
        './road-look-ahead': {
            predictRoadLookAhead,
        },
        './road-matching-history': {
            appendRoadMatchingObservation: (history, location) => [
                ...history,
                location,
            ],
            createRoadMatcherWithHistory,
            getRoadMatchingReplayObservations: (observations) =>
                observations.filter(Boolean).slice(-4),
        },
        './shared-routing-state': {
            addSharedRoutingStateListener(listener) {
                sharedRoutingStateListeners.add(listener);
                listener(currentRoutingState);

                return () => {
                    sharedRoutingStateListeners.delete(listener);
                };
            },
            getSharedRoutingState() {
                return currentRoutingState;
            },
        },
        '../android-auto-performance-trace': {
            recordAndroidAutoPerformanceTrace() {},
        },
        'expo-location': Location,
        'expo-task-manager': taskManager,
        'react-native': {
            AppState,
            Platform: { OS: 'android' },
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
        backgroundTaskStart,
        get backgroundLocationTask() {
            return backgroundLocationTask;
        },
        calls,
        foregroundLocationCallbacks,
        get backgroundTaskIsStarted() {
            return backgroundTaskIsStarted;
        },
        roadCorridorRequests,
        roadMatchingSession: module.exports,
        setRoutingState(nextRoutingState) {
            currentRoutingState = nextRoutingState;
            sharedRoutingStateListeners.forEach((listener) =>
                listener(nextRoutingState),
            );
        },
        transitionAppState(nextState) {
            AppState.currentState = nextState;
            appStateListeners.forEach((listener) => listener(nextState));
        },
        transitionAutoPlayConnection(isConnected) {
            autoPlaySessionIsConnected = isConnected;
            autoPlaySessionStateListeners.forEach((listener) =>
                listener({ isConnected }),
            );
        },
    };
}

describe('road matching location source policy', () => {
    test('keeps the background task armed while foreground owns active driving', () => {
        assert.deepEqual(
            getRoadMatchingLocationSourcePolicy({
                activeRetainerCount: 1,
                appState: 'active',
                persistentRetainerCount: 1,
            }),
            {
                backgroundTaskIsNeeded: true,
                foregroundWatchIsNeeded: true,
            },
        );
    });

    test('stops foreground watching but preserves persistent work off screen', () => {
        assert.deepEqual(
            getRoadMatchingLocationSourcePolicy({
                activeRetainerCount: 1,
                appState: 'background',
                persistentRetainerCount: 1,
            }),
            {
                backgroundTaskIsNeeded: true,
                foregroundWatchIsNeeded: false,
            },
        );
        assert.deepEqual(
            getRoadMatchingLocationSourcePolicy({
                activeRetainerCount: 1,
                appState: 'background',
                persistentRetainerCount: 0,
            }),
            {
                backgroundTaskIsNeeded: false,
                foregroundWatchIsNeeded: false,
            },
        );
    });

    test('does not keep either source after the session is released', () => {
        assert.deepEqual(
            getRoadMatchingLocationSourcePolicy({
                activeRetainerCount: 0,
                appState: 'active',
                persistentRetainerCount: 1,
            }),
            {
                backgroundTaskIsNeeded: false,
                foregroundWatchIsNeeded: false,
            },
        );
    });

    test('keeps the persistent foreground service armed for a connected Android car owner', () => {
        assert.deepEqual(
            getRoadMatchingLocationSourcePolicy({
                activeRetainerCount: 1,
                appState: 'active',
                automotiveLocationOwnerIsActive: true,
                persistentRetainerCount: 1,
                platformOS: 'android',
            }),
            {
                backgroundTaskIsNeeded: true,
                foregroundWatchIsNeeded: true,
            },
        );
    });

    test('uses the visible CarPlay scene instead of arming a second background service on iOS', () => {
        assert.deepEqual(
            getRoadMatchingLocationSourcePolicy({
                activeRetainerCount: 1,
                appState: 'active',
                automotiveLocationOwnerIsActive: true,
                persistentRetainerCount: 1,
                platformOS: 'ios',
            }),
            {
                backgroundTaskIsNeeded: false,
                foregroundWatchIsNeeded: true,
            },
        );
    });

    test('rejects active background batches only after foreground takes ownership', () => {
        assert.equal(
            shouldPublishBackgroundRoadMatchingLocation({
                appState: 'active',
                foregroundLocationSourceIsActive: true,
            }),
            false,
        );
        assert.equal(
            shouldPublishBackgroundRoadMatchingLocation({
                appState: 'active',
                foregroundLocationSourceIsActive: false,
            }),
            true,
        );
        assert.equal(
            shouldPublishBackgroundRoadMatchingLocation({
                appState: 'background',
                foregroundLocationSourceIsActive: true,
            }),
            true,
        );
    });

    test('accepts background batches for a car owner even while foreground is active', () => {
        assert.equal(
            shouldPublishBackgroundRoadMatchingLocation({
                appState: 'active',
                automotiveLocationOwnerIsActive: true,
                foregroundLocationSourceIsActive: true,
            }),
            true,
        );
    });
});

describe('road matching location source integration', () => {
    test('does not let a delayed cached match rewind a live fix', () => {
        assert.match(
            deviceLocationSource,
            /latestDeliveredRecordedAt[\s\S]*?getLocationUpdateRecordedAt\(location\)[\s\S]*?recordedAt < latestDeliveredRecordedAt[\s\S]*?handleUserLocationUpdateRef\.current/,
        );
        assert.match(
            deviceLocationSource,
            /addRoadMatchedLocationListener\(handleLocation\)[\s\S]*?getLastRoadMatchedLocationAsync\(\)[\s\S]*?handleLocation\(location\)/,
        );
    });

    test('reconciles retained sources without invalidating persistent work on app state transitions', () => {
        const appStateListenerStart = roadMatchingSessionSource.indexOf(
            "AppState.addEventListener('change'",
        );
        const appStateListener = roadMatchingSessionSource.slice(
            appStateListenerStart,
            roadMatchingSessionSource.indexOf(
                'addAutoPlaySessionStateListener',
                appStateListenerStart,
            ),
        );

        assert.match(
            appStateListener,
            /activeRetainerCount > 0[\s\S]*?queueLocationSourceReconciliation\(\)/,
        );
        assert.doesNotMatch(appStateListener, /locationSourceGeneration \+= 1/);
        assert.match(
            appStateListener,
            /operationalAppState !== 'active'[\s\S]*?stopForegroundLocationSubscription\(\)/,
        );
    });

    test('keeps an in-flight Android foreground service armed across ownership churn and backgrounding', async () => {
        const harness = createRoadMatchingSessionHarness();
        const firstSessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        await waitFor(() => harness.calls.backgroundStarts === 1);

        const currentSessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        firstSessionHandle.remove();
        harness.transitionAppState('background');
        harness.foregroundLocationCallbacks[0]?.({
            coords: { latitude: 41, longitude: -87 },
            timestamp: 1,
        });
        harness.backgroundTaskStart.resolve();

        await waitFor(
            () =>
                harness.backgroundTaskIsStarted &&
                harness.calls.hasStartedChecks >= 2 &&
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .source === 'expo-background-location-task',
        );

        assert.deepEqual(harness.calls.backgroundStartAppStates, ['active']);
        assert.equal(harness.calls.backgroundStarts, 1);
        assert.equal(harness.calls.backgroundStops, 0);
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastRawCoordinate,
            null,
        );

        currentSessionHandle.remove();
        await waitFor(() => harness.calls.backgroundStops === 1);
    });

    test('keeps foreground fixes flowing for a connected car while the phone is backgrounded', async () => {
        const harness = createRoadMatchingSessionHarness();

        harness.transitionAppState('background');
        harness.transitionAutoPlayConnection(true);
        harness.backgroundTaskStart.resolve();
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 100));
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .lastRawCoordinate !== null,
        );

        // The while-in-use permission means only the location foreground
        // service keeps GPS alive once the phone locks, so the connected car
        // owner arms it alongside the foreground watch instead of skipping it.
        await waitFor(() => harness.backgroundTaskIsStarted);
        assert.equal(harness.calls.backgroundStarts, 1);
        assert.deepEqual(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastRawCoordinate,
            [-87, 41],
        );

        sessionHandle.remove();
    });

    test('keeps an armed background task running for a newly connected car owner', async () => {
        const harness = createRoadMatchingSessionHarness();
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        await waitFor(() => harness.calls.backgroundStarts === 1);
        harness.backgroundTaskStart.resolve();
        await waitFor(() => harness.backgroundTaskIsStarted);

        harness.transitionAppState('background');
        harness.transitionAutoPlayConnection(true);

        await waitFor(() => harness.foregroundLocationCallbacks.length === 2);

        assert.equal(harness.calls.backgroundStops, 0);
        assert.equal(harness.calls.backgroundStarts, 1);
        assert.equal(harness.backgroundTaskIsStarted, true);
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .source,
            'expo-foreground-location-watch',
        );

        sessionHandle.remove();
    });

    test('publishes background-task fixes while the car owns foreground location', async () => {
        const harness = createRoadMatchingSessionHarness();
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        harness.backgroundTaskStart.resolve();
        await waitFor(
            () =>
                harness.backgroundTaskIsStarted &&
                harness.foregroundLocationCallbacks.length === 1,
        );
        harness.transitionAutoPlayConnection(true);

        await harness.backgroundLocationTask.callback({
            data: {
                locations: [makeLocation(41, -87, 100)],
            },
            error: null,
        });

        const diagnostics =
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics();

        assert.deepEqual(diagnostics.lastRawCoordinate, [-87, 41]);
        assert.equal(
            diagnostics.lastUpdateSource,
            'expo-background-location-task',
        );

        sessionHandle.remove();
    });

    test('drops fixes that are not strictly newer while both car sources deliver', async () => {
        const harness = createRoadMatchingSessionHarness();
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        harness.backgroundTaskStart.resolve();
        await waitFor(
            () =>
                harness.backgroundTaskIsStarted &&
                harness.foregroundLocationCallbacks.length === 1,
        );
        harness.transitionAutoPlayConnection(true);

        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 100));
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .lastRawCoordinate !== null,
        );

        // The same fused-provider fix arriving through the background task is
        // a duplicate, not fresher data, and must not publish twice.
        await harness.backgroundLocationTask.callback({
            data: {
                locations: [makeLocation(40.9, -87.1, 100)],
            },
            error: null,
        });

        assert.deepEqual(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastRawCoordinate,
            [-87, 41],
        );
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastUpdateSource,
            'expo-foreground-location-watch',
        );

        await harness.backgroundLocationTask.callback({
            data: {
                locations: [makeLocation(41.1, -86.9, 200)],
            },
            error: null,
        });

        assert.deepEqual(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastRawCoordinate,
            [-86.9, 41.1],
        );
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastUpdateSource,
            'expo-background-location-task',
        );

        sessionHandle.remove();
    });

    test('runs foreground and persistent background sources together while active', () => {
        assert.match(
            roadMatchingSessionSource,
            /backgroundTaskPromise = locationSourcePolicy\.backgroundTaskIsNeeded[\s\S]*?startBackgroundLocationTask\(expectedGeneration\)[\s\S]*?startForegroundLocationSubscription\(expectedGeneration\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /activeRetainerCount > 0 &&[\s\S]*?getOperationalAppState\(\) === 'active' &&[\s\S]*?activeLocationSubscription = subscription/,
        );
    });

    test('retries a pending foreground watch for the current generation', () => {
        assert.match(
            roadMatchingSessionSource,
            /locationSubscriptionPromiseGeneration = expectedGeneration[\s\S]*?Location\.watchPositionAsync/,
        );
        assert.match(
            roadMatchingSessionSource,
            /pendingGeneration = locationSubscriptionPromiseGeneration[\s\S]*?await locationSubscriptionPromise[\s\S]*?pendingGeneration === expectedGeneration[\s\S]*?return startForegroundLocationSubscription\(expectedGeneration\)/,
        );
    });

    test('guards live publication without suppressing background alert work', () => {
        assert.match(
            roadMatchingSessionSource,
            /source === BACKGROUND_LOCATION_SOURCE &&[\s\S]*?shouldPublishBackgroundRoadMatchingLocation\([\s\S]*?foregroundLocationSourceIsActive\(\)[\s\S]*?return;/,
        );
        assert.match(
            roadMatchingSessionSource,
            /latestLocation = locations\.at\(-1\)[\s\S]*?publishRawLocationAsync\([\s\S]*?latestLocation[\s\S]*?runBackgroundLocationWorkAsync\(latestLocation\)/,
        );
    });

    test('does not calculate an electronic horizon while following a route', async () => {
        let lookAheadPredictionCount = 0;
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: createUpdatingRoadMatcher,
            getRoadCorridor: async () => [{ id: 'way-1' }],
            predictRoadLookAhead() {
                lookAheadPredictionCount += 1;

                return { primaryPath: { segments: [] } };
            },
            routingState: {
                directionsRoute: { id: 'active-route' },
                drivingModeIsActive: true,
            },
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 100));
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );

        assert.equal(lookAheadPredictionCount, 0);

        sessionHandle.remove();
    });

    test('clears the previous session location before a new session starts', async () => {
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: createUpdatingRoadMatcher,
            getRoadCorridor: async () => [{ id: 'way-1' }],
        });
        const firstSessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 100));
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );
        assert.ok(
            await harness.roadMatchingSession.getLastRoadMatchedLocationAsync(),
        );

        firstSessionHandle.remove();

        assert.equal(
            await harness.roadMatchingSession.getLastRoadMatchedLocationAsync(),
            null,
        );
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastRawCoordinate,
            null,
        );

        const secondSessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        assert.equal(
            await harness.roadMatchingSession.getLastRoadMatchedLocationAsync(),
            null,
        );

        secondSessionHandle.remove();
    });

    test('gives the puck matcher only the actively followed route coordinates', async () => {
        const preferredRouteCoordinates = [
            [-87, 41],
            [-86.99, 41],
        ];
        const matchingContexts = [];
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: () => ({
                update(location, context) {
                    matchingContexts.push(context);

                    return makeMatchedLocation(location);
                },
            }),
            getRoadCorridor: async () => [{ id: 'way-1' }],
            routingState: {
                directionsRoute: {
                    selectedRouteOption: {
                        coordinates: preferredRouteCoordinates,
                    },
                },
                drivingModeIsActive: true,
            },
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 100));
        await waitFor(() => matchingContexts.length === 1);

        assert.equal(
            matchingContexts[0].preferredRouteCoordinates,
            preferredRouteCoordinates,
        );

        harness.setRoutingState({
            directionsRoute: {
                selectedRouteOption: {
                    coordinates: preferredRouteCoordinates,
                },
            },
            drivingModeIsActive: false,
        });
        harness.foregroundLocationCallbacks[0](makeLocation(41, -86.99, 200));
        await waitFor(() => matchingContexts.length === 2);

        assert.equal(matchingContexts[1].preferredRouteCoordinates, null);

        sessionHandle.remove();
    });

    test('resumes electronic horizon calculation after route guidance stops', async () => {
        let lookAheadPredictionCount = 0;
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: createUpdatingRoadMatcher,
            getRoadCorridor: async () => [{ id: 'way-1' }],
            predictRoadLookAhead() {
                lookAheadPredictionCount += 1;

                return { primaryPath: { segments: [] } };
            },
            routingState: {
                directionsRoute: { id: 'active-route' },
                drivingModeIsActive: true,
            },
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 100));
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );
        harness.setRoutingState({
            directionsRoute: null,
            drivingModeIsActive: false,
        });
        harness.foregroundLocationCallbacks[0](
            makeLocation(41.001, -87.001, 200),
        );
        await waitFor(() => lookAheadPredictionCount === 1);

        sessionHandle.remove();
    });

    test('rejects a late fix from a removed watcher before mutating matcher state', async () => {
        let matcherUpdateCount = 0;
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: () => ({
                update(location) {
                    matcherUpdateCount += 1;

                    return makeMatchedLocation(location);
                },
            }),
            getRoadCorridor: async () => [{ id: 'way-1' }],
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        const removedWatcherCallback = harness.foregroundLocationCallbacks[0];

        removedWatcherCallback(makeLocation(41, -87, 100));
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );

        harness.transitionAppState('background');
        await waitFor(() => harness.calls.foregroundRemovals === 1);
        harness.transitionAppState('active');
        await waitFor(() => harness.foregroundLocationCallbacks.length === 2);

        harness.foregroundLocationCallbacks.at(-1)(
            makeLocation(41.1, -86.9, 300),
        );
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .lastRawCoordinate?.[0] === -86.9,
        );
        const updateCountBeforeLateFix = matcherUpdateCount;

        removedWatcherCallback(makeLocation(40.9, -87.1, 200));
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .lastRawCoordinate,
            [-86.9, 41.1],
        );
        assert.equal(matcherUpdateCount, updateCountBeforeLateFix);

        sessionHandle.remove();
    });

    test('closes an in-flight graph request signpost when the session aborts it', async () => {
        const corridorRequest = createDeferred();
        const harness = createRoadMatchingSessionHarness({
            getRoadCorridor: () => corridorRequest.promise,
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 100));
        await waitFor(() => harness.roadCorridorRequests.length === 1);

        const requestBegin = harness.calls.performanceSignposts.find(
            (signpost) =>
                signpost.kind === 'begin' &&
                signpost.operation === 'road.graph.request',
        );

        assert.ok(requestBegin);

        sessionHandle.remove();

        const abortedRequestEnds = harness.calls.performanceSignposts.filter(
            (signpost) =>
                signpost.kind === 'end' &&
                signpost.operation === 'road.graph.request' &&
                signpost.identifier === requestBegin.identifier,
        );

        assert.equal(abortedRequestEnds.length, 1);
        assert.equal(abortedRequestEnds[0].metadata.aborted, true);

        const abortError = new Error('Request aborted.');

        abortError.name = 'AbortError';
        corridorRequest.reject(abortError);
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(
            harness.calls.performanceSignposts.filter(
                (signpost) =>
                    signpost.kind === 'end' &&
                    signpost.operation === 'road.graph.request' &&
                    signpost.identifier === requestBegin.identifier,
            ).length,
            1,
        );
    });

    test('shares background corridor work with foreground after the task deadline returns', async () => {
        const corridorRequest = createDeferred();
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: createUpdatingRoadMatcher,
            getRoadCorridor: () => corridorRequest.promise,
            settleBackgroundWorkWithinDeadlineAsync: async () => false,
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        harness.backgroundTaskStart.resolve();
        await waitFor(
            () =>
                harness.backgroundTaskIsStarted &&
                harness.foregroundLocationCallbacks.length === 1,
        );

        harness.transitionAppState('background');
        await harness.backgroundLocationTask.callback({
            data: {
                locations: [makeLocation(41, -87, 1)],
            },
            error: null,
        });
        await waitFor(() => harness.roadCorridorRequests.length === 1);

        harness.transitionAppState('active');
        await waitFor(() => harness.foregroundLocationCallbacks.length === 2);
        harness.foregroundLocationCallbacks.at(-1)(
            makeLocation(41.001, -87.001, 2),
        );
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(harness.roadCorridorRequests.length, 1);

        corridorRequest.resolve([{ id: 'way-1' }]);
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .roadGraphLoadCount,
            1,
        );

        sessionHandle.remove();
    });

    test('lets foreground retry immediately after a background cold-start failure', async () => {
        const failedBackgroundRequest = createDeferred();
        const successfulForegroundRequest = createDeferred();
        const corridorRequests = [
            failedBackgroundRequest.promise,
            successfulForegroundRequest.promise,
        ];
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: createUpdatingRoadMatcher,
            getRoadCorridor: () => corridorRequests.shift(),
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        harness.backgroundTaskStart.resolve();
        await waitFor(
            () =>
                harness.backgroundTaskIsStarted &&
                harness.foregroundLocationCallbacks.length === 1,
        );
        harness.transitionAppState('background');

        const failedTask = harness.backgroundLocationTask.callback({
            data: {
                locations: [makeLocation(41, -87, 1)],
            },
            error: null,
        });

        await waitFor(() => harness.roadCorridorRequests.length === 1);
        failedBackgroundRequest.reject(new Error('Corridor unavailable'));
        await failedTask;

        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .state,
            'road-graph-error',
        );

        await harness.backgroundLocationTask.callback({
            data: {
                locations: [makeLocation(41.001, -87.001, 2)],
            },
            error: null,
        });
        assert.equal(harness.roadCorridorRequests.length, 1);
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .state,
            'road-graph-error',
        );

        harness.transitionAppState('active');
        await waitFor(() => harness.foregroundLocationCallbacks.length === 2);
        harness.foregroundLocationCallbacks.at(-1)(
            makeLocation(41.002, -87.002, 3),
        );
        await waitFor(() => harness.roadCorridorRequests.length === 2);

        successfulForegroundRequest.resolve([{ id: 'way-1' }]);
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );

        sessionHandle.remove();
    });

    test('lets a joined foreground watcher retry a failed background-origin request', async () => {
        const failedBackgroundRequest = createDeferred();
        const successfulForegroundRequest = createDeferred();
        const corridorRequests = [
            failedBackgroundRequest.promise,
            successfulForegroundRequest.promise,
        ];
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: createUpdatingRoadMatcher,
            getRoadCorridor: () => corridorRequests.shift(),
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync({
                persistent: true,
            });

        harness.backgroundTaskStart.resolve();
        await waitFor(
            () =>
                harness.backgroundTaskIsStarted &&
                harness.foregroundLocationCallbacks.length === 1,
        );
        harness.transitionAppState('background');
        const backgroundTask = harness.backgroundLocationTask.callback({
            data: {
                locations: [makeLocation(41, -87, 1)],
            },
            error: null,
        });

        await waitFor(() => harness.roadCorridorRequests.length === 1);

        harness.transitionAppState('active');
        await waitFor(() => harness.foregroundLocationCallbacks.length === 2);
        harness.foregroundLocationCallbacks.at(-1)(
            makeLocation(41.001, -87.001, 2),
        );
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(harness.roadCorridorRequests.length, 1);

        failedBackgroundRequest.reject(new Error('Corridor unavailable'));
        await backgroundTask;
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'road-graph-error',
        );

        harness.foregroundLocationCallbacks.at(-1)(
            makeLocation(41.002, -87.002, 3),
        );
        await waitFor(() => harness.roadCorridorRequests.length === 2);

        successfulForegroundRequest.resolve([{ id: 'way-1' }]);
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );

        sessionHandle.remove();
    });

    test('keeps the current match active when a corridor refresh fails', async () => {
        const initialRequest = createDeferred();
        const refreshRequest = createDeferred();
        const corridorRequests = [
            initialRequest.promise,
            refreshRequest.promise,
        ];
        const harness = createRoadMatchingSessionHarness({
            createDirectedRoadGraph: createUsableRoadGraph,
            createRoadMatcherWithHistory: createUpdatingRoadMatcher,
            getRoadCoordinateDistanceMeters: () => 1500,
            getRoadCorridor: () => corridorRequests.shift(),
        });
        const sessionHandle =
            await harness.roadMatchingSession.retainRoadMatchingSessionAsync();

        await waitFor(() => harness.foregroundLocationCallbacks.length === 1);
        harness.foregroundLocationCallbacks[0](makeLocation(41, -87, 1));
        await waitFor(() => harness.roadCorridorRequests.length === 1);
        initialRequest.resolve([{ id: 'way-1' }]);
        await waitFor(
            () =>
                harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                    .state === 'matched',
        );

        harness.foregroundLocationCallbacks[0](makeLocation(41.02, -87.02, 2));
        await waitFor(() => harness.roadCorridorRequests.length === 2);
        assert.equal(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics()
                .state,
            'matched',
        );

        refreshRequest.reject(new Error('Refresh unavailable'));
        await new Promise((resolve) => setImmediate(resolve));
        harness.foregroundLocationCallbacks[0](makeLocation(41.03, -87.03, 3));
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(harness.roadCorridorRequests.length, 2);
        assert.deepEqual(
            harness.roadMatchingSession.getRoadMatchingSessionDiagnostics(),
            {
                activeRetainerCount: 1,
                lastBackgroundDelivery: null,
                lastBackgroundDeliveryAppState: null,
                lastRawCoordinate: [-87.03, 41.03],
                lastUpdateAppState: 'active',
                lastUpdateSource: 'expo-foreground-location-watch',
                persistentRetainerCount: 0,
                roadEdgeCount: 1,
                roadGraphLoadCount: 1,
                source: 'expo-foreground-location-watch',
                state: 'matched',
            },
        );

        sessionHandle.remove();
    });
});
