import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { recordAndroidAutoPerformanceTrace } from '../android-auto-performance-trace';
import {
    addAutoPlaySessionStateListener,
    autoPlaySessionOwnsForegroundLocation,
} from '../auto-play-session-state';
import { getRoadCorridor } from './api';
import {
    refreshBackgroundAlertsForLocationAsync,
    settleBackgroundWorkWithinDeadlineAsync,
} from './background-alert-refresh';
import { getSelectedDirectionsRouteOption } from './directions';
import {
    getLocationUpdateRecordedAt,
    getRoadMatchingLocationSourcePolicy,
    shouldPublishBackgroundRoadMatchingLocation,
} from './location-watch-options';
import {
    beginMapPerformanceSignpost,
    endMapPerformanceSignpost,
    recordMapPerformanceSignpost,
} from './map-performance-signposts';
import {
    createDirectedRoadGraph,
    getRoadCoordinateDistanceMeters,
} from './road-graph';
import { predictRoadLookAhead } from './road-look-ahead';
import {
    appendRoadMatchingObservation,
    createRoadMatcherWithHistory,
    getRoadMatchingReplayObservations,
} from './road-matching-history';
import {
    addSharedRoutingStateListener,
    getSharedRoutingState,
} from './shared-routing-state';

const ROAD_CORRIDOR_RADIUS_METERS = 3200;
const ROAD_CORRIDOR_REFRESH_DISTANCE_METERS = 1200;
const ROAD_CORRIDOR_RETRY_DELAY_MS = 30000;
const ROAD_CORRIDOR_REQUEST_TIMEOUT_MS = 23000;
const BACKGROUND_LOCATION_TASK_DEADLINE_MS = 24000;
const ROAD_LOOK_AHEAD_DISTANCE_METERS = 2000;
const ROAD_MATCHING_LOCATION_RETRY_DELAY_MS = 5000;
const SLOW_MAP_PIPELINE_OPERATION_THRESHOLD_MS = 8;

export const ROAD_MATCHING_BACKGROUND_LOCATION_TASK =
    'driversagainstflock-road-matching-location';

const BACKGROUND_LOCATION_SOURCE = 'expo-background-location-task';
const FOREGROUND_LOCATION_SOURCE = 'expo-foreground-location-watch';

let activeRetainerCount = 0;
let activePersistentRetainerCount = 0;
let activeLocationSubscription = null;
let activeLocationSubscriptionGeneration = null;
let foregroundLocationRemovalPromise = null;
let activeLocationSource = 'none';
let backgroundPermissionRequestAttempted = false;
let backgroundPermissionRequestIsActive = false;
let locationSourceGeneration = 0;
let idleLocationSourceCleanupTimeout = null;
let locationSourceReconciliation = Promise.resolve();
let locationSourceRetryTimeout = null;
let locationSubscriptionPromise = null;
let locationSubscriptionPromiseGeneration = null;
let graphRequest = null;
let graphRequestAbortController = null;
let graphRequestGeneration = 0;
let graphCenter = null;
let lastGraphRequestFailure = null;
let lastBackgroundDelivery = null;
let lastBackgroundDeliveryAppState = null;
let lastRawLocation = null;
let lastRawLocationAppState = null;
let lastRawLocationRecordedAt = null;
let lastRawLocationSource = null;
let lastRoadLookAhead = null;
let lastRoadMatchedLocation = null;
let matcher = null;
let roadGraph = null;
let roadGraphLoadCount = 0;
let roadLookAheadMode = 'free-drive';
let rawLocationHistory = [];
let sessionState = 'idle';

const locationListeners = new Set();
const lookAheadListeners = new Set();
const sessionStateListeners = new Set();

if (!TaskManager.isTaskDefined(ROAD_MATCHING_BACKGROUND_LOCATION_TASK)) {
    TaskManager.defineTask(
        ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
        async ({ data, error }) => {
            if (error) {
                setSessionState('location-error');
                return;
            }

            await settleBackgroundWorkWithinDeadlineAsync(
                processBackgroundLocationTaskAsync(data),
                BACKGROUND_LOCATION_TASK_DEADLINE_MS,
            );
        },
    );
}

AppState.addEventListener('change', (nextState) => {
    const operationalAppState = getOperationalAppState(nextState);

    if (activeRetainerCount > 0) {
        clearIdleLocationSourceCleanup();

        if (operationalAppState !== 'active') {
            void stopForegroundLocationSubscription();
        }

        void queueLocationSourceReconciliation();
        return;
    }

    if (operationalAppState === 'active') {
        scheduleIdleLocationSourceCleanup();
    } else {
        clearIdleLocationSourceCleanup();
    }
});

