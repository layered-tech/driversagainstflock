import {
    addAutoPlaySessionStateListener,
    getAutoPlaySessionState,
} from '../auto-play-session-state';
import {
    addAcceptedDeviceLocationListener,
    getLatestAcceptedDeviceLocation,
} from '../map/accepted-device-location';
import { APP_ENVIRONMENT } from '../map/config';
import {
    getDirectionsRouteProgress,
    getDirectionsWaypointCoordinate,
    getSelectedDirectionsRouteOption,
} from '../map/directions';
import { getDrivingMotionState } from '../map/driving-motion-state';
import {
    addElectronicHorizonAlprNodesListener,
    getSharedElectronicHorizonAlprNodes,
    hydrateElectronicHorizonAlprNodes,
} from '../map/electronic-horizon-alpr-store';
import { getLocationCourseHeading, getLocationUpdate } from '../map/geo';
import { scorecardDriveE2ECameraInventoryIsReady } from '../map/scorecard-drive-e2e-fixture';
import {
    addSharedRoutingStateListener,
    getDirectionsRouteGeometrySyncKey,
    getSharedRoutingState,
    hydrateSharedRoutingStateAsync,
    setSharedRoutingState,
} from '../map/shared-routing-state';
import { getLocalStartingStateCode } from './local-state-resolver';
import { createScorecardRuntime } from './scorecard-runtime';
import {
    deleteEncryptedScorecardState,
    loadEncryptedScorecardState,
    saveEncryptedScorecardState,
    scorecardSecureStorageIsAvailable,
} from './scorecard-storage';

let runtime;

async function loadRuntimeState() {
    const loadedStatePromise = loadEncryptedScorecardState();

    await Promise.all([
        hydrateSharedRoutingStateAsync().catch(() => getSharedRoutingState()),
        hydrateElectronicHorizonAlprNodes().catch(() => []),
    ]);
    runtime.setRoutingState(getSharedRoutingState());
    runtime.setSupplementalNodes(getSharedElectronicHorizonAlprNodes());

    return loadedStatePromise;
}

function scorecardSegmentIndicatesDriving(previousLocation, currentLocation) {
    const previousLocationUpdate = getLocationUpdate(previousLocation);
    const currentLocationUpdate = getLocationUpdate(currentLocation);

    if (!previousLocationUpdate || !currentLocationUpdate) {
        return false;
    }

    return getDrivingMotionState({
        fallbackCourseHeading: null,
        locationCourseHeading: getLocationCourseHeading(currentLocation),
        nextLocation: currentLocationUpdate,
        previousLocation: previousLocationUpdate,
    }).isMoving;
}

runtime = createScorecardRuntime({
    deleteState: deleteEncryptedScorecardState,
    getRouteGeometryKey: getDirectionsRouteGeometrySyncKey,
    getRouteOption: getSelectedDirectionsRouteOption,
    getRouteProgress: getDirectionsRouteProgress,
    getWaypointCoordinate: getDirectionsWaypointCoordinate,
    loadState: loadRuntimeState,
    normalizeLocationForRoute: getLocationUpdate,
    onGuidedArrival: () => {
        setSharedRoutingState({
            directionsRoute: null,
            drivingModeIsActive: false,
        });
    },
    resolveStartingStateCode: getLocalStartingStateCode,
    saveState: saveEncryptedScorecardState,
    secureStorageIsAvailable: scorecardSecureStorageIsAvailable(),
    segmentIndicatesDriving: scorecardSegmentIndicatesDriving,
});

let runtimeIsInitialized = false;

export function initializeScorecardRuntime() {
    if (runtimeIsInitialized) {
        return runtime.hydrate();
    }

    runtimeIsInitialized = true;
    runtime.setAutoPlaySessionState(getAutoPlaySessionState());
    runtime.setRoutingState(getSharedRoutingState());
    runtime.setSupplementalNodes(getSharedElectronicHorizonAlprNodes());
    addAutoPlaySessionStateListener((sessionState) => {
        runtime.setAutoPlaySessionState(sessionState);
    });
    addSharedRoutingStateListener((routingState) => {
        runtime.setRoutingState(routingState);
    });
    addAcceptedDeviceLocationListener((location) => {
        runtime.handleAcceptedLocation(location);

        return runtime.waitForIdle();
    });
    addElectronicHorizonAlprNodesListener((nodes) => {
        runtime.setSupplementalNodes(nodes);

        if (
            APP_ENVIRONMENT === 'e2e' &&
            scorecardDriveE2ECameraInventoryIsReady(nodes)
        ) {
            console.info('[E2E] scorecard-camera-inventory-ready');
        }
    });

    const acceptedLocation = getLatestAcceptedDeviceLocation();

    if (acceptedLocation) {
        runtime.handleAcceptedLocation(acceptedLocation);
    }

    return runtime.hydrate();
}

export function getScorecardRuntimeSnapshot() {
    return runtime.getSnapshot();
}

export function subscribeScorecardRuntime(listener) {
    return runtime.subscribe(listener);
}

export function updateScorecardRuntimeState(update, options) {
    return runtime.updateState(update, options);
}

export function setScorecardRuntimeTrackingEnabled(enabled) {
    runtime.setTrackingEnabled(enabled);
}

export function replaceScorecardRuntimeState(state) {
    return runtime.replaceState(state);
}

export function deleteScorecardRuntimeHistory() {
    return runtime.deleteHistory();
}
