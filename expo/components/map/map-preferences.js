import {
    getLocationCoordinate,
    LOCATION_ZOOM_LEVEL,
} from '../map-location-mode-shared';
import {
    MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    MAPBOX_STANDARD_LIGHT_PRESET_DAWN,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_DUSK,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
    MAPBOX_STANDARD_SATELLITE_STYLE_URL,
    MAPBOX_STANDARD_STYLE_URL,
} from './config';
import {
    DEFAULT_CENTER_COORDINATE,
    DEFAULT_ZOOM_LEVEL,
    MAP_LAYER_STYLES,
} from './constants';
import {
    getDebugOverlayIsVisible,
    getDebugOverlayVisibilityWithDefaults,
} from './debug-overlays';
import { getStoredNumber, normalizeLongitude } from './geo';

const SUPPORTED_MAP_STYLE_URLS = new Set([
    MAPBOX_STANDARD_STYLE_URL,
    MAPBOX_STANDARD_SATELLITE_STYLE_URL,
]);
const SUPPORTED_MAP_LIGHT_PRESET_PREFERENCES = new Set([
    MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    MAPBOX_STANDARD_LIGHT_PRESET_DAWN,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_DUSK,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
]);

export function getMapLayerByStyleURL(styleURL) {
    return MAP_LAYER_STYLES.find(
        ({ styleURL: mapLayerStyleURL }) => mapLayerStyleURL === styleURL,
    );
}

export function getDefaultMapStyleURL() {
    return MAPBOX_STANDARD_STYLE_URL;
}

export function getDefaultMapLightPresetPreference() {
    return MAPBOX_STANDARD_LIGHT_PRESET_AUTO;
}

function getStoredMapLayerStyleURL(mapLayerKey) {
    const storedMapLayer = MAP_LAYER_STYLES.find(
        ({ key }) => key === mapLayerKey,
    );

    return storedMapLayer?.styleURL ?? null;
}

function normalizeStoredMapStyleURL(styleURL) {
    if (SUPPORTED_MAP_STYLE_URLS.has(styleURL)) {
        return styleURL;
    }

    return null;
}

function normalizeStoredMapLightPresetPreference(lightPresetPreference) {
    if (typeof lightPresetPreference !== 'string') {
        return null;
    }

    const normalizedLightPresetPreference = lightPresetPreference
        .trim()
        .toLowerCase();

    if (
        SUPPORTED_MAP_LIGHT_PRESET_PREFERENCES.has(
            normalizedLightPresetPreference,
        )
    ) {
        return normalizedLightPresetPreference;
    }

    return null;
}

export function getStoredMapStyleURL(preferences) {
    const storedMapLayerStyleURL = getStoredMapLayerStyleURL(
        preferences?.mapLayerKey,
    );

    if (storedMapLayerStyleURL) {
        return storedMapLayerStyleURL;
    }

    const storedStyleURL = preferences?.mapStyleURL;

    if (typeof storedStyleURL !== 'string') {
        return null;
    }

    const trimmedStyleURL = storedStyleURL.trim();

    if (!trimmedStyleURL.includes('://')) {
        return null;
    }

    return normalizeStoredMapStyleURL(trimmedStyleURL);
}

export function getStoredMapStylePreference(preferences) {
    const storedMapStyleURL = getStoredMapStyleURL(preferences);

    if (!storedMapStyleURL) {
        return null;
    }

    if (preferences?.mapStyleIsUserSelected === false) {
        return { isUserSelected: false, styleURL: storedMapStyleURL };
    }

    const storedMapLayer = getMapLayerByStyleURL(storedMapStyleURL);
    const isSatelliteLayer = storedMapLayer?.key === 'standard-satellite';

    return {
        isUserSelected:
            preferences?.mapStyleIsUserSelected !== false && isSatelliteLayer,
        styleURL: storedMapStyleURL,
    };
}

export function getStoredMapTrafficEnabled(preferences) {
    return preferences?.mapTrafficEnabled === true;
}

export function getStoredSurveillanceMarkersVisible(preferences) {
    return preferences?.surveillanceMarkersVisible !== false;
}

export function getStoredMarkerClustersEnabled(preferences) {
    return preferences?.markerClustersEnabled !== false;
}

export function getStoredCameraConesVisible(preferences) {
    return preferences?.cameraConesVisible !== false;
}