addAutoPlaySessionStateListener(() => {
    const operationalAppState = getOperationalAppState();

    if (activeRetainerCount > 0) {
        clearIdleLocationSourceCleanup();

        if (operationalAppState !== 'active') {
            void stopForegroundLocationSubscription();
        }

        void queueLocationSourceReconciliation();
        return;
    }

    if (operationalAppState === 'active') {
        scheduleIdleLocationSourceCleanup();
    } else {
        clearIdleLocationSourceCleanup();
    }
});

if (getOperationalAppState() === 'active') {
    scheduleIdleLocationSourceCleanup();
}

addSharedRoutingStateListener((routingState) => {
    if (activeDirectionsRouteIsBeingFollowed(routingState)) {
        disableRoadLookAheadForActiveRoute();
    }
});

function emit(listeners, value) {
    listeners.forEach((listener) => listener(value));
}

function automotiveLocationOwnerIsActive() {
    return autoPlaySessionOwnsForegroundLocation(Platform.OS);
}

function getOperationalAppState(appState = AppState.currentState) {
    return appState === 'active' || automotiveLocationOwnerIsActive()
        ? 'active'
        : (appState ?? 'unknown');
}

async function runBackgroundLocationWorkAsync(rawLocation) {
    const context = {
        location: lastRoadMatchedLocation,
        rawLocation,
        roadLookAhead: lastRoadLookAhead,
    };

    await refreshBackgroundAlertsForLocationAsync(context);
}

async function processBackgroundLocationTaskAsync(data) {
    const locations = Array.isArray(data?.locations) ? data.locations : [];
    const latestLocation = locations.at(-1);

    if (!latestLocation) {
        return;
    }

    const taskIsStarted = await Location.hasStartedLocationUpdatesAsync(
        ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
    ).catch(() => false);

    if (!taskIsStarted) {
        return;
    }

    const locationPublication = publishRawLocationAsync(
        latestLocation,
        BACKGROUND_LOCATION_SOURCE,
    );
    const alertRefresh = runBackgroundLocationWorkAsync(latestLocation);

    await Promise.allSettled([locationPublication, alertRefresh]);
}

function setSessionState(nextState) {
    if (sessionState === nextState) {
        return;
    }

    sessionState = nextState;
    emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());
}

function setSessionStateToObservingIfAwaitingLocation() {
    if (
        sessionState === 'matched' ||
        sessionState === 'off-road' ||
        sessionState === 'loading-road-graph'
    ) {
        return;
    }

    setSessionState('observing');
}

function setActiveLocationSource(nextSource) {
    if (activeLocationSource === nextSource) {
        return;
    }

    activeLocationSource = nextSource;
    emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());
}

function foregroundLocationSourceIsActive() {
    return (
        activeLocationSubscription !== null &&
        activeLocationSubscriptionGeneration === locationSourceGeneration
    );
}

