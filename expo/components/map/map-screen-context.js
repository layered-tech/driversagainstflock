import { createContext, useContext, useMemo } from 'react';

const MapCanvasContext = createContext(null);
const MapLocationContext = createContext(null);
const MapControlsContext = createContext(null);
const MapLayerContext = createContext(null);
const MarkerDetailsContext = createContext(null);
const MapSearchContext = createContext(null);
const PlaceSheetContext = createContext(null);
const PermissionSheetContext = createContext(null);
const DebugControlsContext = createContext(null);
const DirectionsRouteContext = createContext(null);
const SearchResultsContext = createContext(null);
const EMPTY_MAP_SCREEN_CONTEXT_VALUE = Object.freeze({});
const EMPTY_ANDROID_AUTO_SUBMITTED_SEARCH_RESULTS = Object.freeze([]);

function noop() {}

function useRequiredContext(context, name) {
    const value = useContext(context);

    if (!value) {
        throw new Error(`${name} must be used inside MapScreenProviders.`);
    }

    return value;
}

export function MapScreenProviders({
    canvasValue,
    controlsValue,
    debugControlsValue,
    directionsRouteValue,
    layerValue,
    locationValue,
    markerDetailsValue,
    permissionSheetValue,
    placeSheetValue,
    searchResultsValue,
    searchValue,
    children,
}) {
    return (
        <MapCanvasContext.Provider value={canvasValue}>
            <MapLocationContext.Provider value={locationValue}>
                <MapControlsContext.Provider value={controlsValue}>
                    <MapLayerContext.Provider value={layerValue}>
                        <MarkerDetailsContext.Provider
                            value={markerDetailsValue}
                        >
                            <MapSearchContext.Provider value={searchValue}>
                                <PlaceSheetContext.Provider
                                    value={placeSheetValue}
                                >
                                    <PermissionSheetContext.Provider
                                        value={permissionSheetValue}
                                    >
                                        <DebugControlsContext.Provider
                                            value={debugControlsValue}
                                        >
                                            <DirectionsRouteContext.Provider
                                                value={directionsRouteValue}
                                            >
                                                <SearchResultsContext.Provider
                                                    value={searchResultsValue}
                                                >
                                                    {children}
                                                </SearchResultsContext.Provider>
                                            </DirectionsRouteContext.Provider>
                                        </DebugControlsContext.Provider>
                                    </PermissionSheetContext.Provider>
                                </PlaceSheetContext.Provider>
                            </MapSearchContext.Provider>
                        </MarkerDetailsContext.Provider>
                    </MapLayerContext.Provider>
                </MapControlsContext.Provider>
            </MapLocationContext.Provider>
        </MapCanvasContext.Provider>
    );
}