export function getStoredPreferPrivateRoutes(preferences) {
    return preferences?.preferPrivateRoutes === true;
}

export function getStoredPoliceAlertsVisible(preferences) {
    return preferences?.policeAlertsVisible === true;
}

export function getStoredMapLightPresetPreference(preferences) {
    return normalizeStoredMapLightPresetPreference(
        preferences?.mapLightPresetPreference ?? preferences?.mapLightPreset,
    );
}

export function getStoredDebugOverlayIsVisible(preferences) {
    return getDebugOverlayIsVisible(
        getStoredDebugOverlayVisibility(preferences),
    );
}

export function getStoredDebugOverlayVisibility(preferences) {
    return getDebugOverlayVisibilityWithDefaults(
        preferences?.debugOverlayVisibility,
        preferences?.debugOverlayIsVisible === true,
    );
}

export function getStoredMapDebugControlOffset(value) {
    const x = getStoredNumber(value?.x);
    const y = getStoredNumber(value?.y);

    if (x === null || y === null) {
        return null;
    }

    return { x, y };
}

export function getStoredUserLocation(value) {
    const latitude = getStoredNumber(value?.latitude);
    const longitude = getStoredNumber(value?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    const location = {
        latitude,
        longitude: normalizeLongitude(longitude),
    };
    const accuracy = getStoredNumber(value?.accuracy);
    const recordedAt = getStoredNumber(value?.recordedAt);

    if (accuracy !== null) {
        location.accuracy = accuracy;
    }

    if (recordedAt !== null) {
        location.recordedAt = recordedAt;
    }

    return location;
}

export function getInitialCameraSettings(location) {
    if (!location) {
        return {
            centerCoordinate: DEFAULT_CENTER_COORDINATE,
            zoomLevel: DEFAULT_ZOOM_LEVEL,
        };
    }

    return {
        centerCoordinate: getLocationCoordinate(location),
        zoomLevel: LOCATION_ZOOM_LEVEL,
    };
}

export function getPersistableMapPreferences(
    mapStyleURL,
    mapStyleIsUserSelected,
    mapTrafficEnabled,
    mapLightPresetPreference,
    location,
    debugOverlayVisibility,
    mapDebugControlOffset,
    surveillanceMarkersVisible,
    markerClustersEnabled,
    cameraConesVisible,
    preferPrivateRoutes,
    policeAlertsVisible,
) {
    const mapLayer = getMapLayerByStyleURL(mapStyleURL);
    const persistableMapStyleURL =
        mapLayer?.styleURL ?? MAPBOX_STANDARD_STYLE_URL;
    const persistableMapLightPresetPreference =
        normalizeStoredMapLightPresetPreference(mapLightPresetPreference) ??
        MAPBOX_STANDARD_LIGHT_PRESET_AUTO;
    const persistableDebugOverlayVisibility =
        getDebugOverlayVisibilityWithDefaults(debugOverlayVisibility);

    return {
        mapLayerKey: mapLayer?.key ?? 'standard',
        mapStyleURL: persistableMapStyleURL,
        mapStyleIsUserSelected:
            mapLayer?.key === 'standard-satellite' && mapStyleIsUserSelected,
        mapTrafficEnabled,
        surveillanceMarkersVisible: surveillanceMarkersVisible !== false,
        markerClustersEnabled: markerClustersEnabled !== false,
        cameraConesVisible: cameraConesVisible !== false,
        preferPrivateRoutes: preferPrivateRoutes === true,
        policeAlertsVisible: policeAlertsVisible === true,
        mapLightPresetPreference: persistableMapLightPresetPreference,
        debugOverlayIsVisible: getDebugOverlayIsVisible(
            persistableDebugOverlayVisibility,
        ),
        debugOverlayVisibility: persistableDebugOverlayVisibility,
        mapDebugControlOffset: getStoredMapDebugControlOffset(
            mapDebugControlOffset,
        ) ?? { x: 0, y: 0 },
        userLocation: getStoredUserLocation(location),
    };
}

export function parseStoredMapPreferences(value) {
    if (!value) {
        return null;
    }

    try {
        const preferences = JSON.parse(value);

        return preferences && typeof preferences === 'object'
            ? preferences
            : null;
    } catch {
        return null;
    }
}