function getFiniteNumber(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function getRawLocationCoordinate(location) {
    const latitude = getFiniteNumber(
        location?.latitude ?? location?.coords?.latitude,
    );
    const longitude = getFiniteNumber(
        location?.longitude ?? location?.coords?.longitude,
    );

    return latitude !== null && longitude !== null
        ? [longitude, latitude]
        : null;
}

function makeRoadSpeedLimit(speedLimit) {
    const speedLimitMph = getFiniteNumber(speedLimit?.speedLimitMph);

    if (speedLimitMph === null) {
        return null;
    }

    return {
        maxspeed:
            typeof speedLimit?.maxspeed === 'string'
                ? speedLimit.maxspeed
                : `${Math.round(speedLimitMph)} mph`,
        speed: getFiniteNumber(speedLimit?.speed) ?? speedLimitMph,
        speedLimitMph,
        unit: typeof speedLimit?.unit === 'string' ? speedLimit.unit : 'mph',
    };
}

function makeRoadMatchedPosition(matchedLocation) {
    const speedLimit = makeRoadSpeedLimit(matchedLocation.speedLimit);
    const roadMatch = {
        ...matchedLocation.roadMatch,
        roadContext: {
            components: matchedLocation.roadMatch?.roadName
                ? [{ text: matchedLocation.roadMatch.roadName }]
                : [],
            edgeId: matchedLocation.roadMatch?.edgeId ?? '',
            edgeMatchProbability:
                matchedLocation.roadMatch?.edgeMatchProbability ?? 0,
            isOffRoad: matchedLocation.roadMatch?.isOffRoad === true,
            primaryText: matchedLocation.roadMatch?.roadName ?? '',
        },
        speedLimit,
    };

    return {
        coords: {
            accuracy: matchedLocation.accuracy,
            altitude: matchedLocation.altitude,
            course: matchedLocation.bearing,
            heading: matchedLocation.bearing,
            latitude: matchedLocation.latitude,
            longitude: matchedLocation.longitude,
            speed: matchedLocation.speed,
        },
        locationProvider: 'in-house-road-matcher',
        roadMatch,
        timestamp: matchedLocation.timestamp,
    };
}

function makeUnmatchedPosition(location) {
    const coordinate = getRawLocationCoordinate(location);

    if (!coordinate) {
        return null;
    }

    return {
        ...location,
        locationProvider: 'expo-location-unmatched',
        roadMatch: {
            edgeId: null,
            edgeMatchProbability: 0,
            isOffRoad: true,
            isTeleport: false,
            offRoadProbability: 1,
            roadContext: {
                components: [],
                edgeId: '',
                edgeMatchProbability: 0,
                isOffRoad: true,
                primaryText: '',
            },
            speedLimit: null,
            wayId: null,
        },
    };
}

function activeDirectionsRouteIsBeingFollowed(
    routingState = getSharedRoutingState(),
) {
    return (
        routingState?.drivingModeIsActive === true &&
        Boolean(routingState?.directionsRoute)
    );
}

function getActiveDirectionsRouteCoordinates(
    routingState = getSharedRoutingState(),
) {
    if (!activeDirectionsRouteIsBeingFollowed(routingState)) {
        return null;
    }

    return (
        getSelectedDirectionsRouteOption(routingState.directionsRoute)
            ?.coordinates ?? null
    );
}

function disableRoadLookAheadForActiveRoute() {
    if (roadLookAheadMode !== 'active-route') {
        roadLookAheadMode = 'active-route';
        recordAndroidAutoPerformanceTrace(
            'road.look_ahead.disabled_for_active_route',
        );
    }

    if (lastRoadLookAhead !== null) {
        lastRoadLookAhead = null;
        emit(lookAheadListeners, null);
    }
}

function updateRoadLookAhead(matchedLocation) {
    if (activeDirectionsRouteIsBeingFollowed()) {
        disableRoadLookAheadForActiveRoute();
        return;
    }

    if (roadLookAheadMode !== 'free-drive') {
        roadLookAheadMode = 'free-drive';
        recordAndroidAutoPerformanceTrace(
            'road.look_ahead.enabled_for_free_drive',
        );
    }

    const predictionStartedAt = Date.now();
    const nextRoadLookAhead =
        matchedLocation?.roadMatch?.isOffRoad === false
            ? predictRoadLookAhead({
                  graph: roadGraph,
                  matchedLocation,
                  maximumDistanceMeters: ROAD_LOOK_AHEAD_DISTANCE_METERS,
              })
            : null;
    const predictionDurationMs = Date.now() - predictionStartedAt;

    if (predictionDurationMs >= SLOW_MAP_PIPELINE_OPERATION_THRESHOLD_MS) {
        recordMapPerformanceSignpost('road.look_ahead.slow', {
            durationMs: predictionDurationMs,
            edgeCount: roadGraph?.edges?.length ?? 0,
            hasPrimaryPath: nextRoadLookAhead?.primaryPath ? true : false,
        });
    }

    lastRoadLookAhead = nextRoadLookAhead;
    emit(lookAheadListeners, nextRoadLookAhead);
    recordAndroidAutoPerformanceTrace('road.look_ahead.computed', {
        durationMs: predictionDurationMs,
        hasPrimaryPath: nextRoadLookAhead?.primaryPath ? true : false,
    });
}

function applyRawLocation(location) {
    lastRawLocation = location;

    const matcherStartedAt = Date.now();
    const matchedLocation =
        matcher?.update(location, {
            preferredRouteCoordinates: getActiveDirectionsRouteCoordinates(),
        }) ?? null;
    const matcherDurationMs = Date.now() - matcherStartedAt;

    if (matcherDurationMs >= SLOW_MAP_PIPELINE_OPERATION_THRESHOLD_MS) {
        recordMapPerformanceSignpost('road.matcher.slow', {
            durationMs: matcherDurationMs,
            edgeCount: roadGraph?.edges?.length ?? 0,
            matched: matchedLocation?.roadMatch?.isOffRoad === false,
        });
    }

    const nextLocation = matchedLocation
        ? makeRoadMatchedPosition(matchedLocation)
        : makeUnmatchedPosition(location);

    if (!nextLocation) {
        return;
    }

    lastRoadMatchedLocation = nextLocation;
    setSessionState(
        matchedLocation?.roadMatch?.isOffRoad === false
            ? 'matched'
            : roadGraph
              ? 'off-road'
              : sessionState === 'road-graph-error'
                ? 'road-graph-error'
                : 'loading-road-graph',
    );
    const locationListenerStartedAt = Date.now();

    emit(locationListeners, nextLocation);

    const locationListenerDurationMs = Date.now() - locationListenerStartedAt;
    updateRoadLookAhead(matchedLocation);
    recordAndroidAutoPerformanceTrace('road.location.applied', {
        listenerDurationMs: locationListenerDurationMs,
        matcherDurationMs,
        matched: matchedLocation?.roadMatch?.isOffRoad === false,
    });
}

function updateBackgroundDeliveryDiagnostics(location, appState) {
    const rawCoordinate = getRawLocationCoordinate(location);
    const matchedCoordinate = getRawLocationCoordinate(lastRoadMatchedLocation);

    lastBackgroundDeliveryAppState = appState;
    lastBackgroundDelivery = {
        appState,
        matchedCoordinate,
        matchedEdgeId: lastRoadMatchedLocation?.roadMatch?.edgeId ?? null,
        rawCoordinate,
        speedLimitMph:
            lastRoadMatchedLocation?.roadMatch?.speedLimit?.speedLimitMph ??
            null,
    };
    emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());
}