export function useMapCanvasContextValue({
    contributePins,
    contributePlacementIsActive,
    directionsDebugFeatureCollection,
    directionsRouteFeatureCollection,
    electronicHorizonDebugFeatureCollection,
    e2eMapApiMocksEnabled,
    handleMapPress,
    handleMarkerSourcePress,
    initialCameraSettings,
    isDrivingMode,
    locationController,
    mapLightPreset,
    mapPreferencesAreLoaded,
    mapStyleURL,
    mapTrafficEnabled,
    surveillanceMarkersVisible,
    markerClustersEnabled,
    cameraConesVisible,
    localityBoundary,
    markerFeatureCollection,
    policeAlertFeatureCollection,
    policeAlertsVisible,
    presentation,
    searchController,
}) {
    return useMemo(
        () => ({
            cameraRef: locationController.cameraRef,
            contributePins,
            contributePlacementIsActive,
            handleCameraChanged: locationController.handleCameraChanged,
            handleMapLoaded: locationController.handleMapLoaded,
            handleMapPress,
            handleMarkerSourcePress,
            handleSubmittedSearchResultPress:
                searchController.handleSubmittedSearchResultPress,
            initialCameraSettings,
            directionsDebugFeatureCollection,
            directionsRouteFeatureCollection,
            electronicHorizonDebugFeatureCollection,
            e2eMapApiMocksEnabled,
            isDrivingMode,
            isFollowing: locationController.isFollowing,
            locationAccessGranted: locationController.locationAccessGranted,
            mapboxAttributionPosition: presentation.mapboxAttributionPosition,
            mapboxLogoPosition: presentation.mapboxLogoPosition,
            mapCompassPosition: presentation.mapCompassPosition,
            mapPreferencesAreLoaded,
            mapLightPreset,
            mapStyleURL,
            mapTrafficEnabled,
            surveillanceMarkersVisible,
            markerClustersEnabled,
            cameraConesVisible,
            localityBoundary,
            mapViewRef: locationController.mapViewRef,
            markerFeatureCollection,
            markerShapeSourceRef: locationController.markerShapeSourceRef,
            nativeCameraFollowProps: locationController.nativeCameraFollowProps,
            policeAlertFeatureCollection,
            policeAlertsVisible,
            submittedSearchResults: searchController.submittedSearchResults,
        }),
        [
            contributePins,
            contributePlacementIsActive,
            directionsDebugFeatureCollection,
            directionsRouteFeatureCollection,
            electronicHorizonDebugFeatureCollection,
            e2eMapApiMocksEnabled,
            handleMapPress,
            handleMarkerSourcePress,
            initialCameraSettings,
            isDrivingMode,
            locationController.cameraRef,
            locationController.handleCameraChanged,
            locationController.handleMapLoaded,
            locationController.isFollowing,
            locationController.locationAccessGranted,
            locationController.mapViewRef,
            locationController.markerShapeSourceRef,
            locationController.nativeCameraFollowProps,
            mapLightPreset,
            mapPreferencesAreLoaded,
            mapStyleURL,
            mapTrafficEnabled,
            surveillanceMarkersVisible,
            markerClustersEnabled,
            cameraConesVisible,
            localityBoundary,
            markerFeatureCollection,
            policeAlertFeatureCollection,
            policeAlertsVisible,
            presentation.mapboxAttributionPosition,
            presentation.mapboxLogoPosition,
            presentation.mapCompassPosition,
            searchController.handleSubmittedSearchResultPress,
            searchController.submittedSearchResults,
        ],
    );
}

export function useMapLocationContextValue(userLocation) {
    return useMemo(() => ({ userLocation }), [userLocation]);
}

export function useMapControlsContextValue({
    freeDriveIsActive,
    handleStartFreeDrive,
    handleStopFreeDrive,
    handleMarkerLoadingIndicatorHidden,
    locationController,
    mapPreferencesAreLoaded,
    markerLoadError,
    markerLoadingIndicatorIsVisible,
    presentation,
    renderMarkerLoadingIndicator,
}) {
    return useMemo(
        () => ({
            defaultMapControlClassName: presentation.defaultMapControlClassName,
            defaultMapControlGlassTintColor:
                presentation.defaultMapControlGlassTintColor,
            defaultMapControlIconColor: presentation.defaultMapControlIconColor,
            drivingRecenterButtonClassName:
                presentation.drivingRecenterButtonClassName,
            drivingRecenterButtonGlassTintColor:
                presentation.drivingRecenterButtonGlassTintColor,
            drivingRecenterIconColor: presentation.drivingRecenterIconColor,
            drivingRecenterIsVisible:
                locationController.drivingRecenterIsVisible,
            freeDriveIsActive,
            handleDrivingRecenterPress:
                locationController.handleDrivingRecenterPress,
            handleStartFreeDrive,
            handleStopFreeDrive,
            handleLocationTrackingPress:
                locationController.handleLocationTrackingPress,
            handleMarkerLoadingIndicatorHidden,
            handleZoomPress: locationController.handleZoomPress,
            isLocating: locationController.isLocating,
            locatingIndicatorColor: presentation.locatingIndicatorColor,
            mapPreferencesAreLoaded,
            markerLoadError,
            markerLoadingIndicatorIsVisible,
            renderMarkerLoadingIndicator,
            trackingButtonAccessibilityLabel:
                presentation.trackingButtonAccessibilityLabel,
            trackingButtonClassName: presentation.trackingButtonClassName,
            trackingButtonGlassTintColor:
                presentation.trackingButtonGlassTintColor,
            trackingIconColor: presentation.trackingIconColor,
        }),
        [
            freeDriveIsActive,
            handleStartFreeDrive,
            handleStopFreeDrive,
            handleMarkerLoadingIndicatorHidden,
            locationController.drivingRecenterIsVisible,
            locationController.handleDrivingRecenterPress,
            locationController.handleLocationTrackingPress,
            locationController.handleZoomPress,
            locationController.isLocating,
            mapPreferencesAreLoaded,
            markerLoadError,
            markerLoadingIndicatorIsVisible,
            presentation.defaultMapControlClassName,
            presentation.defaultMapControlGlassTintColor,
            presentation.defaultMapControlIconColor,
            presentation.drivingRecenterButtonClassName,
            presentation.drivingRecenterButtonGlassTintColor,
            presentation.drivingRecenterIconColor,
            presentation.locatingIndicatorColor,
            presentation.trackingButtonAccessibilityLabel,
            presentation.trackingButtonClassName,
            presentation.trackingButtonGlassTintColor,
            presentation.trackingIconColor,
            renderMarkerLoadingIndicator,
        ],
    );
}

