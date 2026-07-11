import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_PREFERENCES_STORAGE_KEY } from './constants';
import {
    DEBUG_OVERLAY_KEYS,
    getAllDebugOverlayVisibility,
    getDebugOverlayIsVisible,
    getDebugOverlayVisibilityWithDefaults,
} from './debug-overlays';
import {
    getDefaultMapLightPresetPreference,
    getDefaultMapStyleURL,
    getInitialCameraSettings,
    getMapLayerByStyleURL,
    getPersistableMapPreferences,
    getStoredCameraConesVisible,
    getStoredDebugOverlayVisibility,
    getStoredMapDebugControlOffset,
    getStoredMapLightPresetPreference,
    getStoredMapStylePreference,
    getStoredMapTrafficEnabled,
    getStoredMarkerClustersEnabled,
    getStoredPoliceAlertsVisible,
    getStoredPreferPrivateRoutes,
    getStoredSurveillanceMarkersVisible,
    getStoredUserLocation,
    parseStoredMapPreferences,
} from './map-preferences';
import {
    addSharedMapPreferencesStateListener,
    getSharedMapPreferencesState,
    setSharedMapPreferencesState,
} from './shared-map-preferences-sync';

export function useMapPreferencesState() {
    const defaultMapStyleURL = getDefaultMapStyleURL();
    const defaultMapLightPresetPreference =
        getDefaultMapLightPresetPreference();
    const sharedMapPreferences = getSharedMapPreferencesState();
    const mapStyleWasSelectedRef = useRef(
        sharedMapPreferences.mapStyleIsUserSelected === true,
    );
    const [initialCameraSettings, setInitialCameraSettings] = useState(
        () =>
            sharedMapPreferences.initialCameraSettings ??
            getInitialCameraSettings(sharedMapPreferences.userLocation),
    );
    const [mapLightPresetPreference, setMapLightPresetPreference] = useState(
        sharedMapPreferences.mapLightPresetPreference ??
            defaultMapLightPresetPreference,
    );
    const [mapPreferencesAreLoaded, setMapPreferencesAreLoaded] = useState(
        sharedMapPreferences.mapPreferencesAreLoaded === true,
    );
    const [mapStyleIsUserSelected, setMapStyleIsUserSelected] = useState(
        sharedMapPreferences.mapStyleIsUserSelected === true,
    );
    const [mapStyleURL, setMapStyleURL] = useState(
        sharedMapPreferences.mapStyleURL ?? defaultMapStyleURL,
    );
    const [mapTrafficEnabled, setMapTrafficEnabled] = useState(
        sharedMapPreferences.mapTrafficEnabled === true,
    );
    const [surveillanceMarkersVisible, setSurveillanceMarkersVisible] =
        useState(sharedMapPreferences.surveillanceMarkersVisible !== false);
    const [markerClustersEnabled, setMarkerClustersEnabled] = useState(
        sharedMapPreferences.markerClustersEnabled !== false,
    );
    const [cameraConesVisible, setCameraConesVisible] = useState(
        sharedMapPreferences.cameraConesVisible !== false,
    );
    const [preferPrivateRoutes, setPreferPrivateRoutes] = useState(
        sharedMapPreferences.preferPrivateRoutes === true,
    );
    const [policeAlertsVisible, setPoliceAlertsVisible] = useState(
        sharedMapPreferences.policeAlertsVisible === true,
    );
    const [debugOverlayVisibility, setDebugOverlayVisibilityState] = useState(
        getDebugOverlayVisibilityWithDefaults(
            sharedMapPreferences.debugOverlayVisibility,
            sharedMapPreferences.debugOverlayIsVisible === true,
        ),
    );
    const [mapDebugControlOffset, setMapDebugControlOffset] = useState({
        x: sharedMapPreferences.mapDebugControlOffset?.x ?? 0,
        y: sharedMapPreferences.mapDebugControlOffset?.y ?? 0,
    });
    const [userLocation, setUserLocation] = useState(
        sharedMapPreferences.userLocation,
    );
    const applySharedMapPreferences = useCallback(
        (preferences) => {
            if (!preferences?.mapPreferencesAreLoaded) {
                return;
            }

            const nextMapStyleIsUserSelected =
                preferences.mapStyleIsUserSelected === true;

            mapStyleWasSelectedRef.current = nextMapStyleIsUserSelected;
            setInitialCameraSettings(
                preferences.initialCameraSettings ??
                    getInitialCameraSettings(preferences.userLocation),
            );
            setMapLightPresetPreference(
                preferences.mapLightPresetPreference ??
                    defaultMapLightPresetPreference,
            );
            setMapPreferencesAreLoaded(true);
            setMapStyleIsUserSelected(nextMapStyleIsUserSelected);
            setMapStyleURL(preferences.mapStyleURL ?? defaultMapStyleURL);
            setMapTrafficEnabled(preferences.mapTrafficEnabled === true);
            const nextSurveillanceMarkersVisible =
                preferences.surveillanceMarkersVisible !== false;

            setSurveillanceMarkersVisible(nextSurveillanceMarkersVisible);
            setMarkerClustersEnabled(
                nextSurveillanceMarkersVisible &&
                    preferences.markerClustersEnabled !== false,
            );
            setCameraConesVisible(
                nextSurveillanceMarkersVisible &&
                    preferences.cameraConesVisible !== false,
            );
            setPreferPrivateRoutes(preferences.preferPrivateRoutes === true);
            setPoliceAlertsVisible(preferences.policeAlertsVisible === true);
            setDebugOverlayVisibilityState(
                getDebugOverlayVisibilityWithDefaults(
                    preferences.debugOverlayVisibility,
                    preferences.debugOverlayIsVisible === true,
                ),
            );
            setMapDebugControlOffset({
                x: preferences.mapDebugControlOffset?.x ?? 0,
                y: preferences.mapDebugControlOffset?.y ?? 0,
            });
            setUserLocation(preferences.userLocation ?? null);
        },
        [defaultMapLightPresetPreference, defaultMapStyleURL],
    );

    useEffect(() => {
        let isActive = true;

        async function loadMapPreferences() {
            const sharedPreferences = getSharedMapPreferencesState();

            if (sharedPreferences.mapPreferencesAreLoaded) {
                if (isActive) {
                    applySharedMapPreferences(sharedPreferences);
                }
                return;
            }

            try {
                const storedValue = await AsyncStorage.getItem(
                    MAP_PREFERENCES_STORAGE_KEY,
                );
                const liveSharedPreferences = getSharedMapPreferencesState();

                if (liveSharedPreferences.mapPreferencesAreLoaded) {
                    if (isActive) {
                        applySharedMapPreferences(liveSharedPreferences);
                    }
                    return;
                }

                const preferences = parseStoredMapPreferences(storedValue);
                const storedMapStylePreference =
                    getStoredMapStylePreference(preferences);
                const storedUserLocation = getStoredUserLocation(
                    preferences?.userLocation,
                );
                const storedMapTrafficEnabled =
                    getStoredMapTrafficEnabled(preferences);
                const storedSurveillanceMarkersVisible =
                    getStoredSurveillanceMarkersVisible(preferences);
                const storedMarkerClustersEnabled =
                    getStoredMarkerClustersEnabled(preferences);
                const storedCameraConesVisible =
                    getStoredCameraConesVisible(preferences);
                const storedPreferPrivateRoutes =
                    getStoredPreferPrivateRoutes(preferences);
                const storedPoliceAlertsVisible =
                    getStoredPoliceAlertsVisible(preferences);
                const storedMapLightPresetPreference =
                    getStoredMapLightPresetPreference(preferences);
                const storedDebugOverlayVisibility =
                    getStoredDebugOverlayVisibility(preferences);
                const storedMapDebugControlOffset =
                    getStoredMapDebugControlOffset(
                        preferences?.mapDebugControlOffset,
                    );

                if (!isActive) {
                    return;
                }

                setMapTrafficEnabled(storedMapTrafficEnabled);
                setSurveillanceMarkersVisible(storedSurveillanceMarkersVisible);
                setMarkerClustersEnabled(storedMarkerClustersEnabled);
                setCameraConesVisible(storedCameraConesVisible);
                setPreferPrivateRoutes(storedPreferPrivateRoutes);
                setPoliceAlertsVisible(storedPoliceAlertsVisible);
                setDebugOverlayVisibilityState(storedDebugOverlayVisibility);

                if (storedMapLightPresetPreference) {
                    setMapLightPresetPreference(storedMapLightPresetPreference);
                }

                if (storedMapDebugControlOffset) {
                    setMapDebugControlOffset(storedMapDebugControlOffset);
                }

                if (
                    storedMapStylePreference &&
                    !mapStyleWasSelectedRef.current
                ) {
                    mapStyleWasSelectedRef.current =
                        storedMapStylePreference.isUserSelected;
                    setMapStyleURL(storedMapStylePreference.styleURL);
                    setMapStyleIsUserSelected(
                        storedMapStylePreference.isUserSelected,
                    );
                }

                if (storedUserLocation) {
                    setInitialCameraSettings(
                        getInitialCameraSettings(storedUserLocation),
                    );
                    setUserLocation(storedUserLocation);
                }
            } catch {
                // Map preferences are a convenience; invalid storage should not block the map.
            } finally {
                if (isActive) {
                    setMapPreferencesAreLoaded(true);
                }
            }
        }

        loadMapPreferences();

        return () => {
            isActive = false;
        };
    }, [applySharedMapPreferences]);

    useEffect(
        () => addSharedMapPreferencesStateListener(applySharedMapPreferences),
        [applySharedMapPreferences],
    );

    useEffect(() => {
        if (!mapPreferencesAreLoaded) {
            return;
        }

        const debugOverlayIsVisible = getDebugOverlayIsVisible(
            debugOverlayVisibility,
        );

        setSharedMapPreferencesState({
            debugOverlayVisibility,
            debugOverlayIsVisible,
            initialCameraSettings,
            mapDebugControlOffset,
            mapLightPresetPreference,
            mapPreferencesAreLoaded,
            mapStyleIsUserSelected,
            mapStyleURL,
            mapTrafficEnabled,
            surveillanceMarkersVisible,
            markerClustersEnabled,
            cameraConesVisible,
            preferPrivateRoutes,
            policeAlertsVisible,
            userLocation,
        });

        const preferences = getPersistableMapPreferences(
            mapStyleURL,
            mapStyleIsUserSelected,
            mapTrafficEnabled,
            mapLightPresetPreference,
            userLocation,
            debugOverlayVisibility,
            mapDebugControlOffset,
            surveillanceMarkersVisible,
            markerClustersEnabled,
            cameraConesVisible,
            preferPrivateRoutes,
            policeAlertsVisible,
        );

        AsyncStorage.setItem(
            MAP_PREFERENCES_STORAGE_KEY,
            JSON.stringify(preferences),
        ).catch(() => {
            // Persisted map state should never interrupt map interaction.
        });
    }, [
        debugOverlayVisibility,
        initialCameraSettings,
        mapDebugControlOffset,
        mapLightPresetPreference,
        mapPreferencesAreLoaded,
        mapStyleIsUserSelected,
        mapStyleURL,
        mapTrafficEnabled,
        surveillanceMarkersVisible,
        markerClustersEnabled,
        cameraConesVisible,
        preferPrivateRoutes,
        policeAlertsVisible,
        userLocation,
    ]);

    const debugOverlayIsVisible = getDebugOverlayIsVisible(
        debugOverlayVisibility,
    );
    const setDebugOverlayIsVisible = useCallback((isVisible) => {
        setDebugOverlayVisibilityState(getAllDebugOverlayVisibility(isVisible));
    }, []);
    const setDebugOverlayVisibility = useCallback((key, isVisible) => {
        if (!DEBUG_OVERLAY_KEYS.includes(key)) {
            return;
        }

        setDebugOverlayVisibilityState((currentVisibility) => ({
            ...getDebugOverlayVisibilityWithDefaults(currentVisibility),
            [key]: isVisible === true,
        }));
    }, []);

    const selectMapStyleURL = useCallback(
        (styleURL) => {
            const mapLayer = getMapLayerByStyleURL(styleURL);
            const nextMapStyleURL = mapLayer?.styleURL ?? defaultMapStyleURL;
            const isUserSelected = mapLayer?.key === 'standard-satellite';

            mapStyleWasSelectedRef.current = isUserSelected;
            setMapStyleURL(nextMapStyleURL);
            setMapStyleIsUserSelected(isUserSelected);
        },
        [defaultMapStyleURL],
    );

    return {
        initialCameraSettings,
        debugOverlayVisibility,
        debugOverlayIsVisible,
        mapDebugControlOffset,
        mapLightPresetPreference,
        mapPreferencesAreLoaded,
        mapStyleURL,
        mapTrafficEnabled,
        surveillanceMarkersVisible,
        markerClustersEnabled,
        cameraConesVisible,
        preferPrivateRoutes,
        policeAlertsVisible,
        selectMapStyleURL,
        setDebugOverlayIsVisible,
        setDebugOverlayVisibility,
        setMapDebugControlOffset,
        setMapLightPresetPreference,
        setMapTrafficEnabled,
        setSurveillanceMarkersVisible,
        setMarkerClustersEnabled,
        setCameraConesVisible,
        setPreferPrivateRoutes,
        setPoliceAlertsVisible,
        setUserLocation,
        userLocation,
    };
}