async function publishRawLocationAsync(
    location,
    source,
    expectedLocationSourceGeneration = null,
) {
    if (
        expectedLocationSourceGeneration !== null &&
        expectedLocationSourceGeneration !== locationSourceGeneration
    ) {
        return;
    }

    const currentAppState = AppState.currentState ?? 'unknown';
    const operationalAppState = getOperationalAppState(currentAppState);
    const automotiveOwnerIsActive = automotiveLocationOwnerIsActive();

    if (
        source === BACKGROUND_LOCATION_SOURCE &&
        !shouldPublishBackgroundRoadMatchingLocation({
            appState: operationalAppState,
            automotiveLocationOwnerIsActive: automotiveOwnerIsActive,
            foregroundLocationSourceIsActive:
                foregroundLocationSourceIsActive(),
        })
    ) {
        return;
    }

    const recordedAt = getLocationUpdateRecordedAt(location);

    // Both sources run together for a connected car and draw from the same
    // fused provider, so a fix that is not strictly newer is a duplicate.
    if (
        recordedAt !== null &&
        lastRawLocationRecordedAt !== null &&
        (automotiveOwnerIsActive
            ? recordedAt <= lastRawLocationRecordedAt
            : recordedAt < lastRawLocationRecordedAt)
    ) {
        return;
    }

    if (recordedAt !== null) {
        lastRawLocationRecordedAt = Math.max(
            lastRawLocationRecordedAt ?? recordedAt,
            recordedAt,
        );
    }

    if (source === BACKGROUND_LOCATION_SOURCE) {
        setActiveLocationSource(BACKGROUND_LOCATION_SOURCE);
    }

    lastRawLocationAppState = currentAppState;
    rawLocationHistory = appendRoadMatchingObservation(
        rawLocationHistory,
        location,
    );
    const updateWasDeliveredInBackground =
        source === BACKGROUND_LOCATION_SOURCE &&
        lastRawLocationAppState === 'background';

    lastRawLocationSource = source;
    emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());
    applyRawLocation(location);
    emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());

    if (updateWasDeliveredInBackground) {
        updateBackgroundDeliveryDiagnostics(location, currentAppState);
    }

    const graphBeforeRequest = roadGraph;

    await ensureRoadGraph(location, source);

    if (
        graphBeforeRequest !== roadGraph &&
        lastRawLocation &&
        (expectedLocationSourceGeneration === null ||
            expectedLocationSourceGeneration === locationSourceGeneration)
    ) {
        applyRawLocation(lastRawLocation);

        if (updateWasDeliveredInBackground && lastRawLocation === location) {
            updateBackgroundDeliveryDiagnostics(location, currentAppState);
        }
    }
}

function roadGraphNeedsRefresh(location) {
    if (!roadGraph || !graphCenter) {
        return true;
    }

    const coordinate = getRawLocationCoordinate(location);
    const distanceMeters = coordinate
        ? getRoadCoordinateDistanceMeters(graphCenter, coordinate)
        : null;

    return (
        distanceMeters !== null &&
        distanceMeters >= ROAD_CORRIDOR_REFRESH_DISTANCE_METERS
    );
}