export function useMapDebugControlsContextValue({
    cameraFocusPadding,
    debugOverlayVisibility,
    directionsRoute,
    directionsRouteCameraPadding,
    isDrivingMode,
    locationController,
    mapPreferencesAreLoaded,
    presentation,
    searchController,
    searchResultsCameraPadding,
    setDebugOverlayVisibility,
    sideSheetLayoutIsActive,
}) {
    const cameraFocusDebugState = useMemo(() => {
        if (isDrivingMode) {
            return null;
        }

        const layoutLabel = sideSheetLayoutIsActive ? 'right pane' : 'top band';

        if (directionsRoute) {
            return {
                label: `Directions route (${layoutLabel})`,
                padding: directionsRouteCameraPadding,
            };
        }

        if (
            searchController.submittedSearchResults.length &&
            !searchController.selectedPlaceDetails
        ) {
            return {
                label: `Search results (${layoutLabel})`,
                padding: searchResultsCameraPadding,
            };
        }

        return {
            label: `Point focus (${layoutLabel})`,
            padding: cameraFocusPadding,
        };
    }, [
        cameraFocusPadding,
        directionsRoute,
        directionsRouteCameraPadding,
        isDrivingMode,
        searchController.selectedPlaceDetails,
        searchController.submittedSearchResults.length,
        searchResultsCameraPadding,
        sideSheetLayoutIsActive,
    ]);

    return useMemo(
        () => ({
            cameraFocusDebugState,
            currentCameraDebugState: locationController.currentCameraDebugState,
            insets: presentation.insets,
            mapControlLayoutInsets: presentation.mapControlLayoutInsets,
            mapDebugControlPosition: presentation.mapDebugControlPosition,
            mapPreferencesAreLoaded,
            debugOverlayVisibility,
            setDebugOverlayVisibility,
        }),
        [
            cameraFocusDebugState,
            debugOverlayVisibility,
            locationController.currentCameraDebugState,
            mapPreferencesAreLoaded,
            presentation.insets,
            presentation.mapControlLayoutInsets,
            presentation.mapDebugControlPosition,
            setDebugOverlayVisibility,
        ],
    );
}

export function useDirectionsRouteContextValue({
    bottomSheetAnimatedPosition,
    directionsRoute,
    directionsRouteSheetSnapPoints,
    directionsRouteSheetTrackingHandlers,
    handleStartDriving,
    mapPreferencesAreLoaded,
    presentation,
    searchController,
}) {
    return useMemo(
        () => ({
            ...searchController,
            bottomSheetBackgroundStyle: presentation.bottomSheetBackgroundStyle,
            bottomSheetHandleIndicatorStyle:
                presentation.bottomSheetHandleIndicatorStyle,
            bottomSheetAnimatedPosition,
            directionsRoute,
            directionsRouteSheetSnapPoints,
            directionsRouteSheetTrackingHandlers,
            handleStartDriving,
            insets: presentation.insets,
            mapPreferencesAreLoaded,
            searchIconColor: presentation.searchIconColor,
            searchPrimaryIconColor: presentation.searchPrimaryIconColor,
        }),
        [
            bottomSheetAnimatedPosition,
            directionsRoute,
            directionsRouteSheetSnapPoints,
            directionsRouteSheetTrackingHandlers,
            handleStartDriving,
            mapPreferencesAreLoaded,
            presentation.bottomSheetBackgroundStyle,
            presentation.bottomSheetHandleIndicatorStyle,
            presentation.insets,
            presentation.searchIconColor,
            presentation.searchPrimaryIconColor,
            searchController,
        ],
    );
}

