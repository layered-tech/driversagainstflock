import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
    addSharedRoutingStateListener,
    getDirectionsRouteSyncKey,
    getSharedRoutingState,
    setSharedRoutingState,
} from './shared-routing-state';
import { useMapPreferencesState } from './use-map-preferences-state';
import { useMarkerLoader } from './use-marker-loader';
import { useWazePoliceAlerts } from './use-waze-police-alerts';

const SharedMapStateContext = createContext(null);

export function SharedMapStateProvider({ children }) {
    const mapPreferences = useMapPreferencesState();
    const markerLoader = useMarkerLoader();
    const policeAlertsLoader = useWazePoliceAlerts({
        policeAlertsAreEnabled: mapPreferences.policeAlertsVisible,
        userLocation: mapPreferences.userLocation,
    });
    const initialRoutingState = getSharedRoutingState();
    const [directionsRoute, setDirectionsRoute] = useState(
        initialRoutingState.directionsRoute,
    );
    const [drivingModeIsActive, setDrivingModeIsActive] = useState(
        initialRoutingState.drivingModeIsActive,
    );
    const [pendingDirectionsRequest, setPendingDirectionsRequest] =
        useState(null);
    const [pendingSearchResultRestore, setPendingSearchResultRestore] =
        useState(null);
    const [localityBoundary, setLocalityBoundary] = useState(null);

    useEffect(
        () =>
            addSharedRoutingStateListener((routingState) => {
                const nextRouteSyncKey = getDirectionsRouteSyncKey(
                    routingState.directionsRoute,
                );

                setDirectionsRoute((currentRoute) =>
                    getDirectionsRouteSyncKey(currentRoute) === nextRouteSyncKey
                        ? currentRoute
                        : routingState.directionsRoute,
                );
                setDrivingModeIsActive(routingState.drivingModeIsActive);
            }),
        [],
    );

    useEffect(() => {
        setSharedRoutingState({
            directionsRoute,
            drivingModeIsActive,
        });
    }, [directionsRoute, drivingModeIsActive]);

    const value = useMemo(
        () => ({
            directionsRoute,
            drivingModeIsActive,
            debugOverlayIsVisible: mapPreferences.debugOverlayIsVisible,
            debugOverlayVisibility: mapPreferences.debugOverlayVisibility,
            handleMarkerLoadingIndicatorHidden:
                markerLoader.handleMarkerLoadingIndicatorHidden,
            initialCameraSettings: mapPreferences.initialCameraSettings,
            mapDebugControlOffset: mapPreferences.mapDebugControlOffset,
            mapLightPresetPreference: mapPreferences.mapLightPresetPreference,
            mapPreferencesAreLoaded: mapPreferences.mapPreferencesAreLoaded,
            mapStyleURL: mapPreferences.mapStyleURL,
            mapTrafficEnabled: mapPreferences.mapTrafficEnabled,
            localityBoundary,
            surveillanceMarkersVisible:
                mapPreferences.surveillanceMarkersVisible,
            markerClustersEnabled: mapPreferences.markerClustersEnabled,
            cameraConesVisible: mapPreferences.cameraConesVisible,
            preferPrivateRoutes: mapPreferences.preferPrivateRoutes,
            policeAlerts: policeAlertsLoader.policeAlerts,
            policeAlertsVisible: mapPreferences.policeAlertsVisible,
            markerLoadError: markerLoader.markerLoadError,
            markerLoadingIndicatorIsVisible:
                markerLoader.markerLoadingIndicatorIsVisible,
            markerPoints: markerLoader.markerPoints,
            pendingDirectionsRequest,
            pendingSearchResultRestore,
            renderMarkerLoadingIndicator:
                markerLoader.renderMarkerLoadingIndicator,
            scheduleMarkerLoad: markerLoader.scheduleMarkerLoad,
            setDirectionsRoute,
            setDrivingModeIsActive,
            setDebugOverlayIsVisible: mapPreferences.setDebugOverlayIsVisible,
            setDebugOverlayVisibility: mapPreferences.setDebugOverlayVisibility,
            setMapDebugControlOffset: mapPreferences.setMapDebugControlOffset,
            setPendingDirectionsRequest,
            setPendingSearchResultRestore,
            setMapLightPresetPreference:
                mapPreferences.setMapLightPresetPreference,
            setLocalityBoundary,
            setMapStyleURL: mapPreferences.selectMapStyleURL,
            setMapTrafficEnabled: mapPreferences.setMapTrafficEnabled,
            setSurveillanceMarkersVisible:
                mapPreferences.setSurveillanceMarkersVisible,
            setMarkerClustersEnabled: mapPreferences.setMarkerClustersEnabled,
            setCameraConesVisible: mapPreferences.setCameraConesVisible,
            setPreferPrivateRoutes: mapPreferences.setPreferPrivateRoutes,
            setPoliceAlertsVisible: mapPreferences.setPoliceAlertsVisible,
            setUserLocation: mapPreferences.setUserLocation,
            userLocation: mapPreferences.userLocation,
        }),
        [
            directionsRoute,
            drivingModeIsActive,
            localityBoundary,
            mapPreferences,
            markerLoader,
            pendingDirectionsRequest,
            pendingSearchResultRestore,
            policeAlertsLoader,
        ],
    );

    return (
        <SharedMapStateContext.Provider value={value}>
            {children}
        </SharedMapStateContext.Provider>
    );
}

export function useSharedMapState() {
    const sharedMapState = useContext(SharedMapStateContext);

    if (!sharedMapState) {
        throw new Error(
            'LocationMapScreen must be rendered inside SharedMapStateProvider.',
        );
    }

    return sharedMapState;
}
