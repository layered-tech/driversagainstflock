import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { getRoadCorridor } from './api';
import {
    createDirectedRoadGraph,
    getRoadCoordinateDistanceMeters,
} from './road-graph';
import { predictRoadLookAhead } from './road-look-ahead';
import {
    appendRoadMatchingObservation,
    createRoadMatcherWithHistory,
} from './road-matching-history';

const ROAD_CORRIDOR_RADIUS_METERS = 1200;
const ROAD_CORRIDOR_REFRESH_DISTANCE_METERS = 500;
const ROAD_CORRIDOR_RETRY_DELAY_MS = 30000;
const ROAD_LOOK_AHEAD_DISTANCE_METERS = 2000;
const ROAD_MATCHING_LOCATION_RETRY_DELAY_MS = 5000;

export const ROAD_MATCHING_BACKGROUND_LOCATION_TASK =
    'driversagainstflock-road-matching-location';

const BACKGROUND_LOCATION_SOURCE = 'expo-background-location-task';
const FOREGROUND_LOCATION_SOURCE = 'expo-foreground-location-watch';

let activeRetainerCount = 0;
let activePersistentRetainerCount = 0;
let activeLocationSubscription = null;
let activeLocationSubscriptionGeneration = null;
let activeLocationSource = 'none';
let backgroundPermissionRequestAttempted = false;
let backgroundPermissionRequestIsActive = false;
let locationSourceGeneration = 0;
let idleLocationSourceCleanupTimeout = null;
let locationSourceReconciliation = Promise.resolve();
let locationSourceRetryTimeout = null;
let locationSubscriptionPromise = null;
let graphRequest = null;
let graphRequestAbortController = null;
let graphRequestGeneration = 0;
let graphCenter = null;
let lastGraphRequestFailedAt = null;
let lastBackgroundDelivery = null;
let lastBackgroundDeliveryAppState = null;
let lastRawLocation = null;
let lastRawLocationAppState = null;
let lastRawLocationSource = null;
let lastRoadLookAhead = null;
let lastRoadMatchedLocation = null;
let matcher = null;
let roadGraph = null;
let roadGraphLoadCount = 0;
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

            const taskIsStarted = await Location.hasStartedLocationUpdatesAsync(
                ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
            ).catch(() => false);

            if (!taskIsStarted) {
                return;
            }

            const locations = Array.isArray(data?.locations)
                ? data.locations
                : [];

            setActiveLocationSource(BACKGROUND_LOCATION_SOURCE);

            for (const location of locations) {
                await publishRawLocationAsync(
                    location,
                    BACKGROUND_LOCATION_SOURCE,
                );
            }
        },
    );
}

AppState.addEventListener('change', (nextState) => {
    if (nextState !== 'active') {
        clearIdleLocationSourceCleanup();
        return;
    }

    if (activeRetainerCount > 0) {
        locationSourceGeneration += 1;
        void queueLocationSourceReconciliation();
        return;
    }

    scheduleIdleLocationSourceCleanup();
});

if (AppState.currentState === 'active') {
    scheduleIdleLocationSourceCleanup();
}