export function useMapLayerContextValue({
    handleMapLayerPress,
    handleMapLayerSelect,
    handleMapLayerSheetDismiss,
    handleMapLightPresetPreferenceChange,
    handleMapTrafficEnabledChange,
    handlePoliceAlertsVisibleChange,
    layerSheetRef,
    layerSheetResetCount,
    locationController,
    mapLightPresetPreference,
    mapPreferencesAreLoaded,
    mapStyleURL,
    mapTrafficEnabled,
    surveillanceMarkersVisible,
    markerClustersEnabled,
    cameraConesVisible,
    preferPrivateRoutes,
    policeAlertsVisible,
    presentation,
    renderBackdrop,
    setSurveillanceMarkersVisible,
    setMarkerClustersEnabled,
    setCameraConesVisible,
    setPreferPrivateRoutes,
}) {
    return useMemo(
        () => ({
            bottomSheetBackgroundStyle: presentation.bottomSheetBackgroundStyle,
            bottomSheetHandleIndicatorStyle:
                presentation.bottomSheetHandleIndicatorStyle,
            currentMapBounds: locationController.currentMapBounds,
            handleMapLayerPress,
            handleMapLayerSheetDismiss,
            handleMapLayerSelect,
            insets: presentation.insets,
            layerSheetResetCount,
            layerSheetRef,
            mapLayerAccessibilityLabel: presentation.mapLayerAccessibilityLabel,
            mapLayerButtonClassName: presentation.mapLayerButtonClassName,
            mapLayerButtonGlassTintColor:
                presentation.mapLayerButtonGlassTintColor,
            mapLayerIconColor: presentation.mapLayerIconColor,
            mapLightPresetPreference,
            mapPreferencesAreLoaded,
            mapStyleURL,
            mapTrafficEnabled,
            surveillanceMarkersVisible,
            markerClustersEnabled,
            cameraConesVisible,
            preferPrivateRoutes,
            policeAlertsVisible,
            renderBackdrop,
            selectedMapLayer: presentation.selectedMapLayer,
            setMapLightPresetPreference: handleMapLightPresetPreferenceChange,
            setMapTrafficEnabled: handleMapTrafficEnabledChange,
            setPoliceAlertsVisible: handlePoliceAlertsVisibleChange,
            setSurveillanceMarkersVisible,
            setMarkerClustersEnabled,
            setCameraConesVisible,
            setPreferPrivateRoutes,
        }),
        [
            handleMapLayerPress,
            handleMapLayerSelect,
            handleMapLayerSheetDismiss,
            handleMapLightPresetPreferenceChange,
            handleMapTrafficEnabledChange,
            handlePoliceAlertsVisibleChange,
            layerSheetRef,
            layerSheetResetCount,
            locationController.currentMapBounds,
            mapLightPresetPreference,
            mapPreferencesAreLoaded,
            mapStyleURL,
            mapTrafficEnabled,
            surveillanceMarkersVisible,
            markerClustersEnabled,
            cameraConesVisible,
            preferPrivateRoutes,
            policeAlertsVisible,
            presentation.bottomSheetBackgroundStyle,
            presentation.bottomSheetHandleIndicatorStyle,
            presentation.insets,
            presentation.mapLayerAccessibilityLabel,
            presentation.mapLayerButtonClassName,
            presentation.mapLayerButtonGlassTintColor,
            presentation.mapLayerIconColor,
            presentation.selectedMapLayer,
            renderBackdrop,
            setSurveillanceMarkersVisible,
            setMarkerClustersEnabled,
            setCameraConesVisible,
            setPreferPrivateRoutes,
        ],
    );
}

export function useMapSearchContextValue({
    mapPreferencesAreLoaded,
    presentation,
    searchController,
}) {
    return useMemo(
        () => ({
            ...searchController,
            mapPreferencesAreLoaded,
            insets: presentation.insets,
            searchGlassTintColor: presentation.searchGlassTintColor,
            searchIconColor: presentation.searchIconColor,
            searchPlaceholderColor: presentation.searchPlaceholderColor,
            searchPrimaryIconColor: presentation.searchPrimaryIconColor,
            searchSource: presentation.searchSource,
            voiceSearchIconColor: presentation.voiceSearchIconColor,
        }),
        [
            mapPreferencesAreLoaded,
            presentation.insets,
            presentation.searchGlassTintColor,
            presentation.searchIconColor,
            presentation.searchPlaceholderColor,
            presentation.searchPrimaryIconColor,
            presentation.searchSource,
            presentation.voiceSearchIconColor,
            searchController,
        ],
    );
}