async function ensureRoadGraph(location, source) {
    if (!roadGraphNeedsRefresh(location)) {
        return null;
    }

    if (graphRequest) {
        return graphRequest;
    }

    if (
        lastGraphRequestFailure?.source === source &&
        Date.now() - lastGraphRequestFailure.failedAt <
            ROAD_CORRIDOR_RETRY_DELAY_MS
    ) {
        return null;
    }

    const coordinate = getRawLocationCoordinate(location);

    if (!coordinate) {
        return null;
    }

    graphRequestAbortController?.abort();
    const requestAbortController = new AbortController();
    const requestContext = Object.freeze({
        originSource: source,
        startedWithRoadGraph: roadGraph !== null,
    });
    const requestGeneration = graphRequestGeneration;
    const requestStartedAt = Date.now();
    let requestTimedOut = false;
    const requestTimeoutId = setTimeout(() => {
        requestTimedOut = true;
        requestAbortController.abort();
    }, ROAD_CORRIDOR_REQUEST_TIMEOUT_MS);

    graphRequestAbortController = requestAbortController;

    if (!requestContext.startedWithRoadGraph) {
        setSessionState('loading-road-graph');
    }

    recordAndroidAutoPerformanceTrace('road_graph.requested', {
        hadExistingGraph: requestContext.startedWithRoadGraph,
        source,
    });
    const requestSignpostIdentifier = beginMapPerformanceSignpost(
        'road.graph.request',
        {
            hadExistingGraph: requestContext.startedWithRoadGraph,
            source,
        },
    );
    let requestSignpostDidEnd = false;
    const endRequestSignpost = (metadata) => {
        if (requestSignpostDidEnd) {
            return;
        }

        requestSignpostDidEnd = true;
        endMapPerformanceSignpost(
            'road.graph.request',
            requestSignpostIdentifier,
            metadata,
        );
    };
    const handleRequestAbort = () => {
        endRequestSignpost({
            aborted: true,
            durationMs: Date.now() - requestStartedAt,
        });
    };

    requestAbortController.signal.addEventListener(
        'abort',
        handleRequestAbort,
        { once: true },
    );

    graphRequest = getRoadCorridor({
        location: {
            latitude: coordinate[1],
            longitude: coordinate[0],
        },
        radiusMeters: ROAD_CORRIDOR_RADIUS_METERS,
        signal: requestAbortController.signal,
    })
        .then((ways) => {
            endRequestSignpost({
                durationMs: Date.now() - requestStartedAt,
                wayCount: Array.isArray(ways) ? ways.length : 0,
            });

            if (requestGeneration !== graphRequestGeneration) {
                return null;
            }

            const graphBuildStartedAt = Date.now();
            const graphBuildSignpostIdentifier = beginMapPerformanceSignpost(
                'road.graph.build',
                {
                    wayCount: Array.isArray(ways) ? ways.length : 0,
                },
            );
            let nextRoadGraph;

            try {
                nextRoadGraph = createDirectedRoadGraph(ways);
            } finally {
                endMapPerformanceSignpost(
                    'road.graph.build',
                    graphBuildSignpostIdentifier,
                    {
                        durationMs: Date.now() - graphBuildStartedAt,
                        edgeCount: nextRoadGraph?.edges?.length ?? 0,
                    },
                );
            }

            const graphBuildDurationMs = Date.now() - graphBuildStartedAt;

            if (!nextRoadGraph.edges.length) {
                throw new Error('No drivable roads were returned.');
            }

            graphCenter = coordinate;
            lastGraphRequestFailure = null;
            roadGraph = nextRoadGraph;
            const replayObservations = getRoadMatchingReplayObservations(
                rawLocationHistory.slice(0, -1),
            );
            const historyReplayStartedAt = Date.now();
            const historyReplaySignpostIdentifier = beginMapPerformanceSignpost(
                'road.matcher.history_replay',
                {
                    edgeCount: nextRoadGraph.edges.length,
                    observationCount: replayObservations.length,
                },
            );

            try {
                matcher = createRoadMatcherWithHistory(
                    nextRoadGraph,
                    replayObservations,
                );
            } finally {
                endMapPerformanceSignpost(
                    'road.matcher.history_replay',
                    historyReplaySignpostIdentifier,
                    {
                        durationMs: Date.now() - historyReplayStartedAt,
                    },
                );
            }

            const historyReplayDurationMs = Date.now() - historyReplayStartedAt;

            recordAndroidAutoPerformanceTrace('road_graph.history_replayed', {
                durationMs: historyReplayDurationMs,
                edgeCount: nextRoadGraph.edges.length,
            });
            roadGraphLoadCount += 1;
            recordAndroidAutoPerformanceTrace('road_graph.loaded', {
                edgeCount: nextRoadGraph.edges.length,
                graphBuildDurationMs,
                requestDurationMs: Date.now() - requestStartedAt,
                wayCount: Array.isArray(ways) ? ways.length : 0,
            });

            return nextRoadGraph;
        })
        .catch((error) => {
            endRequestSignpost({
                durationMs: Date.now() - requestStartedAt,
                errorName: error?.name ?? 'Error',
            });
            recordAndroidAutoPerformanceTrace('road_graph.failed', {
                errorName: error?.name ?? 'Error',
                requestDurationMs: Date.now() - requestStartedAt,
                timedOut: requestTimedOut,
            });

            if (error?.name !== 'AbortError' || requestTimedOut) {
                lastGraphRequestFailure = {
                    failedAt: Date.now(),
                    source: requestContext.originSource,
                };

                if (!requestContext.startedWithRoadGraph) {
                    setSessionState('road-graph-error');
                }
            }

            return null;
        })
        .finally(() => {
            clearTimeout(requestTimeoutId);
            requestAbortController.signal.removeEventListener(
                'abort',
                handleRequestAbort,
            );

            if (graphRequestAbortController === requestAbortController) {
                graphRequestAbortController = null;
                graphRequest = null;
            }
        });

    return graphRequest;
}

