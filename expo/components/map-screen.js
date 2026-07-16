import { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from '../lib/safe-area-insets';
import { Icon } from './design-system/icon';
import { logMapDrivingStarted, logMapDrivingStopped } from './map/analytics';
import { useMapCameraPadding } from './map/camera-focus-padding';
import { SHOW_MAP_DEBUG_CONTROLS } from './map/config';
import {
    DIRECTIONS_ROUTE_SHEET_SNAP_POINTS,
    PLACE_RESULT_CAMERA_ANIMATION_DURATION_MS,
    SEARCH_RESULTS_SHEET_SNAP_POINTS,
} from './map/constants';
import {
    DEBUG_OVERLAY_CAMERA,
    DEBUG_OVERLAY_DIRECTIONS_GEOMETRY,
    DEBUG_OVERLAY_ELECTRONIC_HORIZON,
} from './map/debug-overlays';
import {
    DIRECTIONS_MODE_DIRECTIONS,
    getDirectionsRouteBounds,
    getDirectionsRouteOptionsBounds,
    getSelectedDirectionsRouteOption,
    makeDirectionsDebugFeatureCollection,
    makeDirectionsRouteFeatureCollection,
} from './map/directions';
import { DirectionsRouteSheet } from './map/directions-route-sheet';
import { DrivingGuidanceOverlay } from './map/driving-guidance-overlay';
import { makeElectronicHorizonDebugFeatureCollection } from './map/electronic-horizon-debug';
import { makeMarkerFeatureCollection } from './map/geo';
import { LocationPermissionSheet } from './map/location-permission-sheet';
import { MapCanvas } from './map/map-canvas';
import { MapControlsOverlay } from './map/map-controls-overlay';
import { MapDebugControls } from './map/map-debug-controls';
import { MapFullScreenSearch } from './map/map-full-screen-search';
import { MapLayerSheet } from './map/map-layer-controls';
import {
    MapScreenProviders,
    useDirectionsRouteContextValue,
    useMapCanvasContextValue,
    useMapControlsContextValue,
    useMapDebugControlsContextValue,
    useMapLayerContextValue,
    useMapLocationContextValue,
    useMapSearchContextValue,
    useMarkerDetailsContextValue,
    usePermissionSheetContextValue,
    usePlaceSheetContextValue,
    useSearchResultsContextValue,
} from './map/map-screen-context';
import { MapSearchOverlay } from './map/map-search-overlay';
import { MarkerDetailsSheet } from './map/marker-details-sheet';
import { NativeWindSafeAreaView } from './map/native-components';
import { SelectedPlaceSheet } from './map/selected-place-sheet';
import {
    useSharedMapLocationState,
    useSharedMapState,
} from './map/shared-map-state';
import {
    useDrivingModeLifecycle,
    useStartDrivingAction,
} from './map/use-driving-mode-lifecycle';
import { useMapApiMockControls } from './map/use-map-api-mock-controls';
import {
    useMapBottomSheetTrackingHandlers,
    useMapSearchBottomSheetTrackingHandlers,
} from './map/use-map-bottom-sheet-tracking-handlers';
import { useMapLayerSheetActions } from './map/use-map-layer-sheet-actions';
import { useMapboxStandardLightPreset } from './map/use-map-light-preset';
import { useMapLocationController } from './map/use-map-location-controller';
import {
    useMapMarkerInteractionHandlers,
    useMapMarkerSelectionState,
} from './map/use-map-marker-selection';
import { useMapPresentation } from './map/use-map-presentation';
import { useMapSearch } from './map/use-map-search';
import { makeWazePoliceAlertFeatureCollection } from './map/waze-alerts-api';

const ROUTE_CHOICE_CAMERA_FIT_RETRY_DELAY_MS =
    PLACE_RESULT_CAMERA_ANIMATION_DURATION_MS + 150;

export default function LocationMapScreen({
    initialSearchMode,
    searchOverlayVisible,
    searchSource,
} = {}) {
    const lockOnLocationUpdateAnimationDurationRef = useRef(null);
    const fittedDirectionsRouteChoicesKeyRef = useRef('');
    // Set by every programmatic sheet dismiss so the sheets' onDismiss handlers can
    // distinguish a user drag-to-close from an internal flow transition.
    const placeSheetProgrammaticDismissRef = useRef(false);
    const directionsRouteSheetProgrammaticDismissRef = useRef(false);
    // Latest-value ref for the route sheet's user-close handler, since the route
    // tracking handlers are created before `searchController` exists.
    const directionsRouteUserCloseRef = useRef(null);
    const [drivingLocationAnchorY, setDrivingLocationAnchorY] =
        useState(undefined);
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const bottomSheetAnimatedPosition = useSharedValue(windowHeight);
    const safeAreaInsets = useSafeAreaInsets();
    const screenIsFocused = useIsFocused();
    const {
        debugOverlayVisibility,
        drivingModeIsActive,
        handleMarkerLoadingIndicatorHidden,
        initialCameraSettings,
        mapLightPresetPreference,
        mapPreferencesAreLoaded,
        mapStyleURL,
        mapTrafficEnabled,
        surveillanceMarkersVisible,
        markerClustersEnabled,
        cameraConesVisible,
        electronicHorizon,
        preferPrivateRoutes,
        policeAlerts,
        policeAlertsVisible,
        directionsRoute,
        markerLoadError,
        markerLoadingIndicatorIsVisible,
        markerPoints,
        localityBoundary,
        pendingDirectionsRequest,
        pendingSearchResultRestore,
        renderMarkerLoadingIndicator,
        scheduleMarkerLoad: scheduleSharedMarkerLoad,
        setDirectionsRoute,
        setDrivingModeIsActive,
        setDebugOverlayVisibility,
        setMapLightPresetPreference,
        setMapStyleURL,
        setMapTrafficEnabled,
        setSurveillanceMarkersVisible,
        setMarkerClustersEnabled,
        setCameraConesVisible,
        setPreferPrivateRoutes,
        setPoliceAlertsVisible,
        setLocalityBoundary,
        setPendingDirectionsRequest,
        setPendingSearchResultRestore,
    } = useSharedMapState();
    const { setUserLocation, userLocation } = useSharedMapLocationState();
    const isDrivingMode = drivingModeIsActive;

    useEffect(() => {
        if (!isDrivingMode) {
            setDrivingLocationAnchorY(undefined);
        }
    }, [isDrivingMode]);

    const cameraDebugStateUpdatesEnabled =
        SHOW_MAP_DEBUG_CONTROLS &&
        debugOverlayVisibility?.[DEBUG_OVERLAY_CAMERA] === true;
    const mapLightPreset = useMapboxStandardLightPreset(
        mapLightPresetPreference,
        userLocation,
    );
    const {
        markerDetailsIsOpenRef,
        markerDetailsSheetRef,
        markerTapTimestampRef,
        pendingMarkerSelectionRef,
        selectedMarker,
        selectedMarkerId,
        setSelectedMarker,
    } = useMapMarkerSelectionState({ markerPoints });
    const {
        activeDirectionsRouteSheetCoverageRatio,
        directionsRouteSheetTrackingHandlers,
        markerDetailsSheetTrackingHandlers,
        permissionSheetTrackingHandlers,
    } = useMapBottomSheetTrackingHandlers({
        bottomSheetAnimatedPosition,
        directionsRouteSheetProgrammaticDismissRef,
        directionsRouteUserCloseRef,
        markerDetailsIsOpenRef,
        pendingMarkerSelectionRef,
        setSelectedMarker,
        windowHeight,
    });
    const {
        cameraFocusPadding,
        directionsRouteCameraPadding,
        searchResultsCameraPadding,
        sideSheetLayoutIsActive,
    } = useMapCameraPadding({
        activeDirectionsRouteSheetCoverageRatio,
        safeAreaInsets,
        windowHeight,
        windowWidth,
    });
    const locationController = useMapLocationController({
        cameraFocusPadding,
        cameraDebugStateUpdatesEnabled,
        drivingCameraFollowViewportAnchorY: drivingLocationAnchorY,
        initialCameraSettings,
        isDrivingMode,
        lockOnLocationUpdateAnimationDurationRef,
        mapBearingUpdatesEnabled: Boolean(selectedMarker),
        mapPreferencesAreLoaded,
        markersAreVisible: surveillanceMarkersVisible,
        scheduleSharedMarkerLoad,
        screenIsFocused,
        setUserLocation,
        userLocation,
    });
    const { e2eMapApiMocksAreRequested } = useMapApiMockControls({
        locationController,
    });
    const searchController = useMapSearch({
        directionsDebugGeometryIsEnabled:
            debugOverlayVisibility?.[DEBUG_OVERLAY_DIRECTIONS_GEOMETRY] ===
            true,
        directionsRouteCameraPadding,
        directionsRoute,
        directionsRouteSheetProgrammaticDismissRef,
        fitCameraToBounds: locationController.fitCameraToBounds,
        initialSearchMode,
        isMountedRef: locationController.isMountedRef,
        moveCameraToPlace: locationController.moveCameraToPlace,
        pendingDirectionsRequest,
        pendingSearchResultRestore,
        placeSheetProgrammaticDismissRef,
        searchResultRestoreEnabled: !isDrivingMode,
        searchResultsCameraPadding,
        searchSource,
        setDirectionsRoute,
        setLocalityBoundary,
        setPendingDirectionsRequest,
        setPendingSearchResultRestore,
        userLocation,
    });
    // Point the route sheet's user-close ref at the back-arrow teardown now that
    // `searchController` exists (the route tracking handlers were created earlier).
    directionsRouteUserCloseRef.current =
        searchController.handleDirectionsModeDismiss;
    const {
        placeSheetTrackingHandlers,
        submittedSearchResultsSheetTrackingHandlers,
    } = useMapSearchBottomSheetTrackingHandlers({
        bottomSheetAnimatedPosition,
        handleClearSelectedSearchResult:
            searchController.handleClearSelectedSearchResult,
        handlePlaceSheetDismiss: searchController.handlePlaceSheetDismiss,
        handleSubmittedSearchResultsSheetDismiss:
            searchController.handleSubmittedSearchResultsSheetDismiss,
        placeSheetProgrammaticDismissRef,
        windowHeight,
    });
    const {
        handleMapPress,
        handleMarkerDetailsRecenterPress,
        handleMarkerSourcePress,
    } = useMapMarkerInteractionHandlers({
        locationController,
        markerDetailsIsOpenRef,
        markerDetailsSheetRef,
        markerPoints,
        markerTapTimestampRef,
        pendingMarkerSelectionRef,
        searchController,
        selectedMarker,
        selectedMarkerId,
        setSelectedMarker,
    });
    const selectedDirectionsRouteOption = useMemo(
        () => getSelectedDirectionsRouteOption(directionsRoute),
        [directionsRoute],
    );
    const freeDriveIsActive = isDrivingMode && !selectedDirectionsRouteOption;
    const mapSearchOverlayIsVisible =
        searchOverlayVisible ?? (!isDrivingMode || freeDriveIsActive);
    const directionsFormIsActive =
        searchController.searchMode === DIRECTIONS_MODE_DIRECTIONS;
    const routeComparisonIsActive = Boolean(
        !isDrivingMode && directionsRoute && selectedDirectionsRouteOption,
    );
    const directionsModeIsActive =
        directionsFormIsActive || routeComparisonIsActive;
    const markerDetailsModeIsActive = Boolean(!isDrivingMode && selectedMarker);
    const placeDetailsModeIsActive = Boolean(
        !isDrivingMode &&
        !directionsModeIsActive &&
        searchController.selectedSearchResult,
    );
    const mapChromeIsVisible =
        !markerDetailsModeIsActive &&
        !placeDetailsModeIsActive &&
        !directionsFormIsActive &&
        !routeComparisonIsActive;
    const resolvedMapSearchOverlayIsVisible =
        mapSearchOverlayIsVisible &&
        !markerDetailsModeIsActive &&
        !placeDetailsModeIsActive &&
        !routeComparisonIsActive;
    const freeDriveSearchOverlayIsVisible =
        freeDriveIsActive && resolvedMapSearchOverlayIsVisible;

    useEffect(() => {
        if (surveillanceMarkersVisible || !selectedMarker) {
            return;
        }

        markerDetailsSheetRef.current?.dismiss();
        setSelectedMarker(null);
    }, [
        markerDetailsSheetRef,
        selectedMarker,
        setSelectedMarker,
        surveillanceMarkersVisible,
    ]);
    useEffect(() => {
        if (!routeComparisonIsActive) {
            fittedDirectionsRouteChoicesKeyRef.current = '';
            return;
        }

        if (!locationController.isMapReady) {
            return;
        }

        const bounds =
            getDirectionsRouteOptionsBounds(directionsRoute) ??
            directionsRoute?.bounds ??
            getDirectionsRouteBounds(directionsRoute);

        if (!Array.isArray(bounds?.sw) || !Array.isArray(bounds?.ne)) {
            return;
        }

        const routeChoicesFitKey = [
            bounds.sw.join(','),
            bounds.ne.join(','),
            directionsRouteCameraPadding.join(','),
        ].join('|');

        if (
            routeChoicesFitKey &&
            fittedDirectionsRouteChoicesKeyRef.current === routeChoicesFitKey
        ) {
            return;
        }

        const fitRouteChoicesToBounds = () =>
            locationController.fitCameraToBounds(bounds, {
                padding: directionsRouteCameraPadding,
            });

        if (!fitRouteChoicesToBounds()) {
            return;
        }

        fittedDirectionsRouteChoicesKeyRef.current = routeChoicesFitKey;

        const frame = requestAnimationFrame(fitRouteChoicesToBounds);
        const retry = setTimeout(
            fitRouteChoicesToBounds,
            ROUTE_CHOICE_CAMERA_FIT_RETRY_DELAY_MS,
        );

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(retry);
        };
    }, [
        directionsRoute,
        directionsRouteCameraPadding,
        locationController.fitCameraToBounds,
        locationController.isMapReady,
        routeComparisonIsActive,
    ]);
    const handleMarkerDetailsClosePress = useCallback(() => {
        markerDetailsSheetRef.current?.dismiss();
        setSelectedMarker(null);
    }, [markerDetailsSheetRef, setSelectedMarker]);
    useDrivingModeLifecycle({
        directionsRoute,
        isDrivingMode,
        lockOnLocationUpdateAnimationDurationRef,
        pendingDirectionsRequest,
        screenIsFocused,
        searchController,
    });
    const presentation = useMapPresentation({
        hasActiveDirectionsRoute: Boolean(selectedDirectionsRouteOption),
        isDrivingMode,
        locationTrackingMode: locationController.locationTrackingMode,
        mapLightPreset,
        mapStyleURL,
        searchSource,
        voiceSearchIsListening: searchController.voiceSearchIsListening,
    });
    const {
        handleMapLayerPress,
        handleMapLayerSelect,
        handleMapLayerSheetDismiss,
        handleMapLightPresetPreferenceChange,
        handleMapTrafficEnabledChange,
        handlePoliceAlertsVisibleChange,
        layerSheetRef,
        layerSheetResetCount,
    } = useMapLayerSheetActions({
        setMapLightPresetPreference,
        setMapStyleURL,
        setMapTrafficEnabled,
        setPoliceAlertsVisible,
    });
    const markerFeatureCollection = useMemo(
        () => makeMarkerFeatureCollection(markerPoints),
        [markerPoints],
    );
    const policeAlertFeatureCollection = useMemo(
        () => makeWazePoliceAlertFeatureCollection(policeAlerts),
        [policeAlerts],
    );
    const directionsRouteFeatureCollection = useMemo(
        () => makeDirectionsRouteFeatureCollection(directionsRoute),
        [directionsRoute],
    );
    const directionsDebugFeatureCollection = useMemo(
        () =>
            makeDirectionsDebugFeatureCollection(
                directionsRoute,
                debugOverlayVisibility?.[DEBUG_OVERLAY_DIRECTIONS_GEOMETRY] ===
                    true,
            ),
        [debugOverlayVisibility, directionsRoute],
    );
    const electronicHorizonDebugFeatureCollection = useMemo(
        () =>
            makeElectronicHorizonDebugFeatureCollection(
                electronicHorizon,
                debugOverlayVisibility?.[DEBUG_OVERLAY_ELECTRONIC_HORIZON] ===
                    true,
            ),
        [debugOverlayVisibility, electronicHorizon],
    );
    const renderBackdrop = useCallback(
        (props) => (
            <BottomSheetBackdrop
                {...props}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                opacity={0.45}
            />
        ),
        [],
    );
    const handleStartDriving = useStartDrivingAction({
        directionsRoute,
        layerSheetRef,
        searchController,
        selectedDirectionsRouteOption,
        setDrivingModeIsActive,
    });
    const handleStartFreeDrive = useCallback(() => {
        layerSheetRef.current?.dismiss();
        logMapDrivingStarted({ route: null });
        setDrivingModeIsActive(true);
    }, [layerSheetRef, setDrivingModeIsActive]);
    const handleStopFreeDrive = useCallback(() => {
        logMapDrivingStopped({ route: null });
        setDrivingModeIsActive(false);
    }, [setDrivingModeIsActive]);
    const canvasValue = useMapCanvasContextValue({
        directionsDebugFeatureCollection,
        directionsRouteFeatureCollection,
        electronicHorizonDebugFeatureCollection,
        e2eMapApiMocksEnabled: e2eMapApiMocksAreRequested,
        handleMapPress,
        handleMarkerSourcePress,
        initialCameraSettings: locationController.remountCameraSettings,
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
    });
    const locationValue = useMapLocationContextValue(userLocation);
    const controlsValue = useMapControlsContextValue({
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
    });
    const debugControlsValue = useMapDebugControlsContextValue({
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
    });
    const directionsRouteValue = useDirectionsRouteContextValue({
        bottomSheetAnimatedPosition,
        directionsRoute,
        directionsRouteSheetSnapPoints: DIRECTIONS_ROUTE_SHEET_SNAP_POINTS,
        directionsRouteSheetTrackingHandlers,
        handleStartDriving,
        mapPreferencesAreLoaded,
        presentation,
        searchController,
    });
    const layerValue = useMapLayerContextValue({
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
    });
    const searchValue = useMapSearchContextValue({
        mapPreferencesAreLoaded,
        presentation,
        searchController,
    });
    const searchResultsValue = useSearchResultsContextValue({
        bottomSheetAnimatedPosition,
        mapPreferencesAreLoaded,
        presentation,
        searchController,
        submittedSearchResultsSheetSnapPoints: SEARCH_RESULTS_SHEET_SNAP_POINTS,
        submittedSearchResultsSheetTrackingHandlers,
    });
    const placeSheetValue = usePlaceSheetContextValue({
        bottomSheetAnimatedPosition,
        mapPreferencesAreLoaded,
        placeSheetTrackingHandlers,
        presentation,
        searchController,
    });
    const markerDetailsValue = useMarkerDetailsContextValue({
        bottomSheetAnimatedPosition,
        handleMarkerDetailsClosePress,
        handleMarkerDetailsRecenterPress,
        locationController,
        mapPreferencesAreLoaded,
        markerDetailsSheetRef,
        markerDetailsSheetTrackingHandlers,
        presentation,
        selectedMarker,
    });
    const permissionSheetValue = usePermissionSheetContextValue({
        bottomSheetAnimatedPosition,
        locationController,
        mapPreferencesAreLoaded,
        permissionSheetTrackingHandlers,
        presentation,
        renderBackdrop,
        searchController,
        userLocation,
    });

    return (
        <MapScreenProviders
            canvasValue={canvasValue}
            controlsValue={controlsValue}
            debugControlsValue={debugControlsValue}
            directionsRouteValue={directionsRouteValue}
            layerValue={layerValue}
            locationValue={locationValue}
            markerDetailsValue={markerDetailsValue}
            permissionSheetValue={permissionSheetValue}
            placeSheetValue={placeSheetValue}
            searchResultsValue={searchResultsValue}
            searchValue={searchValue}
        >
            <View className="flex-1 bg-white dark:bg-neutral-950">
                {screenIsFocused ? (
                    <>
                        <MapCanvas />
                        {isDrivingMode ? (
                            <DrivingGuidanceOverlay
                                onLocationAnchorLayout={
                                    setDrivingLocationAnchorY
                                }
                                topOverlay={
                                    freeDriveSearchOverlayIsVisible ? (
                                        <MapSearchOverlay
                                            showDestinationCategories={false}
                                        />
                                    ) : null
                                }
                            >
                                <MapControlsOverlay
                                    showFreeDriveButton={freeDriveIsActive}
                                />
                            </DrivingGuidanceOverlay>
                        ) : (
                            <NativeWindSafeAreaView
                                className="absolute inset-0 z-40 px-3 pt-3"
                                edges={['top', 'right', 'left']}
                                pointerEvents="box-none"
                            >
                                {resolvedMapSearchOverlayIsVisible ? (
                                    <MapSearchOverlay
                                        mapControls={
                                            mapChromeIsVisible ? (
                                                <MapControlsOverlay />
                                            ) : null
                                        }
                                    />
                                ) : null}
                                {routeComparisonIsActive ? (
                                    <Pressable
                                        accessibilityLabel="Back from route choices"
                                        accessibilityRole="button"
                                        className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/90 h-11 w-11 items-center justify-center rounded-dafPill border border-daf-border-glass bg-white/90 shadow-[0px_4px_18px_rgba(11,14,18,0.16)] active:opacity-[0.82]"
                                        onPress={
                                            searchController.handleDirectionsModeDismiss
                                        }
                                        testID="directions-route-back-button"
                                    >
                                        {/* Nudge the chevron left so it reads as optically centered in the pill. */}
                                        <View className="-translate-x-px">
                                            <Icon
                                                color={
                                                    presentation.searchPrimaryIconColor
                                                }
                                                name="chevron-left"
                                                size={22}
                                            />
                                        </View>
                                    </Pressable>
                                ) : null}
                                {markerDetailsModeIsActive ? (
                                    <View className="items-end">
                                        <Pressable
                                            accessibilityLabel="Close marker details"
                                            accessibilityRole="button"
                                            className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/90 h-11 w-11 items-center justify-center rounded-dafPill border border-daf-border-glass bg-white/90 shadow-[0px_4px_18px_rgba(11,14,18,0.16)] active:opacity-[0.82]"
                                            onPress={
                                                handleMarkerDetailsClosePress
                                            }
                                            testID="marker-details-close-button"
                                        >
                                            <Icon
                                                color={
                                                    presentation.searchPrimaryIconColor
                                                }
                                                name="x"
                                                size={21}
                                            />
                                        </Pressable>
                                    </View>
                                ) : null}
                                {placeDetailsModeIsActive ? (
                                    <View className="items-end">
                                        <Pressable
                                            accessibilityLabel="Close place details"
                                            accessibilityRole="button"
                                            className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/90 h-11 w-11 items-center justify-center rounded-dafPill border border-daf-border-glass bg-white/90 shadow-[0px_4px_18px_rgba(11,14,18,0.16)] active:opacity-[0.82]"
                                            onPress={
                                                searchController.handleClearSelectedSearchResult
                                            }
                                            testID="place-details-close-button"
                                        >
                                            <Icon
                                                color={
                                                    presentation.searchPrimaryIconColor
                                                }
                                                name="x"
                                                size={21}
                                            />
                                        </Pressable>
                                    </View>
                                ) : null}
                            </NativeWindSafeAreaView>
                        )}
                        <MapFullScreenSearch />
                        {mapChromeIsVisible ? <MapDebugControls /> : null}
                    </>
                ) : null}
                <MarkerDetailsSheet />
                <SelectedPlaceSheet />
                {!isDrivingMode ? <DirectionsRouteSheet /> : null}
                <MapLayerSheet />
                <LocationPermissionSheet />
            </View>
        </MapScreenProviders>
    );
}