function emit(listeners, value) {
    listeners.forEach((listener) => listener(value));
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

function updateRoadLookAhead(matchedLocation) {
    const nextRoadLookAhead =
        matchedLocation?.roadMatch?.isOffRoad === false
            ? predictRoadLookAhead({
                  graph: roadGraph,
                  matchedLocation,
                  maximumDistanceMeters: ROAD_LOOK_AHEAD_DISTANCE_METERS,
              })
            : null;

    lastRoadLookAhead = nextRoadLookAhead;
    emit(lookAheadListeners, nextRoadLookAhead);
}

function applyRawLocation(location) {
    lastRawLocation = location;

    const matchedLocation = matcher?.update(location) ?? null;
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
              : 'loading-road-graph',
    );
    emit(locationListeners, nextLocation);
    updateRoadLookAhead(matchedLocation);
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

    lastRawLocationAppState = AppState.currentState ?? 'unknown';
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

    const graphBeforeRequest = roadGraph;

    await ensureRoadGraph(location);

    if (
        graphBeforeRequest !== roadGraph &&
        lastRawLocation &&
        (expectedLocationSourceGeneration === null ||
            expectedLocationSourceGeneration === locationSourceGeneration)
    ) {
        applyRawLocation(lastRawLocation);
    }

    if (updateWasDeliveredInBackground) {
        const rawCoordinate = getRawLocationCoordinate(location);
        const matchedCoordinate = getRawLocationCoordinate(
            lastRoadMatchedLocation,
        );

        lastBackgroundDeliveryAppState = lastRawLocationAppState;
        lastBackgroundDelivery = {
            appState: lastRawLocationAppState,
            matchedCoordinate,
            matchedEdgeId: lastRoadMatchedLocation?.roadMatch?.edgeId ?? null,
            rawCoordinate,
            speedLimitMph:
                lastRoadMatchedLocation?.roadMatch?.speedLimit?.speedLimitMph ??
                null,
        };
        emit(sessionStateListeners, getRoadMatchingSessionDiagnostics());
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

async function ensureRoadGraph(location) {
    if (!roadGraphNeedsRefresh(location) || graphRequest) {
        return graphRequest;
    }

    if (
        lastGraphRequestFailedAt !== null &&
        Date.now() - lastGraphRequestFailedAt < ROAD_CORRIDOR_RETRY_DELAY_MS
    ) {
        return null;
    }

    const coordinate = getRawLocationCoordinate(location);

    if (!coordinate) {
        return null;
    }

    graphRequestAbortController?.abort();
    const requestAbortController = new AbortController();
    const requestGeneration = graphRequestGeneration;

    graphRequestAbortController = requestAbortController;
    setSessionState('loading-road-graph');

    graphRequest = getRoadCorridor({
        location: {
            latitude: coordinate[1],
            longitude: coordinate[0],
        },
        radiusMeters: ROAD_CORRIDOR_RADIUS_METERS,
        signal: requestAbortController.signal,
    })
        .then((ways) => {
            if (requestGeneration !== graphRequestGeneration) {
                return null;
            }

            const nextRoadGraph = createDirectedRoadGraph(ways);

            if (!nextRoadGraph.edges.length) {
                throw new Error('No drivable roads were returned.');
            }

            graphCenter = coordinate;
            lastGraphRequestFailedAt = null;
            roadGraph = nextRoadGraph;
            matcher = createRoadMatcherWithHistory(
                nextRoadGraph,
                rawLocationHistory.slice(0, -1),
            );
            roadGraphLoadCount += 1;

            return nextRoadGraph;
        })
        .catch((error) => {
            if (error?.name !== 'AbortError') {
                lastGraphRequestFailedAt = Date.now();
                setSessionState('road-graph-error');
            }

            return null;
        })
        .finally(() => {
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
        foregroundService: {
            killServiceOnDestroy: false,
            notificationBody:
                'Matching your live position to nearby roads while driving.',
            notificationColor: '#2563EB',
            notificationTitle: 'Drivers Against Flock navigation',
        },
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

    // Expo's Android location foreground service is allowed to continue after
    // the app backgrounds when it is user-initiated while the app is active.
    // Only iOS requires the separate always/background grant for this path.
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

        if (activeRetainerCount === 0 && AppState.currentState === 'active') {
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

function stopForegroundLocationSubscription() {
    activeLocationSubscription?.remove();
    activeLocationSubscription = null;
    activeLocationSubscriptionGeneration = null;
}

async function stopBackgroundLocationTask() {
    const taskIsStarted = await Location.hasStartedLocationUpdatesAsync(
        ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
    ).catch(() => false);

    if (taskIsStarted) {
        await Location.stopLocationUpdatesAsync(
            ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
        ).catch(() => {});
    }
}

async function startBackgroundLocationTask(expectedGeneration) {
    const permissionIsAvailable = await ensurePersistentLocationPermission();

    if (
        !permissionIsAvailable ||
        expectedGeneration !== locationSourceGeneration ||
        activePersistentRetainerCount === 0
    ) {
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

        if (
            expectedGeneration !== locationSourceGeneration ||
            activePersistentRetainerCount === 0
        ) {
            await Location.stopLocationUpdatesAsync(
                ROAD_MATCHING_BACKGROUND_LOCATION_TASK,
            ).catch(() => {});
            return false;
        }

        setActiveLocationSource(BACKGROUND_LOCATION_SOURCE);
        setSessionStateToObservingIfAwaitingLocation();

        return true;
    } catch {
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

    stopForegroundLocationSubscription();

    if (locationSubscriptionPromise) {
        return locationSubscriptionPromise;
    }

    setSessionStateToObservingIfAwaitingLocation();
    locationSubscriptionPromise = Location.watchPositionAsync(
        getLocationWatchOptions(),
        (location) => {
            void publishRawLocationAsync(
                location,
                FOREGROUND_LOCATION_SOURCE,
                expectedGeneration,
            );
        },
    )
        .then((subscription) => {
            if (
                activeRetainerCount > 0 &&
                activePersistentRetainerCount === 0 &&
                expectedGeneration === locationSourceGeneration
            ) {
                activeLocationSubscription = subscription;
                activeLocationSubscriptionGeneration = expectedGeneration;
                setActiveLocationSource(FOREGROUND_LOCATION_SOURCE);
            } else {
                subscription.remove();
            }

            return subscription;
        })
        .catch(() => {
            setSessionState('location-error');
            scheduleLocationSourceRetry();
            return null;
        })
        .finally(() => {
            locationSubscriptionPromise = null;
        });

    return locationSubscriptionPromise;
}

async function reconcileLocationSource(expectedGeneration) {
    if (expectedGeneration !== locationSourceGeneration) {
        return;
    }

    clearLocationSourceRetry();

    if (activeRetainerCount === 0) {
        stopForegroundLocationSubscription();
        await stopBackgroundLocationTask();

        if (expectedGeneration === locationSourceGeneration) {
            setActiveLocationSource('none');
            setSessionState('idle');
        }

        return;
    }

    if (activePersistentRetainerCount > 0) {
        stopForegroundLocationSubscription();

        const backgroundTaskStarted =
            await startBackgroundLocationTask(expectedGeneration);

        if (
            !backgroundTaskStarted &&
            expectedGeneration === locationSourceGeneration
        ) {
            await startForegroundLocationSubscription(expectedGeneration);
        }

        return;
    }

    await stopBackgroundLocationTask();

    if (expectedGeneration === locationSourceGeneration) {
        await startForegroundLocationSubscription(expectedGeneration);
    }
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