export function useSearchResultsContextValue({
    bottomSheetAnimatedPosition,
    mapPreferencesAreLoaded,
    presentation,
    searchController,
    submittedSearchResultsSheetSnapPoints,
    submittedSearchResultsSheetTrackingHandlers,
}) {
    return useMemo(
        () => ({
            ...searchController,
            bottomSheetAnimatedPosition,
            bottomSheetBackgroundStyle: presentation.bottomSheetBackgroundStyle,
            bottomSheetHandleIndicatorStyle:
                presentation.bottomSheetHandleIndicatorStyle,
            insets: presentation.insets,
            mapPreferencesAreLoaded,
            searchIconColor: presentation.searchIconColor,
            submittedSearchResultsSheetSnapPoints,
            submittedSearchResultsSheetTrackingHandlers,
        }),
        [
            bottomSheetAnimatedPosition,
            mapPreferencesAreLoaded,
            presentation.bottomSheetBackgroundStyle,
            presentation.bottomSheetHandleIndicatorStyle,
            presentation.insets,
            presentation.searchIconColor,
            searchController,
            submittedSearchResultsSheetSnapPoints,
            submittedSearchResultsSheetTrackingHandlers,
        ],
    );
}

export function usePlaceSheetContextValue({
    bottomSheetAnimatedPosition,
    mapPreferencesAreLoaded,
    placeSheetTrackingHandlers,
    presentation,
    searchController,
}) {
    return useMemo(
        () => ({
            ...searchController,
            bottomSheetBackgroundStyle: presentation.bottomSheetBackgroundStyle,
            bottomSheetHandleIndicatorStyle:
                presentation.bottomSheetHandleIndicatorStyle,
            bottomSheetAnimatedPosition,
            insets: presentation.insets,
            isSystemDarkMode: presentation.isSystemDarkMode,
            mapPreferencesAreLoaded,
            placeSheetTrackingHandlers,
            searchIconColor: presentation.searchIconColor,
            searchPrimaryIconColor: presentation.searchPrimaryIconColor,
        }),
        [
            bottomSheetAnimatedPosition,
            mapPreferencesAreLoaded,
            placeSheetTrackingHandlers,
            presentation.bottomSheetBackgroundStyle,
            presentation.bottomSheetHandleIndicatorStyle,
            presentation.insets,
            presentation.isSystemDarkMode,
            presentation.searchIconColor,
            presentation.searchPrimaryIconColor,
            searchController,
        ],
    );
}

export function useMarkerDetailsContextValue({
    bottomSheetAnimatedPosition,
    handleMarkerDetailsClosePress,
    handleMarkerDetailsRecenterPress,
    locationController,
    mapPreferencesAreLoaded,
    markerDetailsSheetRef,
    markerDetailsSheetTrackingHandlers,
    presentation,
    selectedMarker,
}) {
    return useMemo(
        () => ({
            bottomSheetAnimatedPosition,
            bottomSheetBackgroundStyle: presentation.bottomSheetBackgroundStyle,
            bottomSheetHandleIndicatorStyle:
                presentation.bottomSheetHandleIndicatorStyle,
            currentMapBearing: locationController.currentMapBearing,
            handleMarkerDetailsClosePress,
            handleMarkerDetailsRecenterPress,
            insets: presentation.insets,
            mapPreferencesAreLoaded,
            markerDetailsSheetRef,
            markerDetailsSheetTrackingHandlers,
            searchIconColor: presentation.searchIconColor,
            searchPrimaryIconColor: presentation.searchPrimaryIconColor,
            selectedMarker,
        }),
        [
            bottomSheetAnimatedPosition,
            handleMarkerDetailsClosePress,
            handleMarkerDetailsRecenterPress,
            locationController.currentMapBearing,
            mapPreferencesAreLoaded,
            markerDetailsSheetRef,
            markerDetailsSheetTrackingHandlers,
            presentation.bottomSheetBackgroundStyle,
            presentation.bottomSheetHandleIndicatorStyle,
            presentation.insets,
            presentation.searchIconColor,
            presentation.searchPrimaryIconColor,
            selectedMarker,
        ],
    );
}

