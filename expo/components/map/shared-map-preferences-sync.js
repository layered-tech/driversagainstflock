import {
    getAdvancedRouteSettingsKey,
    normalizeAdvancedRouteSettings,
} from './advanced-route-settings';
import {
    getAllDebugOverlayVisibility,
    getDebugOverlayVisibilityKey,
} from './debug-overlays';
import { locationUpdateIsStale } from './location-watch-options';
import { getSharedMapLocationKey } from './shared-map-location-key';

const DEFAULT_SHARED_MAP_PREFERENCES_STATE = {
    advancedRouteSettings: normalizeAdvancedRouteSettings(),
    debugOverlayIsVisible: false,
    debugOverlayVisibility: getAllDebugOverlayVisibility(false),
    initialCameraSettings: null,
    mapDebugControlOffset: { x: 0, y: 0 },
    mapLightPresetPreference: null,
    mapPreferencesAreLoaded: false,
    mapStyleIsUserSelected: false,
    mapStyleURL: null,
    mapTrafficEnabled: false,
    surveillanceMarkersVisible: true,
    markerClustersEnabled: true,
    cameraConesVisible: true,
    preferPrivateRoutes: false,
    policeAlertsVisible: false,
    userLocation: null,
};

let sharedMapPreferencesState = DEFAULT_SHARED_MAP_PREFERENCES_STATE;
const sharedMapPreferencesListeners = new Set();

function getCameraSettingsKey(settings) {
    if (!settings) {
        return '';
    }

    return [
        ...(Array.isArray(settings.centerCoordinate)
            ? settings.centerCoordinate
            : []),
        settings.zoomLevel,
    ]
        .map((value) => (Number.isFinite(Number(value)) ? Number(value) : ''))
        .join(',');
}

function getOffsetKey(offset) {
    return [offset?.x, offset?.y]
        .map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0))
        .join(',');
}

function mapPreferencesStatesAreEqual(firstState, secondState) {
    return (
        getAdvancedRouteSettingsKey(firstState?.advancedRouteSettings) ===
            getAdvancedRouteSettingsKey(secondState?.advancedRouteSettings) &&
        Boolean(firstState?.debugOverlayIsVisible) ===
            Boolean(secondState?.debugOverlayIsVisible) &&
        getDebugOverlayVisibilityKey(firstState?.debugOverlayVisibility) ===
            getDebugOverlayVisibilityKey(secondState?.debugOverlayVisibility) &&
        Boolean(firstState?.mapPreferencesAreLoaded) ===
            Boolean(secondState?.mapPreferencesAreLoaded) &&
        Boolean(firstState?.mapStyleIsUserSelected) ===
            Boolean(secondState?.mapStyleIsUserSelected) &&
        Boolean(firstState?.mapTrafficEnabled) ===
            Boolean(secondState?.mapTrafficEnabled) &&
        Boolean(firstState?.surveillanceMarkersVisible !== false) ===
            Boolean(secondState?.surveillanceMarkersVisible !== false) &&
        Boolean(firstState?.markerClustersEnabled !== false) ===
            Boolean(secondState?.markerClustersEnabled !== false) &&
        Boolean(firstState?.cameraConesVisible !== false) ===
            Boolean(secondState?.cameraConesVisible !== false) &&
        Boolean(firstState?.preferPrivateRoutes === true) ===
            Boolean(secondState?.preferPrivateRoutes === true) &&
        Boolean(firstState?.policeAlertsVisible === true) ===
            Boolean(secondState?.policeAlertsVisible === true) &&
        firstState?.mapLightPresetPreference ===
            secondState?.mapLightPresetPreference &&
        firstState?.mapStyleURL === secondState?.mapStyleURL &&
        getCameraSettingsKey(firstState?.initialCameraSettings) ===
            getCameraSettingsKey(secondState?.initialCameraSettings) &&
        getOffsetKey(firstState?.mapDebugControlOffset) ===
            getOffsetKey(secondState?.mapDebugControlOffset) &&
        getSharedMapLocationKey(firstState?.userLocation) ===
            getSharedMapLocationKey(secondState?.userLocation)
    );
}

export function getSharedMapPreferencesState() {
    return sharedMapPreferencesState;
}

export function getSharedMapUserLocation() {
    return sharedMapPreferencesState.userLocation;
}

export function setSharedMapUserLocation(locationOrUpdater) {
    const userLocation =
        typeof locationOrUpdater === 'function'
            ? locationOrUpdater(getSharedMapUserLocation())
            : locationOrUpdater;

    setSharedMapPreferencesState({ userLocation });
}

export function setSharedMapPreferencesState(nextState) {
    const normalizedState = {
        ...sharedMapPreferencesState,
        ...nextState,
    };

    if (
        locationUpdateIsStale({
            currentLocation: sharedMapPreferencesState.userLocation,
            nextLocation: normalizedState.userLocation,
        })
    ) {
        normalizedState.userLocation = sharedMapPreferencesState.userLocation;
    }

    if (
        mapPreferencesStatesAreEqual(sharedMapPreferencesState, normalizedState)
    ) {
        return;
    }

    sharedMapPreferencesState = normalizedState;
    sharedMapPreferencesListeners.forEach((listener) =>
        listener(sharedMapPreferencesState),
    );
}

export function addSharedMapPreferencesStateListener(listener) {
    sharedMapPreferencesListeners.add(listener);

    return () => {
        sharedMapPreferencesListeners.delete(listener);
    };
}