function getLocationWatchOptions() {
    return {
        accuracy: Location.Accuracy.BestForNavigation,
        activityType: Location.ActivityType.AutomotiveNavigation,
        distanceInterval: 3,
        mayShowUserSettingsDialog: true,
        timeInterval: 1000,
    };
}

function getBackgroundLocationTaskOptions() {
    return {
        ...getLocationWatchOptions(),
        deferredUpdatesDistance: 0,
        deferredUpdatesInterval: 0,
        ...(Platform.OS === 'android'
            ? {
                  foregroundService: {
                      killServiceOnDestroy: false,
                      notificationBody:
                          'Matching your live position to nearby roads while driving.',
                      notificationColor: '#2563EB',
                      notificationTitle: 'Drivers Against Flock navigation',
                  },
              }
            : {}),
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
    };
}

function permissionIsGranted(permission) {
    return permission?.granted === true || permission?.status === 'granted';
}

async function ensurePersistentLocationPermission() {
    const foregroundPermission =
        await Location.getForegroundPermissionsAsync().catch(() => null);

    if (!permissionIsGranted(foregroundPermission)) {
        return false;
    }

    // Android's user-initiated foreground location service can continue after
    // the app backgrounds. Requiring "Allow all the time" here would prevent
    // that service from starting for otherwise valid foreground-only users.
    if (Platform.OS !== 'ios') {
        return true;
    }

    const existingPermission =
        await Location.getBackgroundPermissionsAsync().catch(() => null);

    if (permissionIsGranted(existingPermission)) {
        return true;
    }

    if (
        AppState.currentState !== 'active' ||
        backgroundPermissionRequestAttempted ||
        backgroundPermissionRequestIsActive
    ) {
        return false;
    }

    backgroundPermissionRequestAttempted = true;
    backgroundPermissionRequestIsActive = true;

    try {
        const permission = await Location.requestBackgroundPermissionsAsync();

        return permissionIsGranted(permission);
    } catch {
        return false;
    } finally {
        backgroundPermissionRequestIsActive = false;
    }
}

function clearLocationSourceRetry() {
    if (locationSourceRetryTimeout) {
        clearTimeout(locationSourceRetryTimeout);
        locationSourceRetryTimeout = null;
    }
}

function clearIdleLocationSourceCleanup() {
    if (idleLocationSourceCleanupTimeout) {
        clearTimeout(idleLocationSourceCleanupTimeout);
        idleLocationSourceCleanupTimeout = null;
    }
}

function scheduleIdleLocationSourceCleanup() {
    if (idleLocationSourceCleanupTimeout) {
        return;
    }

    idleLocationSourceCleanupTimeout = setTimeout(() => {
        idleLocationSourceCleanupTimeout = null;

        if (
            activeRetainerCount === 0 &&
            getOperationalAppState() === 'active'
        ) {
            locationSourceGeneration += 1;
            void queueLocationSourceReconciliation();
        }
    }, 1000);
}

function queueLocationSourceReconciliation() {
    const expectedGeneration = locationSourceGeneration;

    locationSourceReconciliation = locationSourceReconciliation
        .catch(() => {})
        .then(() => reconcileLocationSource(expectedGeneration));

    return locationSourceReconciliation;
}

function scheduleLocationSourceRetry() {
    if (locationSourceRetryTimeout || activeRetainerCount === 0) {
        return;
    }

    locationSourceRetryTimeout = setTimeout(() => {
        locationSourceRetryTimeout = null;

        if (activeRetainerCount > 0) {
            locationSourceGeneration += 1;
            void queueLocationSourceReconciliation();
        }
    }, ROAD_MATCHING_LOCATION_RETRY_DELAY_MS);
}

