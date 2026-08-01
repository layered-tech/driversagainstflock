import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { setMockWazePoliceAlertsEnabled } from './api-mocks';
import { DEBUG_OVERLAY_WAZE } from './debug-overlays';
import {
    addSharedRoutingStateListener,
    getDirectionsRouteSyncKey,
    getSharedRoutingState,
    hydrateSharedRoutingStateAsync,
    routingStatesAreEqual,
    setSharedRoutingState,
    sharedRoutingStateCanPublish,
} from './shared-routing-state';
import { useElectronicHorizon } from './use-electronic-horizon';
import { useMapPreferencesState } from './use-map-preferences-state';
import { useMarkerLoader } from './use-marker-loader';
import { useUpcomingElectronicHorizonAlerts } from './use-upcoming-electronic-horizon-alerts';
import { useWazePoliceAlerts } from './use-waze-police-alerts';

const SharedMapStateContext = createContext(null);
const SharedMapLocationStateContext = createContext(null);

export function SharedMapStateProvider({ children }) {
    const mapPreferences = useMapPreferencesState();
    const markerLoader = useMarkerLoader();
    const wazeMockIsEnabled =
        mapPreferences.debugOverlayVisibility?.[DEBUG_OVERLAY_WAZE] === true;
    const policeAlertsLoader = useWazePoliceAlerts({
        policeAlertsAreEnabled:
            mapPreferences.policeAlertsVisible || wazeMockIsEnabled,
        userLocation: mapPreferences.userLocation,
    });
    useEffect(() => {
        setMockWazePoliceAlertsEnabled(wazeMockIsEnabled);
    }, [wazeMockIsEnabled]);
    const initialRoutingState = getSharedRoutingState();
    const [directionsRoute, setDirectionsRoute] = useState(
        initialRoutingState.directionsRoute,
    );
    const [drivingModeIsActive, setDrivingModeIsActive] = useState(
        initialRoutingState.drivingModeIsActive,
    );
    const [routingStateIsHydrated, setRoutingStateIsHydrated] = useState(false);
    const [routingStatePublicationIsSafe, setRoutingStatePublicationIsSafe] =
        useState(sharedRoutingStateCanPublish);
    const hydrationFallbackRoutingStateRef = useRef(initialRoutingState);
    const [pendingDirectionsRequest, setPendingDirectionsRequest] =
        useState(null);
    const [pendingSearchResultRestore, setPendingSearchResultRestore] =
        useState(null);
    const [localityBoundary, setLocalityBoundary] = useState(null);
    const electronicHorizon = useElectronicHorizon({
        enabled: drivingModeIsActive && !directionsRoute,
    });
    const { upcomingAlerts } = useUpcomingElectronicHorizonAlerts({
        directionsRoute,
        electronicHorizon,
        enabled: drivingModeIsActive,
        policeAlerts: policeAlertsLoader.policeAlerts,
        userLocation: mapPreferences.userLocation,
    });

    useEffect(() => {
        let isMounted = true;
        const applyRoutingState = (routingState) => {
            if (!isMounted) {
                return;
            }

            const nextRouteSyncKey = getDirectionsRouteSyncKey(
                routingState.directionsRoute,
            );

            setDirectionsRoute((currentRoute) =>
                getDirectionsRouteSyncKey(currentRoute) === nextRouteSyncKey
                    ? currentRoute
                    : routingState.directionsRoute,
            );
            setDrivingModeIsActive(routingState.drivingModeIsActive);
            setRoutingStatePublicationIsSafe(sharedRoutingStateCanPublish());
        };
        const unsubscribe = addSharedRoutingStateListener(applyRoutingState);

        hydrateSharedRoutingStateAsync().then((routingState) => {
            if (!isMounted) {
                return;
            }

            hydrationFallbackRoutingStateRef.current = routingState;
            applyRoutingState(routingState);
            setRoutingStateIsHydrated(true);
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!routingStateIsHydrated) {
            return;
        }

        const nextRoutingState = {
            directionsRoute,
            drivingModeIsActive,
        };

        if (
            !routingStatePublicationIsSafe &&
            routingStatesAreEqual(
                nextRoutingState,
                hydrationFallbackRoutingStateRef.current,
            )
        ) {
            return;
        }

        setSharedRoutingState(nextRoutingState);
    }, [
        directionsRoute,
        drivingModeIsActive,
        routingStateIsHydrated,
        routingStatePublicationIsSafe,
    ]);

    const value = useMemo(
        () => ({
            directionsRoute,
            drivingModeIsActive,
            electronicHorizon,
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
            policeAlertsVisible:
                mapPreferences.policeAlertsVisible || wazeMockIsEnabled,
            upcomingAlerts,
            markerLoadError: markerLoader.markerLoadError,
            markerLoadingIndicatorIsVisible:
                markerLoader.markerLoadingIndicatorIsVisible,
            markerPoints: markerLoader.markerPoints,
            pendingDirectionsRequest,
            pendingSearchResultRestore,
            renderMarkerLoadingIndicator:
                markerLoader.renderMarkerLoadingIndicator,
            scheduleMarkerLoad: markerLoader.scheduleMarkerLoad,
            upsertMarkerPoints: markerLoader.upsertMarkerPoints,
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
        }),
        [
            directionsRoute,
            drivingModeIsActive,
            electronicHorizon,
            localityBoundary,
            mapPreferences.cameraConesVisible,
            mapPreferences.debugOverlayIsVisible,
            mapPreferences.debugOverlayVisibility,
            mapPreferences.initialCameraSettings,
            mapPreferences.mapDebugControlOffset,
            mapPreferences.mapLightPresetPreference,
            mapPreferences.mapPreferencesAreLoaded,
            mapPreferences.mapStyleURL,
            mapPreferences.mapTrafficEnabled,
            mapPreferences.markerClustersEnabled,
            mapPreferences.policeAlertsVisible,
            wazeMockIsEnabled,
            mapPreferences.preferPrivateRoutes,
            mapPreferences.selectMapStyleURL,
            mapPreferences.setCameraConesVisible,
            mapPreferences.setDebugOverlayIsVisible,
            mapPreferences.setDebugOverlayVisibility,
            mapPreferences.setMapDebugControlOffset,
            mapPreferences.setMapLightPresetPreference,
            mapPreferences.setMapTrafficEnabled,
            mapPreferences.setMarkerClustersEnabled,
            mapPreferences.setPoliceAlertsVisible,
            mapPreferences.setPreferPrivateRoutes,
            mapPreferences.setSurveillanceMarkersVisible,
            mapPreferences.surveillanceMarkersVisible,
            markerLoader.handleMarkerLoadingIndicatorHidden,
            markerLoader.markerLoadError,
            markerLoader.markerLoadingIndicatorIsVisible,
            markerLoader.markerPoints,
            markerLoader.renderMarkerLoadingIndicator,
            markerLoader.scheduleMarkerLoad,
            markerLoader.upsertMarkerPoints,
            pendingDirectionsRequest,
            pendingSearchResultRestore,
            policeAlertsLoader.policeAlerts,
            upcomingAlerts,
        ],
    );
    const locationValue = useMemo(
        () => ({
            setUserLocation: mapPreferences.setUserLocation,
            userLocation: mapPreferences.userLocation,
        }),
        [mapPreferences.setUserLocation, mapPreferences.userLocation],
    );

    if (!routingStateIsHydrated) {
        return null;
    }

    return (
        <SharedMapStateContext.Provider value={value}>
            <SharedMapLocationStateContext.Provider value={locationValue}>
                {children}
            </SharedMapLocationStateContext.Provider>
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

export function useSharedMapLocationState() {
    const sharedMapLocationState = useContext(SharedMapLocationStateContext);

    if (!sharedMapLocationState) {
        throw new Error(
            'useSharedMapLocationState must be rendered inside SharedMapStateProvider.',
        );
    }

    return sharedMapLocationState;
}
