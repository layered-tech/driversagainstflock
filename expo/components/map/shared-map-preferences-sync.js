import {
    getAllDebugOverlayVisibility,
    getDebugOverlayVisibilityKey,
} from './debug-overlays';

const DEFAULT_SHARED_MAP_PREFERENCES_STATE = {
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

function getLocationKey(location) {
    if (!location) {
        return '';
    }

    return [
        location.latitude,
        location.longitude,
        location.accuracy,
        location.recordedAt,
    ]
        .map((value) => (Number.isFinite(Number(value)) ? Number(value) : ''))
        .join(',');
}

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
        getLocationKey(firstState?.userLocation) ===
            getLocationKey(secondState?.userLocation)
    );
}

export function getSharedMapPreferencesState() {
    return sharedMapPreferencesState;
}

export function setSharedMapPreferencesState(nextState) {
    const normalizedState = {
        ...sharedMapPreferencesState,
        ...nextState,
    };

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