async function stopForegroundLocationSubscription() {
    if (foregroundLocationRemovalPromise) {
        await foregroundLocationRemovalPromise;
    }

    const subscription = activeLocationSubscription;
    activeLocationSubscription = null;
    activeLocationSubscriptionGeneration = null;

    if (!subscription) {
        return;
    }

    const removalPromise = (async () => {
        try {
            await subscription.remove();
        } catch {
            // Location teardown can race with host destruction.
        }
    })();
    foregroundLocationRemovalPromise = removalPromise;

    try {
        await removalPromise;
    } finally {
        if (foregroundLocationRemovalPromise === removalPromise) {
            foregroundLocationRemovalPromise = null;
        }
    }
}

async function stopBackgroundLocationTask({ force = false } = {}) {
    if (activePersistentRetainerCount > 0 && !force) {
        return;
    }

    const taskIsStarted = await Location.hasStartedLocationUpdatesAsync(
        ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
    ).catch(() => false);

    if (taskIsStarted && (activePersistentRetainerCount === 0 || force)) {
        await Location.stopLocationUpdatesAsync(
            ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
        ).catch(() => {});
    }
}

async function startBackgroundLocationTask(expectedGeneration) {
    const permissionIsAvailable = await ensurePersistentLocationPermission();

    if (!permissionIsAvailable || activePersistentRetainerCount === 0) {
        return false;
    }

    try {
        const taskIsStarted = await Location.hasStartedLocationUpdatesAsync(
            ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
        );

        if (!taskIsStarted) {
            await Location.startLocationUpdatesAsync(
                ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
                getBackgroundLocationTaskOptions(),
            );
        }

        if (activePersistentRetainerCount === 0) {
            await Location.stopLocationUpdatesAsync(
                ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
            ).catch(() => {});
            return false;
        }

        // The foreground/background handoff must not tear down an Android
        // foreground service that finished starting for another persistent
        // owner generation. The current reconciliation will adopt it through
        // hasStartedLocationUpdatesAsync instead of trying to restart it after
        // the app has already backgrounded.
        if (expectedGeneration !== locationSourceGeneration) {
            return true;
        }

        setSessionStateToObservingIfAwaitingLocation();

        return true;
    } catch (error) {
        // Android refuses to start a location foreground service while the
        // app is backgrounded (ForegroundServiceStartNotAllowedException);
        // the scheduled retry keeps trying until the start is allowed again.
        console.warn(
            'Road matching background location task failed to start.',
            error,
        );
        setSessionState('location-error');
        scheduleLocationSourceRetry();
        return false;
    }
}

async function startForegroundLocationSubscription(expectedGeneration) {
    if (
        activeLocationSubscription &&
        activeLocationSubscriptionGeneration === expectedGeneration
    ) {
        setActiveLocationSource(FOREGROUND_LOCATION_SOURCE);
        setSessionStateToObservingIfAwaitingLocation();
        return activeLocationSubscription;
    }

    await stopForegroundLocationSubscription();

    if (locationSubscriptionPromise) {
        const pendingGeneration = locationSubscriptionPromiseGeneration;
        const pendingSubscription = await locationSubscriptionPromise;

        if (pendingGeneration === expectedGeneration) {
            return pendingSubscription;
        }

        if (expectedGeneration !== locationSourceGeneration) {
            return null;
        }

        return startForegroundLocationSubscription(expectedGeneration);
    }

    setSessionStateToObservingIfAwaitingLocation();
    locationSubscriptionPromiseGeneration = expectedGeneration;
    locationSubscriptionPromise = Location.watchPositionAsync(
        getLocationWatchOptions(),
        (location) => {
            if (getOperationalAppState() !== 'active') {
                return;
            }

            void publishRawLocationAsync(
                location,
                FOREGROUND_LOCATION_SOURCE,
                expectedGeneration,
            );
        },
    )
        .then(async (subscription) => {
            if (
                activeRetainerCount > 0 &&
                getOperationalAppState() === 'active' &&
                expectedGeneration === locationSourceGeneration
            ) {
                activeLocationSubscription = subscription;
                activeLocationSubscriptionGeneration = expectedGeneration;
                setActiveLocationSource(FOREGROUND_LOCATION_SOURCE);
            } else {
                try {
                    await subscription.remove();
                } catch {
                    // Location teardown can race with host destruction.
                }
            }

            return subscription;
        })
        .catch(() => {
            setSessionState('location-error');
            scheduleLocationSourceRetry();
            return null;
        })
        .finally(() => {
            if (locationSubscriptionPromiseGeneration === expectedGeneration) {
                locationSubscriptionPromise = null;
                locationSubscriptionPromiseGeneration = null;
            }
        });

    return locationSubscriptionPromise;
}