export function usePermissionSheetContextValue({
    bottomSheetAnimatedPosition,
    locationController,
    mapPreferencesAreLoaded,
    permissionSheetTrackingHandlers,
    presentation,
    renderBackdrop,
    searchController,
    userLocation,
}) {
    return useMemo(
        () => ({
            bottomSheetBackgroundStyle: presentation.bottomSheetBackgroundStyle,
            bottomSheetHandleIndicatorStyle:
                presentation.bottomSheetHandleIndicatorStyle,
            bottomSheetAnimatedPosition,
            bottomSheetRef: locationController.bottomSheetRef,
            insets: presentation.insets,
            isLocating: locationController.isLocating,
            isRequestingLocation: locationController.isRequestingLocation,
            locationAccessGranted: locationController.locationAccessGranted,
            locationError: locationController.locationError,
            mapPreferencesAreLoaded,
            permissionError: locationController.permissionError,
            permissionSheetTrackingHandlers,
            primaryButtonIndicatorColor:
                presentation.primaryButtonIndicatorColor,
            renderBackdrop,
            requestLocationAccess: locationController.requestLocationAccess,
            retryCurrentLocation: locationController.retryCurrentLocation,
            handleLocationAccessSearchChange:
                searchController.handleLocationAccessSearchChange,
            handleLocationAccessSearchSubmit:
                searchController.handleLocationAccessSearchSubmit,
            localitySearchError: searchController.localitySearchError,
            localitySearchIsLoading: searchController.localitySearchIsLoading,
            locationAccessSearchValue:
                searchController.locationAccessSearchValue,
            userLocation,
        }),
        [
            bottomSheetAnimatedPosition,
            locationController.bottomSheetRef,
            locationController.isLocating,
            locationController.isRequestingLocation,
            locationController.locationAccessGranted,
            locationController.locationError,
            locationController.permissionError,
            locationController.requestLocationAccess,
            locationController.retryCurrentLocation,
            mapPreferencesAreLoaded,
            permissionSheetTrackingHandlers,
            presentation.bottomSheetBackgroundStyle,
            presentation.bottomSheetHandleIndicatorStyle,
            presentation.insets,
            presentation.primaryButtonIndicatorColor,
            renderBackdrop,
            searchController.handleLocationAccessSearchChange,
            searchController.handleLocationAccessSearchSubmit,
            searchController.localitySearchError,
            searchController.localitySearchIsLoading,
            searchController.locationAccessSearchValue,
            userLocation,
        ],
    );
}