async function reconcileLocationSource(expectedGeneration) {
    if (expectedGeneration !== locationSourceGeneration) {
        return;
    }

    clearLocationSourceRetry();

    const locationSourcePolicy = getRoadMatchingLocationSourcePolicy({
        activeRetainerCount,
        appState: getOperationalAppState(),
        automotiveLocationOwnerIsActive: automotiveLocationOwnerIsActive(),
        persistentRetainerCount: activePersistentRetainerCount,
        platformOS: Platform.OS,
    });

    if (activeRetainerCount === 0) {
        await stopForegroundLocationSubscription();
        await stopBackgroundLocationTask();

        if (expectedGeneration === locationSourceGeneration) {
            setActiveLocationSource('none');
            setSessionState('idle');
        }

        return;
    }

    if (!locationSourcePolicy.foregroundWatchIsNeeded) {
        await stopForegroundLocationSubscription();

        if (!locationSourcePolicy.backgroundTaskIsNeeded) {
            await stopBackgroundLocationTask({ force: true });

            if (expectedGeneration === locationSourceGeneration) {
                setActiveLocationSource('none');
            }

            return;
        }

        const backgroundTaskStarted =
            await startBackgroundLocationTask(expectedGeneration);

        if (expectedGeneration === locationSourceGeneration) {
            setActiveLocationSource(
                backgroundTaskStarted ? BACKGROUND_LOCATION_SOURCE : 'none',
            );
        }

        return;
    }

    const backgroundTaskPromise = locationSourcePolicy.backgroundTaskIsNeeded
        ? startBackgroundLocationTask(expectedGeneration)
        : stopBackgroundLocationTask({ force: true }).then(() => false);

    await startForegroundLocationSubscription(expectedGeneration);
    const backgroundTaskStarted = await backgroundTaskPromise;

    if (expectedGeneration !== locationSourceGeneration) {
        return;
    }

    if (foregroundLocationSourceIsActive()) {
        setActiveLocationSource(FOREGROUND_LOCATION_SOURCE);
        return;
    }

    setActiveLocationSource(
        backgroundTaskStarted ? BACKGROUND_LOCATION_SOURCE : 'none',
    );
}

function abortPendingRoadGraphWork() {
    graphRequestGeneration += 1;
    graphRequestAbortController?.abort();
    graphRequestAbortController = null;
    graphRequest = null;
}

export function roadMatchingLocationIsSupported() {
    return typeof Location.watchPositionAsync === 'function';
}

export async function retainRoadMatchingSessionAsync({
    persistent = false,
} = {}) {
    let isReleased = false;

    clearIdleLocationSourceCleanup();
    activeRetainerCount += 1;

    if (persistent) {
        activePersistentRetainerCount += 1;
    }

    emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());
    locationSourceGeneration += 1;
    void queueLocationSourceReconciliation();

    return {
        remove() {
            if (isReleased) {
                return;
            }

            isReleased = true;
            activeRetainerCount = Math.max(0, activeRetainerCount - 1);

            if (persistent) {
                activePersistentRetainerCount = Math.max(
                    0,
                    activePersistentRetainerCount - 1,
                );
            }

            if (activeRetainerCount === 0) {
                backgroundPermissionRequestAttempted = false;
                lastBackgroundDelivery = null;
                lastBackgroundDeliveryAppState = null;
                abortPendingRoadGraphWork();
            }

            locationSourceGeneration += 1;
            void queueLocationSourceReconciliation();
            emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());
        },
    };
}

export function addRoadMatchedLocationListener(listener) {
    locationListeners.add(listener);

    return {
        remove() {
            locationListeners.delete(listener);
        },
    };
}

export function addRoadLookAheadListener(listener) {
    lookAheadListeners.add(listener);

    return {
        remove() {
            lookAheadListeners.delete(listener);
        },
    };
}

export function addRoadMatchingSessionStateListener(listener) {
    sessionStateListeners.add(listener);

    return {
        remove() {
            sessionStateListeners.delete(listener);
        },
    };
}

export async function getLastRoadMatchedLocationAsync() {
    return lastRoadMatchedLocation;
}

export async function getLastRoadLookAheadAsync() {
    return lastRoadLookAhead;
}

export function getRoadMatchingSessionDiagnostics() {
    return {
        activeRetainerCount,
        lastBackgroundDelivery,
        lastBackgroundDeliveryAppState,
        lastRawCoordinate: getRawLocationCoordinate(lastRawLocation),
        lastUpdateAppState: lastRawLocationAppState,
        lastUpdateSource: lastRawLocationSource,
        persistentRetainerCount: activePersistentRetainerCount,
        roadEdgeCount: roadGraph?.edges.length ?? 0,
        roadGraphLoadCount,
        source: activeLocationSource,
        state: sessionState,
    };
}