export function useAutoPlayMapScreenContextValues({
    controller,
    directionsDebugFeatureCollection,
    directionsRouteFeatureCollection,
    electronicHorizonDebugFeatureCollection,
    directionsWaypointMarkers,
    hideCompassDuringNavigation,
    initialCameraSettings,
    isDrivingMode,
    mapLightPreset,
    mapPreferences,
    markerFeatureCollection,
    navigationPuckRefreshKey,
    policeAlertFeatureCollection,
    policeAlertsVisible,
    preferredFramesPerSecond,
    presentation,
    submittedSearchResults,
    surveillanceMarkersVisible,
    userLocationPuckVisible = true,
}) {
    const canvasValue = useMemo(
        () => ({
            cameraRef: controller.cameraRef,
            directionsDebugFeatureCollection,
            directionsRouteFeatureCollection,
            electronicHorizonDebugFeatureCollection,
            hideCompassDuringNavigation,
            handleCameraChanged: controller.handleCameraChanged,
            handleMapLoaded: controller.handleMapLoaded,
            handleMapPress: noop,
            handleMarkerSourcePress: controller.handleMarkerSourcePress,
            handleSubmittedSearchResultPress: noop,
            initialCameraSettings,
            isDrivingMode,
            isFollowing: controller.isFollowing,
            locationAccessGranted: controller.locationAccessGranted,
            mapboxAttributionPosition: presentation.mapboxAttributionPosition,
            mapboxLogoPosition: presentation.mapboxLogoPosition,
            mapCompassPosition: presentation.mapCompassPosition,
            mapLightPreset,
            mapPreferencesAreLoaded: mapPreferences.mapPreferencesAreLoaded,
            mapStyleURL: mapPreferences.mapStyleURL,
            mapTrafficEnabled: mapPreferences.mapTrafficEnabled,
            surveillanceMarkersVisible:
                surveillanceMarkersVisible ??
                mapPreferences.surveillanceMarkersVisible,
            markerClustersEnabled: mapPreferences.markerClustersEnabled,
            cameraConesVisible: mapPreferences.cameraConesVisible,
            mapViewRef: controller.mapViewRef,
            markerFeatureCollection,
            markerShapeSourceRef: controller.markerShapeSourceRef,
            nativeCameraFollowProps: controller.nativeCameraFollowProps,
            navigationPuckRefreshKey,
            navigationPuckVariant: 'auto-play',
            policeAlertFeatureCollection,
            policeAlertsVisible:
                policeAlertsVisible ?? mapPreferences.policeAlertsVisible,
            preferredFramesPerSecond,
            submittedSearchResults:
                submittedSearchResults ??
                EMPTY_ANDROID_AUTO_SUBMITTED_SEARCH_RESULTS,
            userLocationPuckVisible,
            usesSharedLocationProvider: true,
        }),
        [
            controller.cameraRef,
            controller.handleCameraChanged,
            controller.handleMapLoaded,
            controller.handleMarkerSourcePress,
            controller.isFollowing,
            controller.locationAccessGranted,
            controller.mapViewRef,
            controller.markerShapeSourceRef,
            controller.nativeCameraFollowProps,
            directionsDebugFeatureCollection,
            directionsRouteFeatureCollection,
            electronicHorizonDebugFeatureCollection,
            hideCompassDuringNavigation,
            initialCameraSettings,
            isDrivingMode,
            mapLightPreset,
            mapPreferences.mapPreferencesAreLoaded,
            mapPreferences.mapStyleURL,
            mapPreferences.mapTrafficEnabled,
            mapPreferences.surveillanceMarkersVisible,
            mapPreferences.markerClustersEnabled,
            mapPreferences.cameraConesVisible,
            mapPreferences.policeAlertsVisible,
            markerFeatureCollection,
            navigationPuckRefreshKey,
            policeAlertFeatureCollection,
            policeAlertsVisible,
            preferredFramesPerSecond,
            presentation.mapboxAttributionPosition,
            presentation.mapboxLogoPosition,
            presentation.mapCompassPosition,
            submittedSearchResults,
            surveillanceMarkersVisible,
            userLocationPuckVisible,
        ],
    );
    const locationValue = useMapLocationContextValue(
        mapPreferences.userLocation,
    );
    const placeSheetValue = useMemo(
        () => ({
            directionsWaypointMarkers,
            handleSelectedPlaceMarkerPress: noop,
            selectedPlaceCoordinate: null,
        }),
        [directionsWaypointMarkers],
    );

    return useMemo(
        () => ({
            canvasValue,
            controlsValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
            debugControlsValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
            directionsRouteValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
            layerValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
            locationValue,
            markerDetailsValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
            permissionSheetValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
            placeSheetValue,
            searchResultsValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
            searchValue: EMPTY_MAP_SCREEN_CONTEXT_VALUE,
        }),
        [canvasValue, locationValue, placeSheetValue],
    );
}

export function useMapCanvasContext() {
    return useRequiredContext(MapCanvasContext, 'useMapCanvasContext');
}

export function useMapLocationContext() {
    return useRequiredContext(MapLocationContext, 'useMapLocationContext');
}

export function useMapControlsContext() {
    return useRequiredContext(MapControlsContext, 'useMapControlsContext');
}

export function useMapLayerContext() {
    return useRequiredContext(MapLayerContext, 'useMapLayerContext');
}

export function useMarkerDetailsContext() {
    return useRequiredContext(MarkerDetailsContext, 'useMarkerDetailsContext');
}

export function useMapSearchContext() {
    return useRequiredContext(MapSearchContext, 'useMapSearchContext');
}

export function usePlaceSheetContext() {
    return useRequiredContext(PlaceSheetContext, 'usePlaceSheetContext');
}

export function usePermissionSheetContext() {
    return useRequiredContext(
        PermissionSheetContext,
        'usePermissionSheetContext',
    );
}

export function useDebugControlsContext() {
    return useRequiredContext(DebugControlsContext, 'useDebugControlsContext');
}

export function useDirectionsRouteContext() {
    return useRequiredContext(
        DirectionsRouteContext,
        'useDirectionsRouteContext',
    );
}

export function useSearchResultsContext() {
    return useRequiredContext(SearchResultsContext, 'useSearchResultsContext');
}
