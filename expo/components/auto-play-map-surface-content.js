import * as Location from 'expo-location';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Dimensions, View } from 'react-native';
import { getAutoPlayAlertSurfaceVisibility } from './auto-play-alert-surface-visibility';
import {
    autoPlayCameraDebugStateUpdatesAreEnabled,
    AutoPlayDebugOverlays,
} from './auto-play-debug-overlays';
import {
    addAutoDriveSimulationLocationListener,
    useAutoDriveSimulationIsActive,
} from './auto-play-drive-simulation';
import { registerAutoPlayMapControlHandlers } from './auto-play-map-control-handlers';
import {
    AutoPlayMapStatusOverlay,
    AutoPlayTopRightStatusOverlay,
} from './auto-play-map-status-overlay';
import { resolveAutoPlayMapLightPresetPreference } from './auto-play-map-theme';
import {
    getAutoPlayBoundsFitPadding,
    getAutoPlayViewportMetrics,
} from './auto-play-map-viewport';
import { setAutoPlayState, useAutoPlayState } from './auto-play-state';
import {
    getAutoPlayDrivingStatusVisibility,
    getAutoPlayMapContentVisibility,
    getAutoPlayNavigationPuckRefreshKey,
    getAutoPlayRoutePreviewFitKey,
    getAutoPlaySearchResultsFitKey,
    getAutoPlaySearchResultsMapIsActive,
} from './auto-play-template-state';
import { useFollowLocationMode } from './map-follow-location-mode';
import {
    EMPTY_CAMERA_PADDING,
    getCameraPadding,
    getLocationCoordinate,
    LOCATION_CAMERA_ANIMATION_DURATION_MS,
    LOCATION_CAMERA_USER_ANIMATION_DURATION_MS,
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
    LOCATION_TRACKING_FOLLOW,
    LOCATION_TRACKING_NONE,
    LOCATION_ZOOM_LEVEL,
    mergeCameraPadding,
} from './map-location-mode-shared';
import { useLockOnLocationMode } from './map-lock-on-location-mode';
import { useMockWazePoliceAlertsEnabled } from './map/api-mocks';
import { getBoundsFitCameraStop } from './map/camera-state';
import { SHOW_MAP_DEBUG_CONTROLS } from './map/config';
import { DEFAULT_ZOOM_LEVEL, ZOOM_STEP } from './map/constants';
import {
    DEBUG_OVERLAY_DIRECTIONS_GEOMETRY,
    DEBUG_OVERLAY_ELECTRONIC_HORIZON,
} from './map/debug-overlays';
import {
    DIRECTIONS_FIELD_DESTINATION,
    DIRECTIONS_FIELD_START,
    getDirectionsRouteBounds,
    getDirectionsRouteOptionsBounds,
    getDirectionsWaypointCoordinate,
    makeDirectionsDebugFeatureCollection,
    makeDirectionsRouteFeatureCollection,
} from './map/directions';
import { getLocationWithDrivingMotionState } from './map/driving-location-state';
import {
    DRIVING_MAP_VIEW_PERSPECTIVE,
    DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
    getDrivingMapViewFollowConfiguration,
    getNextDrivingMapViewMode,
    shouldRestoreDrivingPerspective,
    shouldShowDrivingMapStatus,
} from './map/driving-map-view';
import { getDrivingMotionState } from './map/driving-motion-state';
import { makeElectronicHorizonDebugFeatureCollection } from './map/electronic-horizon-debug';
import {
    clampZoomLevel,
    getBoundsFromCameraState,
    getLocationCourseHeading,
    getLocationUpdate,
    getSmoothedCourseHeading,
    getStoredNumber,
    hasPreciseLocation,
    makeMarkerFeatureCollection,
    normalizeDirectionDegrees,
} from './map/geo';
import {
    locationUpdateIsStale,
    shouldAcceptLocationUpdate,
} from './map/location-watch-options';
import { MapCanvas } from './map/map-canvas';
import { mapLightPresetUsesDarkAppearance } from './map/map-light-preset-appearance';
import {
    MapScreenProviders,
    useAutoPlayMapScreenContextValues,
} from './map/map-screen-context';
import { resolveMarkerLoadBounds } from './map/marker-load-bounds';
import { getNavigationPuckSize } from './map/navigation-puck-layout';
import { getSubmittedSearchResultsBounds } from './map/submitted-search-results-bounds';
import { useDeferredCameraDebugState } from './map/use-deferred-camera-debug-state';
import {
    roadMatchingLocationIsSupported,
    useCurrentLocation,
    useHeadingWatch,
    useLocationWatch,
    useRoadMatchedLocationWatch,
} from './map/use-device-location';
import { useElectronicHorizon } from './map/use-electronic-horizon';
import { useMapboxStandardLightPreset } from './map/use-map-light-preset';
import { useMapPreferencesState } from './map/use-map-preferences-state';
import { useMapPresentation } from './map/use-map-presentation';
import { useMarkerLoader } from './map/use-marker-loader';
import { useUpcomingElectronicHorizonAlerts } from './map/use-upcoming-electronic-horizon-alerts';
import { useWazePoliceAlerts } from './map/use-waze-police-alerts';
import { makeWazePoliceAlertFeatureCollection } from './map/waze-alerts-api';

const CAMERA_DEBUG_CENTER_PRECISION = 6;
const CAMERA_DEBUG_ORIENTATION_PRECISION = 2;
const CAMERA_DEBUG_ZOOM_PRECISION = 2;
const ZOOM_LEVEL_STATE_UPDATE_EPSILON = 0.01;
const AUTO_PLAY_CAMERA_INTERACTION_ANIMATION_MODE = 'easeTo';
const AUTO_PLAY_ZOOM_ANIMATION_DURATION_MS =
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS;
const AUTO_PLAY_ZOOM_BUTTON_ANIMATION_DURATION_MS =
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS;
const AUTO_PLAY_ROUTE_PREVIEW_CAMERA_FIT_DURATION_MS = 900;
const AUTO_PLAY_ROOT_MODULE_ID = 'AutoPlayRoot';
const DEFAULT_AUTO_PLAY_SURFACE_PLATFORM_CONFIG = {
    applyWindowScaleToMapGestures: false,
    currentRoadPill: null,
    ornamentSafeAreaLeftScale: 1,
    showDrivingStatusOnSecondarySurfaces: false,
    showSpeedLimitOnSecondarySurfaces: true,
    speedLimitBadge: null,
    usesHostColorSchemeForAutomaticMapPreset: false,
};

const DEFAULT_AUTOPLAY_MAP_BUTTON_APPEARANCE = {
    drivingMapViewMode: DRIVING_MAP_VIEW_PERSPECTIVE,
    isDarkMapLayer: false,
    mapLightPreset: null,
    trackingState: 'inactive',
};
const DEFAULT_AUTO_PLAY_COLOR_SCHEME = 'light';
const EMPTY_AUTO_PLAY_SUBMITTED_SEARCH_RESULTS = Object.freeze([]);

let autoPlayMapButtonAppearanceListener = () => {};
let autoPlayMapColorScheme = DEFAULT_AUTO_PLAY_COLOR_SCHEME;
const autoPlayMapColorSchemeListeners = new Set();

function logAutoPlayMapSurfaceAction(action) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[Auto Play] ${action}`);
    }
}

export { getAutoPlayMapControlHandlers } from './auto-play-map-control-handlers';

export function setAutoPlayMapButtonAppearanceListener(listener) {
    autoPlayMapButtonAppearanceListener =
        typeof listener === 'function' ? listener : () => {};

    return () => {
        if (autoPlayMapButtonAppearanceListener === listener) {
            autoPlayMapButtonAppearanceListener = () => {};
        }
    };
}

function normalizeAutoPlayColorScheme(colorScheme) {
    return colorScheme === 'dark' ? 'dark' : DEFAULT_AUTO_PLAY_COLOR_SCHEME;
}

export function setAutoPlayMapColorScheme(colorScheme) {
    const nextColorScheme = normalizeAutoPlayColorScheme(colorScheme);

    if (autoPlayMapColorScheme === nextColorScheme) {
        return;
    }

    autoPlayMapColorScheme = nextColorScheme;
    autoPlayMapColorSchemeListeners.forEach((listener) => {
        listener(nextColorScheme);
    });
}

function useAutoPlayColorScheme(initialColorScheme) {
    const normalizedInitialColorScheme =
        normalizeAutoPlayColorScheme(initialColorScheme);
    const [colorScheme, setColorScheme] = useState(
        normalizedInitialColorScheme,
    );

    useEffect(() => {
        setAutoPlayMapColorScheme(normalizedInitialColorScheme);
    }, [normalizedInitialColorScheme]);

    useEffect(() => {
        autoPlayMapColorSchemeListeners.add(setColorScheme);

        return () => {
            autoPlayMapColorSchemeListeners.delete(setColorScheme);
        };
    }, []);

    return colorScheme;
}

function notifyAutoPlayMapButtonAppearance(appearance) {
    autoPlayMapButtonAppearanceListener({
        ...DEFAULT_AUTOPLAY_MAP_BUTTON_APPEARANCE,
        ...appearance,
    });
}

function getFlatCameraStop(cameraStop, padding = EMPTY_CAMERA_PADDING) {
    const cameraPadding =
        cameraStop?.padding !== undefined ? cameraStop.padding : padding;

    return {
        ...cameraStop,
        padding: getCameraPadding(cameraPadding),
        pitch: 0,
    };
}

function getPositiveDimension(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function getPositiveScale(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0
        ? numericValue
        : null;
}

// @rnmapbox/maps applies the primary screen's scale factor to camera
// moveBy/scaleBy coordinates, while the car host reports gestures in the car
// screen's density-independent points. The react-native-auto-play README
// suggests applying RootComponentInitialProps.window.scale (or the primary
// window scale as a fallback) to the coordinates to keep gestures 1:1.
function getMapGestureCoordinateScale({
    applyWindowScaleToMapGestures,
    windowInfo,
}) {
    if (!applyWindowScaleToMapGestures) {
        return 1;
    }

    return (
        getPositiveScale(windowInfo?.scale) ??
        getPositiveScale(Dimensions.get('window')?.scale) ??
        1
    );
}

function getResolvedViewportPoint(point, viewportMetrics) {
    const fallbackCenter = viewportMetrics?.center ?? { x: 0, y: 0 };
    const coordinate = getPointCoordinate(point ?? fallbackCenter);
    const visibleRect = viewportMetrics?.visibleRect;

    if (!visibleRect) {
        return coordinate;
    }

    const visibleWidth = viewportMetrics.visibleWidth;
    const visibleHeight = viewportMetrics.visibleHeight;
    const pointIsInsideVisibleRect =
        coordinate.x >= visibleRect.left &&
        coordinate.x <= visibleRect.right &&
        coordinate.y >= visibleRect.top &&
        coordinate.y <= visibleRect.bottom;

    if (pointIsInsideVisibleRect) {
        return coordinate;
    }

    const pointLooksRelativeToVisibleViewport =
        coordinate.x >= 0 &&
        coordinate.x <= visibleWidth &&
        coordinate.y >= 0 &&
        coordinate.y <= visibleHeight;

    if (pointLooksRelativeToVisibleViewport) {
        return {
            x: visibleRect.left + coordinate.x,
            y: visibleRect.top + coordinate.y,
        };
    }

    return {
        x: Math.min(
            Math.max(coordinate.x, visibleRect.left),
            visibleRect.right,
        ),
        y: Math.min(
            Math.max(coordinate.y, visibleRect.top),
            visibleRect.bottom,
        ),
    };
}

function getRoundedCameraValue(value, precision) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? Number(numericValue.toFixed(precision))
        : null;
}

function getCameraDebugState(state) {
    const center = state?.properties?.center;
    const longitude = getRoundedCameraValue(
        center?.[0],
        CAMERA_DEBUG_CENTER_PRECISION,
    );
    const latitude = getRoundedCameraValue(
        center?.[1],
        CAMERA_DEBUG_CENTER_PRECISION,
    );
    const zoomLevel = getRoundedCameraValue(
        state?.properties?.zoom,
        CAMERA_DEBUG_ZOOM_PRECISION,
    );
    const heading = getRoundedCameraValue(
        state?.properties?.heading ?? state?.properties?.bearing,
        CAMERA_DEBUG_ORIENTATION_PRECISION,
    );
    const pitch = getRoundedCameraValue(
        state?.properties?.pitch,
        CAMERA_DEBUG_ORIENTATION_PRECISION,
    );

    if (
        longitude === null &&
        latitude === null &&
        zoomLevel === null &&
        heading === null &&
        pitch === null
    ) {
        return null;
    }

    return {
        heading: heading === null ? null : normalizeDirectionDegrees(heading),
        latitude,
        longitude,
        pitch,
        zoomLevel,
    };
}

function getCameraDebugStateKey(cameraState) {
    return [
        cameraState?.longitude,
        cameraState?.latitude,
        cameraState?.zoomLevel,
        cameraState?.heading,
        cameraState?.pitch,
    ].join(',');
}

function createDirectionsWaypointMarker(role, waypoint) {
    const coordinate = getDirectionsWaypointCoordinate(waypoint);

    if (!coordinate) {
        return null;
    }

    const fallbackTitle =
        role === DIRECTIONS_FIELD_START ? 'Start' : 'Destination';
    const waypointId =
        waypoint?.id ??
        waypoint?.placeId ??
        waypoint?.label ??
        waypoint?.inputValue ??
        coordinate.join(',');

    return {
        coordinate,
        id: `${role}:${waypointId}`,
        role,
        subtitle: waypoint?.subtitle || '',
        title: waypoint?.label || waypoint?.inputValue || fallbackTitle,
    };
}

function makeAutoPlayDirectionsWaypointMarkers(route) {
    if (!route) {
        return [];
    }

    return [
        createDirectionsWaypointMarker(DIRECTIONS_FIELD_START, route.start),
        createDirectionsWaypointMarker(
            DIRECTIONS_FIELD_DESTINATION,
            route.destination,
        ),
    ].filter(Boolean);
}

function getPointCoordinate(point) {
    const x = Number(point?.x);
    const y = Number(point?.y);

    return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
    };
}

function useAutoPlayMapController({
    cameraDebugStateUpdatesEnabled = false,
    drivingMapViewMode = DRIVING_MAP_VIEW_PERSPECTIVE,
    initialCameraSettings,
    isDrivingMode,
    locationUpdatesEnabled = true,
    mapGestureCoordinateScale = 1,
    mapBrowsingContextIsActive = false,
    mapPreferencesAreLoaded,
    markersAreVisible = true,
    scheduleSharedMarkerLoad,
    setUserLocation,
    userLocation,
    followViewportAnchorY,
    viewportMetrics,
}) {
    const cameraRef = useRef(null);
    const currentCompassHeadingRef = useRef(null);
    const currentCourseHeadingRef = useRef(null);
    const currentZoomRef = useRef(DEFAULT_ZOOM_LEVEL);
    const isMapReadyRef = useRef(false);
    const isMountedRef = useRef(false);
    const isDrivingModeRef = useRef(isDrivingMode);
    const locationAccessHydrationHasRunRef = useRef(false);
    const locationUpdatesEnabledRef = useRef(locationUpdatesEnabled);
    const locationTrackingModeRef = useRef(LOCATION_TRACKING_NONE);
    const latestMapBoundsRef = useRef(null);
    const markerLoadsEnabledRef = useRef(false);
    const markerShapeSourceRef = useRef(null);
    const mapViewRef = useRef(null);
    const locationPuckCameraFollowReleaseRef = useRef(async () => false);
    const mapBrowsingContextIsActiveRef = useRef(mapBrowsingContextIsActive);
    const manualMapGestureGenerationRef = useRef(0);
    const followAutoStartIsSuppressedRef = useRef(false);
    const pendingCameraStopRef = useRef(null);
    const previousDrivingModeRef = useRef(isDrivingMode);
    const previousMarkersAreVisibleRef = useRef(markersAreVisible);
    const roadMatchedLocationWatchEnabledRef = useRef(false);
    const userLocationRef = useRef(null);
    const viewportMetricsRef = useRef(viewportMetrics);
    const { currentCameraDebugState, setPendingCameraDebugState } =
        useDeferredCameraDebugState(cameraDebugStateUpdatesEnabled);
    const [isMapReady, setIsMapReady] = useState(false);
    const [locationAccessGranted, setLocationAccessGranted] = useState(false);
    const [locationTrackingMode, setLocationTrackingMode] = useState(
        LOCATION_TRACKING_NONE,
    );

    mapBrowsingContextIsActiveRef.current = mapBrowsingContextIsActive;
    isDrivingModeRef.current = isDrivingMode;
    locationUpdatesEnabledRef.current = locationUpdatesEnabled;
    const { findCurrentLocation, isLocating, locationError, setLocationError } =
        useCurrentLocation({
            currentCourseHeadingRef,
            isMountedRef,
            roadMatchedLocationWatchEnabledRef,
            setUserLocation,
        });

    useEffect(() => {
        locationTrackingModeRef.current = locationTrackingMode;
    }, [locationTrackingMode]);

    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);

    useEffect(() => {
        viewportMetricsRef.current = viewportMetrics;
    }, [viewportMetrics]);

    const getViewportCameraPadding = useCallback(
        () => viewportMetricsRef.current?.cameraPadding ?? EMPTY_CAMERA_PADDING,
        [],
    );

    const setTrackingMode = useCallback((nextMode) => {
        locationTrackingModeRef.current = nextMode;
        setLocationTrackingMode(nextMode);
    }, []);

    const moveCameraToUser = useCallback(
        (location, options = {}) => {
            const nextZoomLevel = clampZoomLevel(
                Math.max(currentZoomRef.current, LOCATION_ZOOM_LEVEL),
            );
            const isUserInitiated = options.isUserInitiated === true;
            const cameraStop = {
                centerCoordinate: getLocationCoordinate(location),
                zoomLevel: nextZoomLevel,
                animationDuration: isUserInitiated
                    ? LOCATION_CAMERA_USER_ANIMATION_DURATION_MS
                    : LOCATION_CAMERA_ANIMATION_DURATION_MS,
                animationMode: 'easeTo',
            };

            currentZoomRef.current = nextZoomLevel;

            if (isMapReadyRef.current && cameraRef.current) {
                markerLoadsEnabledRef.current = true;
                cameraRef.current.setCamera(
                    getFlatCameraStop(cameraStop, getViewportCameraPadding()),
                );
                return;
            }

            pendingCameraStopRef.current = {
                camera: getFlatCameraStop(
                    cameraStop,
                    getViewportCameraPadding(),
                ),
                enableMarkerLoads: true,
            };
        },
        [getViewportCameraPadding],
    );

    const lockOnLocationMode = useLockOnLocationMode({
        cameraRef,
        cameraViewportInsets: viewportMetrics.cameraPadding,
        clampZoomLevel,
        currentZoomRef,
        isMapReadyRef,
        markerLoadsEnabledRef,
        moveCameraToUser,
        pendingCameraStopRef,
        setTrackingMode,
    });
    const followLocationMode = useFollowLocationMode({
        cameraRef,
        cameraViewportInsets: viewportMetrics.cameraPadding,
        clampZoomLevel,
        currentZoomRef,
        ...getDrivingMapViewFollowConfiguration(drivingMapViewMode),
        followIsEnabled: drivingMapViewMode !== DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
        followSpeedZoomEnabled: true,
        followViewportAnchorY,
        isDrivingMode,
        locationTrackingMode,
        locationTrackingModeRef,
        markerLoadsEnabledRef,
        setTrackingMode,
        userLocationRef,
        viewportHeight: viewportMetrics.height,
    });
    const scheduleMarkerLoad = useCallback(
        (bounds, delay, { manualPanIsStarting = false } = {}) => {
            if (
                !bounds ||
                !isMapReadyRef.current ||
                !markersAreVisible ||
                !markerLoadsEnabledRef.current
            ) {
                return;
            }

            const markerLoadBounds = resolveMarkerLoadBounds({
                cameraBounds: bounds,
                drivingFollowIsActive:
                    isDrivingMode &&
                    !manualPanIsStarting &&
                    !followLocationMode.getRecenterIsNeeded() &&
                    locationTrackingModeRef.current ===
                        LOCATION_TRACKING_FOLLOW,
                userLocation: userLocationRef.current,
            });

            scheduleSharedMarkerLoad(markerLoadBounds, delay);
        },
        [
            followLocationMode,
            isDrivingMode,
            markersAreVisible,
            scheduleSharedMarkerLoad,
        ],
    );

    useEffect(() => {
        const markersWereVisible = previousMarkersAreVisibleRef.current;

        previousMarkersAreVisibleRef.current = markersAreVisible;

        if (
            markersWereVisible ||
            !markersAreVisible ||
            !latestMapBoundsRef.current
        ) {
            return;
        }

        scheduleMarkerLoad(latestMapBoundsRef.current, 0);
    }, [markersAreVisible, scheduleMarkerLoad]);

    const activeLocationMode = isDrivingMode
        ? followLocationMode
        : lockOnLocationMode;

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!mapPreferencesAreLoaded) {
            return;
        }

        const initialZoomLevel = getStoredNumber(
            initialCameraSettings?.zoomLevel,
        );

        if (initialZoomLevel !== null) {
            currentZoomRef.current = initialZoomLevel;
        }

        markerLoadsEnabledRef.current = true;
    }, [initialCameraSettings?.zoomLevel, mapPreferencesAreLoaded]);

    useEffect(() => {
        if (
            !mapPreferencesAreLoaded ||
            locationAccessHydrationHasRunRef.current
        ) {
            return undefined;
        }

        locationAccessHydrationHasRunRef.current = true;
        let isActive = true;

        async function hydrateLocationAccess() {
            let permission = null;

            try {
                permission = await Location.getForegroundPermissionsAsync();
            } catch {
                permission = null;
            }

            if (!isActive || !isMountedRef.current) {
                return;
            }

            if (!hasPreciseLocation(permission)) {
                setLocationAccessGranted(false);
                setLocationError(
                    'Open the phone app and allow precise location to use car location controls.',
                );
                return;
            }

            setLocationAccessGranted(true);

            const currentLocation = locationUpdatesEnabledRef.current
                ? await findCurrentLocation()
                : userLocationRef.current;

            if (!isActive || !isMountedRef.current || !currentLocation) {
                return;
            }

            if (
                isDrivingModeRef.current &&
                !mapBrowsingContextIsActiveRef.current
            ) {
                followLocationMode.start(currentLocation);
            } else if (!isDrivingModeRef.current) {
                lockOnLocationMode.start(currentLocation);
            }
        }

        hydrateLocationAccess();

        return () => {
            isActive = false;
        };
    }, [findCurrentLocation, mapPreferencesAreLoaded, setLocationError]);

    useEffect(() => {
        if (
            locationUpdatesEnabled ||
            !locationAccessGranted ||
            !userLocation ||
            mapBrowsingContextIsActiveRef.current ||
            locationTrackingModeRef.current !== LOCATION_TRACKING_NONE
        ) {
            return;
        }

        if (isDrivingMode) {
            if (followAutoStartIsSuppressedRef.current) {
                return;
            }

            followLocationMode.start(userLocation);
            return;
        }

        lockOnLocationMode.start(userLocation);
    }, [
        followLocationMode,
        isDrivingMode,
        locationAccessGranted,
        locationUpdatesEnabled,
        lockOnLocationMode,
        userLocation,
    ]);

    useEffect(() => {
        if (!isMapReady || !pendingCameraStopRef.current) {
            return;
        }

        const pendingCameraStop = pendingCameraStopRef.current;

        if (pendingCameraStop.enableMarkerLoads) {
            markerLoadsEnabledRef.current = true;
        }

        cameraRef.current?.setCamera(pendingCameraStop.camera);
        pendingCameraStopRef.current = null;
    }, [isMapReady]);

    useEffect(() => {
        if (!isMapReadyRef.current || !mapPreferencesAreLoaded) {
            return;
        }

        if (isDrivingMode) {
            return;
        }

        cameraRef.current?.setCamera({
            animationDuration: 0,
            padding: getViewportCameraPadding(),
        });
    }, [
        followLocationMode.recenterIsNeeded,
        getViewportCameraPadding,
        isDrivingMode,
        mapPreferencesAreLoaded,
        viewportMetrics.key,
    ]);

    useEffect(() => {
        const wasDrivingMode = previousDrivingModeRef.current;

        previousDrivingModeRef.current = isDrivingMode;

        if (wasDrivingMode === isDrivingMode) {
            return;
        }

        if (isDrivingMode) {
            // A new driving session starts with the normal automatic-follow
            // behavior even if the user turned it off in the prior session.
            followAutoStartIsSuppressedRef.current = false;

            if (locationAccessGranted && userLocationRef.current) {
                followLocationMode.start(userLocationRef.current);
            }
            return;
        }

        if (locationTrackingModeRef.current === LOCATION_TRACKING_FOLLOW) {
            setTrackingMode(LOCATION_TRACKING_NONE);
            cameraRef.current?.setCamera({
                animationDuration: LOCATION_CAMERA_ANIMATION_DURATION_MS,
                animationMode: 'easeTo',
                padding: getViewportCameraPadding(),
                pitch: 0,
            });
        }
    }, [
        followLocationMode,
        getViewportCameraPadding,
        isDrivingMode,
        locationAccessGranted,
        setTrackingMode,
    ]);

    const handleCameraChanged = useCallback(
        (state) => {
            const previousZoomLevel = currentZoomRef.current;
            const nextZoomLevel = state?.properties?.zoom;
            const nextCameraDebugState = cameraDebugStateUpdatesEnabled
                ? getCameraDebugState(state)
                : null;
            let zoomLevelChanged = false;

            if (nextCameraDebugState) {
                setPendingCameraDebugState(
                    nextCameraDebugState,
                    getCameraDebugStateKey(nextCameraDebugState),
                );
            }

            if (Number.isFinite(nextZoomLevel)) {
                zoomLevelChanged =
                    Math.abs(previousZoomLevel - nextZoomLevel) >
                    ZOOM_LEVEL_STATE_UPDATE_EPSILON;
                currentZoomRef.current = nextZoomLevel;
            }

            if (state?.gestures?.isGestureActive) {
                markerLoadsEnabledRef.current = true;
            }

            const bounds = getBoundsFromCameraState(state);
            const manualPanIsStarting = Boolean(
                state?.gestures?.isGestureActive && !zoomLevelChanged,
            );

            if (bounds) {
                latestMapBoundsRef.current = bounds;
                scheduleMarkerLoad(bounds, undefined, {
                    manualPanIsStarting,
                });
            }

            if (state?.gestures?.isGestureActive) {
                const currentTrackingMode = locationTrackingModeRef.current;

                if (
                    isDrivingMode &&
                    currentTrackingMode === LOCATION_TRACKING_FOLLOW
                ) {
                    if (zoomLevelChanged) {
                        followLocationMode.keepSyncedAfterZoomChange(
                            currentTrackingMode,
                        );
                    } else {
                        followLocationMode.pauseUntilRecenter();
                    }
                } else {
                    setTrackingMode(LOCATION_TRACKING_NONE);
                }
            }
        },
        [
            cameraDebugStateUpdatesEnabled,
            followLocationMode,
            isDrivingMode,
            scheduleMarkerLoad,
            setPendingCameraDebugState,
            setTrackingMode,
        ],
    );

    const handleMapLoaded = useCallback(() => {
        isMapReadyRef.current = true;
        markerLoadsEnabledRef.current = true;
        setIsMapReady(true);

        if (latestMapBoundsRef.current) {
            scheduleMarkerLoad(latestMapBoundsRef.current, 0);
        }
    }, [scheduleMarkerLoad]);

    const handleCompassHeadingUpdate = useCallback(
        (nextHeading) => {
            currentCompassHeadingRef.current = nextHeading;

            const currentLocation = userLocationRef.current;

            if (!currentLocation || currentLocation.isMoving) {
                return;
            }

            const nextLocation = {
                ...currentLocation,
                compassHeading: nextHeading,
                compassHeadingRecordedAt: Date.now(),
            };

            userLocationRef.current = nextLocation;
            setUserLocation(nextLocation);
        },
        [setUserLocation],
    );

    const handleUserLocationUpdate = useCallback(
        (location) => {
            if (
                !shouldAcceptLocationUpdate({
                    location,
                    roadMatchedLocationWatchEnabled:
                        roadMatchedLocationWatchEnabledRef.current,
                })
            ) {
                return;
            }

            const nextLocation = getLocationUpdate(location);

            if (!nextLocation || !isMountedRef.current) {
                return;
            }

            const previousLocation = userLocationRef.current;

            if (
                locationUpdateIsStale({
                    currentLocation: previousLocation,
                    nextLocation,
                })
            ) {
                return;
            }

            const nextHeading = getLocationCourseHeading(location);
            const motionState = getDrivingMotionState({
                fallbackCourseHeading: currentCourseHeadingRef.current,
                locationCourseHeading: nextHeading,
                nextLocation,
                previousLocation,
            });

            if (motionState.courseHeading !== null) {
                currentCourseHeadingRef.current = isDrivingMode
                    ? motionState.courseHeading
                    : getSmoothedCourseHeading(
                          currentCourseHeadingRef.current,
                          motionState.courseHeading,
                      );
            } else {
                currentCourseHeadingRef.current = null;
            }

            const nextLocationWithHeading = getLocationWithDrivingMotionState({
                compassHeading: currentCompassHeadingRef.current,
                courseHeading: currentCourseHeadingRef.current,
                motionState,
                nextLocation,
            });

            userLocationRef.current = nextLocationWithHeading;
            setUserLocation(nextLocationWithHeading);

            const currentTrackingMode = locationTrackingModeRef.current;

            if (
                isDrivingMode &&
                !mapBrowsingContextIsActiveRef.current &&
                currentTrackingMode !== LOCATION_TRACKING_FOLLOW &&
                !followAutoStartIsSuppressedRef.current
            ) {
                followLocationMode.start(nextLocationWithHeading);
                return;
            }

            if (
                lockOnLocationMode.handleLocationUpdate(
                    currentTrackingMode,
                    nextLocationWithHeading,
                )
            ) {
                return;
            }

            followLocationMode.handleLocationUpdate(
                currentTrackingMode,
                nextLocationWithHeading,
            );
        },
        [
            followLocationMode,
            isDrivingMode,
            lockOnLocationMode,
            setUserLocation,
        ],
    );
    // While the Play Store auto-drive simulation is running, device GPS fixes
    // would fight the simulated route positions, so the simulation becomes the
    // only location source for the car screen.
    const autoDriveSimulationIsActive = useAutoDriveSimulationIsActive();
    const roadMatchedLocationWatchEnabled =
        locationUpdatesEnabled &&
        locationAccessGranted &&
        !autoDriveSimulationIsActive &&
        roadMatchingLocationIsSupported();

    useLayoutEffect(() => {
        roadMatchedLocationWatchEnabledRef.current =
            roadMatchedLocationWatchEnabled;
    }, [roadMatchedLocationWatchEnabled]);

    useRoadMatchedLocationWatch({
        enabled: roadMatchedLocationWatchEnabled,
        handleUserLocationUpdate,
        isMountedRef,
        persistent: true,
    });
    useLocationWatch({
        enabled:
            locationUpdatesEnabled &&
            !roadMatchedLocationWatchEnabled &&
            !autoDriveSimulationIsActive,
        handleUserLocationUpdate,
        isDrivingMode,
        isLocationTrackingActive:
            locationTrackingMode !== LOCATION_TRACKING_NONE,
        isMountedRef,
        locationAccessGranted,
        setLocationError,
    });

    useEffect(() => {
        if (!locationUpdatesEnabled || !autoDriveSimulationIsActive) {
            return undefined;
        }

        return addAutoDriveSimulationLocationListener(handleUserLocationUpdate);
    }, [
        autoDriveSimulationIsActive,
        handleUserLocationUpdate,
        locationUpdatesEnabled,
    ]);
    useHeadingWatch({
        handleHeadingUpdate: handleCompassHeadingUpdate,
        isDrivingMode:
            locationUpdatesEnabled &&
            isDrivingMode &&
            userLocation?.isMoving !== true,
        locationAccessGranted,
    });

    const nativeCameraFollowProps = followLocationMode.nativeCameraFollowProps;

    const handleZoomPress = useCallback(
        (zoomDelta, center) => {
            const previousZoomLevel = currentZoomRef.current;
            const nextZoomLevel = clampZoomLevel(previousZoomLevel + zoomDelta);
            const appliedZoomDelta = nextZoomLevel - previousZoomLevel;

            if (Math.abs(appliedZoomDelta) < 0.01) {
                return;
            }

            currentZoomRef.current = nextZoomLevel;

            if (
                activeLocationMode.handleZoomLevelChange(
                    locationTrackingMode,
                    nextZoomLevel,
                    userLocation,
                )
            ) {
                return;
            }

            const zoomCenter = getResolvedViewportPoint(
                center,
                viewportMetricsRef.current,
            );

            cameraRef.current?.scaleBy({
                x: zoomCenter.x * mapGestureCoordinateScale,
                y: zoomCenter.y * mapGestureCoordinateScale,
                scaleFactor: 2 ** appliedZoomDelta,
                animationDuration: AUTO_PLAY_ZOOM_BUTTON_ANIMATION_DURATION_MS,
                animationMode: AUTO_PLAY_CAMERA_INTERACTION_ANIMATION_MODE,
            });
        },
        [
            activeLocationMode,
            locationTrackingMode,
            mapGestureCoordinateScale,
            userLocation,
        ],
    );

    const handleMarkerSourcePress = useCallback(
        async (event) => {
            const feature = event?.features?.[0];

            if (
                !feature?.properties?.cluster &&
                !feature?.properties?.point_count
            ) {
                return;
            }

            const coordinate = feature?.geometry?.coordinates;

            if (!Array.isArray(coordinate)) {
                return;
            }

            try {
                const expansionZoomLevel =
                    await markerShapeSourceRef.current?.getClusterExpansionZoom(
                        feature,
                    );

                if (!Number.isFinite(expansionZoomLevel)) {
                    return;
                }

                const nextZoomLevel = clampZoomLevel(expansionZoomLevel);

                markerLoadsEnabledRef.current = true;
                currentZoomRef.current = nextZoomLevel;

                if (isDrivingMode) {
                    followLocationMode.pauseUntilRecenter();
                } else {
                    setTrackingMode(LOCATION_TRACKING_NONE);
                }

                const cameraStop = {
                    centerCoordinate: coordinate,
                    zoomLevel: nextZoomLevel,
                    animationDuration: 500,
                    animationMode: 'easeTo',
                };

                cameraRef.current?.setCamera(
                    isDrivingMode
                        ? cameraStop
                        : getFlatCameraStop(
                              cameraStop,
                              getViewportCameraPadding(),
                          ),
                );
            } catch {
                // Cluster expansion is optional; the base map remains usable without it.
            }
        },
        [
            followLocationMode,
            getViewportCameraPadding,
            isDrivingMode,
            setTrackingMode,
        ],
    );

    const refreshLocationPermission = useCallback(async () => {
        let permission = null;

        try {
            permission = await Location.getForegroundPermissionsAsync();
        } catch {
            permission = null;
        }

        const hasAccess = hasPreciseLocation(permission);

        setLocationAccessGranted(hasAccess);

        return hasAccess;
    }, []);

    const handleLocationRecenterPress = useCallback(async () => {
        if (!locationAccessGranted && !(await refreshLocationPermission())) {
            setLocationError(
                'Open the phone app and allow precise location to use car location controls.',
            );
            return;
        }

        const currentLocation = (await findCurrentLocation()) ?? userLocation;

        if (!currentLocation) {
            setLocationError('Your current location is not available yet.');
            return;
        }

        followAutoStartIsSuppressedRef.current = false;
        activeLocationMode.start(currentLocation, { isUserInitiated: true });
    }, [
        activeLocationMode,
        findCurrentLocation,
        locationAccessGranted,
        refreshLocationPermission,
        setLocationError,
        userLocation,
    ]);

    const handleLocationTrackingPress = useCallback(async () => {
        if (activeLocationMode.isActive(locationTrackingMode)) {
            if (isDrivingMode) {
                followAutoStartIsSuppressedRef.current = true;
            }
            activeLocationMode.stop();
            return;
        }

        await handleLocationRecenterPress();
    }, [
        activeLocationMode,
        handleLocationRecenterPress,
        isDrivingMode,
        locationTrackingMode,
    ]);

    const handleDrivingRecenterPress = useCallback(async () => {
        if (!locationAccessGranted && !(await refreshLocationPermission())) {
            setLocationError(
                'Open the phone app and allow precise location to recenter the car map.',
            );
            return;
        }

        const currentLocation = userLocation ?? (await findCurrentLocation());

        if (!currentLocation) {
            setLocationError('Your current location is not available yet.');
            return;
        }

        manualMapGestureGenerationRef.current += 1;
        void Promise.resolve(
            locationPuckCameraFollowReleaseRef.current?.({
                resumeFollow: true,
            }),
        ).catch(() => {});
        followLocationMode.recenter(currentLocation);
    }, [
        findCurrentLocation,
        followLocationMode,
        locationAccessGranted,
        refreshLocationPermission,
        setLocationError,
        userLocation,
    ]);

    const fitCameraToBounds = useCallback(
        async (
            bounds,
            {
                adaptsPaddingToViewport = false,
                allowBeforeMapReady = false,
                duration = AUTO_PLAY_ROUTE_PREVIEW_CAMERA_FIT_DURATION_MS,
                padding = [88, 96, 112, 96],
                shouldApply = () => true,
            } = {},
        ) => {
            if (!shouldApply()) {
                return false;
            }

            const viewport = viewportMetricsRef.current;
            const requestedPadding = getCameraPadding(padding);
            const boundsFitPadding = adaptsPaddingToViewport
                ? getAutoPlayBoundsFitPadding({
                      padding: requestedPadding,
                      viewportMetrics: viewport,
                  })
                : requestedPadding;
            const resolvedPadding = mergeCameraPadding(
                boundsFitPadding,
                getViewportCameraPadding(),
            );
            const cameraStop = getBoundsFitCameraStop({
                bounds,
                duration,
                padding: resolvedPadding,
                viewportHeight: viewport?.height,
                viewportWidth: viewport?.width,
            });

            if (
                !cameraStop ||
                (!allowBeforeMapReady && !isMapReadyRef.current) ||
                !cameraRef.current
            ) {
                return false;
            }

            if (isDrivingMode) {
                followLocationMode.pauseUntilRecenter();

                try {
                    await locationPuckCameraFollowReleaseRef.current?.();
                } catch {
                    // A failed native release must not prevent a requested fit.
                }
            } else {
                setTrackingMode(LOCATION_TRACKING_NONE);
            }

            if (
                !shouldApply() ||
                !isMapReadyRef.current ||
                !cameraRef.current
            ) {
                return false;
            }

            markerLoadsEnabledRef.current = true;
            currentZoomRef.current = cameraStop.zoomLevel;
            cameraRef.current.setCamera(cameraStop);

            return true;
        },
        [
            followLocationMode,
            getViewportCameraPadding,
            isDrivingMode,
            setTrackingMode,
        ],
    );

    const pauseFollowForManualMapGesture = useCallback(async () => {
        if (!isDrivingMode) {
            setTrackingMode(LOCATION_TRACKING_NONE);
            return true;
        }

        followLocationMode.pauseUntilRecenter();

        try {
            return (
                (await locationPuckCameraFollowReleaseRef.current?.()) !== false
            );
        } catch {
            // A failed native handoff must not leave the host gesture blocked.
            return true;
        }
    }, [followLocationMode, isDrivingMode, setTrackingMode]);

    const fitDrivingCameraToBounds = useCallback(
        async (bounds, { shouldApply = () => true, ...options } = {}) => {
            if (!isDrivingMode || !shouldApply()) {
                return false;
            }

            manualMapGestureGenerationRef.current += 1;

            return fitCameraToBounds(bounds, {
                ...options,
                shouldApply: () => shouldApply() && isMountedRef.current,
            });
        },
        [fitCameraToBounds, isDrivingMode],
    );

    const handlePanningInterfaceChanged = useCallback(
        (isPanningInterfaceVisible) => {
            if (isPanningInterfaceVisible) {
                void pauseFollowForManualMapGesture();
            }
        },
        [pauseFollowForManualMapGesture],
    );

    const handlePan = useCallback(
        async (translation) => {
            const x = Number(translation?.x);
            const y = Number(translation?.y);

            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }

            markerLoadsEnabledRef.current = true;
            const manualMapGestureGeneration =
                manualMapGestureGenerationRef.current;
            const wasFollowReleased = await pauseFollowForManualMapGesture();

            if (
                !wasFollowReleased ||
                manualMapGestureGeneration !==
                    manualMapGestureGenerationRef.current
            ) {
                return;
            }

            // Android Auto supplies scroll deltas at its own cadence. RNMapbox
            // requires these moves to be immediate rather than animated.
            cameraRef.current?.moveBy({
                x: x * mapGestureCoordinateScale,
                y: y * mapGestureCoordinateScale,
            });
        },
        [mapGestureCoordinateScale, pauseFollowForManualMapGesture],
    );

    const handleZoomGesture = useCallback(
        async (center, scale) => {
            const scaleFactor = Number(scale);

            if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
                return;
            }

            markerLoadsEnabledRef.current = true;
            const manualMapGestureGeneration =
                manualMapGestureGenerationRef.current;
            const wasFollowReleased = await pauseFollowForManualMapGesture();

            if (
                !wasFollowReleased ||
                manualMapGestureGeneration !==
                    manualMapGestureGenerationRef.current
            ) {
                return;
            }

            const zoomCenter = getResolvedViewportPoint(
                center,
                viewportMetricsRef.current,
            );

            cameraRef.current?.scaleBy({
                x: zoomCenter.x * mapGestureCoordinateScale,
                y: zoomCenter.y * mapGestureCoordinateScale,
                scaleFactor,
                animationDuration: AUTO_PLAY_ZOOM_ANIMATION_DURATION_MS,
                animationMode: AUTO_PLAY_CAMERA_INTERACTION_ANIMATION_MODE,
            });
        },
        [mapGestureCoordinateScale, pauseFollowForManualMapGesture],
    );

    const isFollowing = locationTrackingMode === LOCATION_TRACKING_FOLLOW;
    const drivingRecenterIsVisible =
        isDrivingMode &&
        isFollowing &&
        followLocationMode.recenterActionIsNeeded;

    return {
        cameraRef,
        currentCameraDebugState,
        drivingRecenterIsVisible,
        fitCameraToBounds,
        fitDrivingCameraToBounds,
        handleCameraChanged,
        handleDrivingRecenterPress,
        handleLocationRecenterPress,
        handleLocationTrackingPress,
        handleMapLoaded,
        handleMarkerSourcePress,
        handlePan,
        handlePanningInterfaceChanged,
        handleZoomGesture,
        handleZoomPress,
        isFollowing,
        isMapReady,
        isLocating,
        locationAccessGranted,
        locationError,
        locationTrackingMode,
        markerShapeSourceRef,
        mapViewRef,
        locationPuckCameraFollowReleaseRef,
        roadMatchedLocationWatchEnabled,
        nativeCameraFollowProps,
    };
}

export function AutoPlayMapSurfaceContent({
    autoPlaySafeAreaInsets,
    colorScheme,
    id,
    platformConfig,
    showDrivingStatus = false,
    windowInfo,
}) {
    const {
        applyWindowScaleToMapGestures,
        currentRoadPill,
        hideCompassDuringNavigation,
        ornamentSafeAreaLeftScale,
        showDrivingStatusOnSecondarySurfaces,
        showSpeedLimitOnSecondarySurfaces,
        speedLimitBadge,
        usesHostColorSchemeForAutomaticMapPreset,
    } = {
        ...DEFAULT_AUTO_PLAY_SURFACE_PLATFORM_CONFIG,
        ...platformConfig,
    };
    const autoPlayState = useAutoPlayState();
    const isRootMapSurface = !id || id === AUTO_PLAY_ROOT_MODULE_ID;
    const {
        rendersDrivingStatus,
        rendersSpeedLimit,
        secondaryDrivingStatusIsVisible,
    } = getAutoPlayDrivingStatusVisibility({
        isRootMapSurface,
        showDrivingStatus,
        showDrivingStatusOnSecondarySurfaces,
        showSpeedLimitOnSecondarySurfaces,
    });
    const fittedDirectionsRouteKeyRef = useRef('');
    const fittedDrivingRouteOverviewKeyRef = useRef('');
    const fittedSearchResultsKeyRef = useRef('');
    const mapBrowsingContextWasActiveRef = useRef(false);
    const previousDrivingMapViewModeRef = useRef(DRIVING_MAP_VIEW_PERSPECTIVE);
    const [layoutSize, setLayoutSize] = useState(null);
    const [followViewportAnchorY, setFollowViewportAnchorY] =
        useState(undefined);
    const [appliedMapLightPreset, setAppliedMapLightPreset] = useState(null);
    const mapPreferences = useMapPreferencesState();
    const mockWazePoliceAlertsEnabled = useMockWazePoliceAlertsEnabled();
    const alertSurfaceVisibility = getAutoPlayAlertSurfaceVisibility({
        isRootMapSurface,
        policeAlertsVisible:
            mapPreferences.policeAlertsVisible || mockWazePoliceAlertsEnabled,
        surveillanceMarkersVisible: mapPreferences.surveillanceMarkersVisible,
    });
    const markerLoader = useMarkerLoader();
    const isDrivingMode = autoPlayState.drivingModeIsActive !== false;
    const drivingMapViewMode =
        autoPlayState.drivingMapViewMode ?? DRIVING_MAP_VIEW_PERSPECTIVE;
    const routePreviewIsActive = Boolean(
        !autoPlayState.isNavigating && autoPlayState.directionsRoute,
    );
    const autoPlayColorScheme = useAutoPlayColorScheme(colorScheme);
    const displayedDirectionsRoute = autoPlayState.directionsRoute ?? null;
    const activeDirectionsRoute = autoPlayState.isNavigating
        ? displayedDirectionsRoute
        : null;
    const submittedSearchResults =
        routePreviewIsActive || autoPlayState.isNavigating
            ? EMPTY_AUTO_PLAY_SUBMITTED_SEARCH_RESULTS
            : (autoPlayState.submittedSearchResults ??
              EMPTY_AUTO_PLAY_SUBMITTED_SEARCH_RESULTS);
    const searchResultsMapIsActive = getAutoPlaySearchResultsMapIsActive({
        isNavigating: autoPlayState.isNavigating,
        routePreviewIsActive,
        submittedSearchQuery: autoPlayState.submittedSearchQuery,
        submittedSearchResults,
    });
    const mapBrowsingContextIsActive = Boolean(
        isRootMapSurface && (routePreviewIsActive || searchResultsMapIsActive),
    );
    const mapContentVisibility = getAutoPlayMapContentVisibility({
        routePreviewIsActive: rendersDrivingStatus && routePreviewIsActive,
        searchResultsMapIsActive:
            rendersDrivingStatus && searchResultsMapIsActive,
        surveillanceMarkersVisible:
            alertSurfaceVisibility.surveillanceMarkersVisible,
    });
    const navigationPuckRefreshKey = getAutoPlayNavigationPuckRefreshKey({
        isNavigating: autoPlayState.isNavigating,
        isRootMapSurface,
        routePreviewIsActive,
        searchResultsMapIsActive,
    });
    const mapLightPresetPreference = resolveAutoPlayMapLightPresetPreference({
        colorScheme: autoPlayColorScheme,
        lightPresetPreference: mapPreferences.mapLightPresetPreference,
        usesHostColorSchemeForAutomaticMapPreset,
    });
    const mapLightPreset = useMapboxStandardLightPreset(
        mapLightPresetPreference,
        mapPreferences.userLocation,
    );
    const viewportMetrics = useMemo(
        () =>
            getAutoPlayViewportMetrics({
                layoutSize,
                ornamentSafeAreaLeftScale,
                safeAreaInsets: autoPlaySafeAreaInsets,
                windowInfo,
            }),
        [
            autoPlaySafeAreaInsets.bottom,
            autoPlaySafeAreaInsets.left,
            autoPlaySafeAreaInsets.right,
            autoPlaySafeAreaInsets.top,
            layoutSize?.height,
            layoutSize?.width,
            ornamentSafeAreaLeftScale,
            windowInfo?.height,
            windowInfo?.width,
        ],
    );
    const navigationPuckSize = useMemo(
        () =>
            getNavigationPuckSize({
                variant: 'auto-play',
                viewportHeight: viewportMetrics.visibleHeight,
                viewportWidth: viewportMetrics.visibleWidth,
            }),
        [viewportMetrics.visibleHeight, viewportMetrics.visibleWidth],
    );
    const debugOverlaysAreVisible =
        isRootMapSurface &&
        SHOW_MAP_DEBUG_CONTROLS &&
        mapPreferences.debugOverlayIsVisible;
    const debugOverlayVisibility = mapPreferences.debugOverlayVisibility;
    const mapGestureCoordinateScale = useMemo(
        () =>
            getMapGestureCoordinateScale({
                applyWindowScaleToMapGestures,
                windowInfo,
            }),
        [applyWindowScaleToMapGestures, windowInfo?.scale],
    );
    useEffect(() => {
        if (isRootMapSurface) {
            return undefined;
        }

        logAutoPlayMapSurfaceAction('secondary-map-surface-mounted');

        return () => {
            logAutoPlayMapSurfaceAction('secondary-map-surface-unmounted');
        };
    }, [isRootMapSurface]);
    const handleLocationAnchorLayout = useCallback((nextAnchorY) => {
        setFollowViewportAnchorY((previousAnchorY) =>
            previousAnchorY === nextAnchorY ? previousAnchorY : nextAnchorY,
        );
    }, []);
    const controller = useAutoPlayMapController({
        cameraDebugStateUpdatesEnabled:
            autoPlayCameraDebugStateUpdatesAreEnabled({
                debugOverlayVisibility,
                debugOverlaysAreVisible,
            }),
        drivingMapViewMode,
        initialCameraSettings: mapPreferences.initialCameraSettings,
        isDrivingMode,
        locationUpdatesEnabled: isRootMapSurface,
        mapGestureCoordinateScale,
        mapBrowsingContextIsActive,
        mapPreferencesAreLoaded: mapPreferences.mapPreferencesAreLoaded,
        markersAreVisible: alertSurfaceVisibility.surveillanceMarkersVisible,
        scheduleSharedMarkerLoad: markerLoader.scheduleMarkerLoad,
        setUserLocation: mapPreferences.setUserLocation,
        userLocation: mapPreferences.userLocation,
        followViewportAnchorY,
        viewportMetrics,
    });
    const handleDrivingMapViewPress = useCallback(() => {
        if (!isRootMapSurface || !activeDirectionsRoute) {
            return;
        }

        const nextMode = getNextDrivingMapViewMode(drivingMapViewMode);

        setAutoPlayState({ drivingMapViewMode: nextMode });
        logAutoPlayMapSurfaceAction(`driving-map-view-${nextMode}-requested`);
    }, [activeDirectionsRoute, drivingMapViewMode, isRootMapSurface]);
    useEffect(() => {
        const previousDrivingMapViewMode =
            previousDrivingMapViewModeRef.current;
        const isReturningToPerspective =
            previousDrivingMapViewMode === DRIVING_MAP_VIEW_ROUTE_OVERVIEW &&
            drivingMapViewMode === DRIVING_MAP_VIEW_PERSPECTIVE;

        previousDrivingMapViewModeRef.current = drivingMapViewMode;

        if (
            !isRootMapSurface ||
            !activeDirectionsRoute ||
            !isReturningToPerspective
        ) {
            return;
        }

        controller.handleDrivingRecenterPress().then(
            () => {
                logAutoPlayMapSurfaceAction(
                    'driving-map-view-perspective-restored',
                );
            },
            () => {},
        );
    }, [
        activeDirectionsRoute,
        controller.handleDrivingRecenterPress,
        drivingMapViewMode,
        isRootMapSurface,
    ]);
    const presentation = useMapPresentation({
        destinationCardIsOverlay: true,
        hasActiveDirectionsRoute: Boolean(activeDirectionsRoute),
        isDarkModeOverride: mapLightPresetUsesDarkAppearance(mapLightPreset),
        isDrivingMode,
        locationTrackingMode: controller.locationTrackingMode,
        mapLightPreset,
        mapStyleURL: mapPreferences.mapStyleURL,
        safeAreaInsetsOverride: viewportMetrics.safeAreaInsets,
        searchSource: 'auto-play',
        voiceSearchIsListening: false,
    });
    const markerFeatureCollection = useMemo(
        () => makeMarkerFeatureCollection(markerLoader.markerPoints),
        [markerLoader.markerPoints],
    );
    const electronicHorizon = useElectronicHorizon({
        enabled:
            alertSurfaceVisibility.upcomingAlertsVisible &&
            rendersDrivingStatus &&
            isDrivingMode &&
            !activeDirectionsRoute &&
            !searchResultsMapIsActive,
    });
    const policeAlertsLoader = useWazePoliceAlerts({
        policeAlertsAreEnabled:
            alertSurfaceVisibility.policeAlertsVisible &&
            !searchResultsMapIsActive,
        userLocation: mapPreferences.userLocation,
    });
    const policeAlertFeatureCollection = useMemo(
        () =>
            makeWazePoliceAlertFeatureCollection(
                policeAlertsLoader.policeAlerts,
            ),
        [policeAlertsLoader.policeAlerts],
    );
    const { upcomingAlerts } = useUpcomingElectronicHorizonAlerts({
        directionsRoute: activeDirectionsRoute,
        electronicHorizon,
        enabled:
            alertSurfaceVisibility.upcomingAlertsVisible &&
            rendersDrivingStatus &&
            isDrivingMode &&
            !searchResultsMapIsActive,
        policeAlerts: policeAlertsLoader.policeAlerts,
        userLocation: mapPreferences.userLocation,
    });
    const directionsRouteFeatureCollection = useMemo(
        () => makeDirectionsRouteFeatureCollection(displayedDirectionsRoute),
        [displayedDirectionsRoute],
    );
    const directionsDebugFeatureCollection = useMemo(
        () =>
            makeDirectionsDebugFeatureCollection(
                displayedDirectionsRoute,
                debugOverlaysAreVisible &&
                    debugOverlayVisibility?.[
                        DEBUG_OVERLAY_DIRECTIONS_GEOMETRY
                    ] === true,
            ),
        [
            displayedDirectionsRoute,
            debugOverlayVisibility,
            debugOverlaysAreVisible,
        ],
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
    const directionsWaypointMarkers = useMemo(
        () => makeAutoPlayDirectionsWaypointMarkers(displayedDirectionsRoute),
        [displayedDirectionsRoute],
    );
    const initialCameraSettings = useMemo(
        () =>
            getFlatCameraStop(
                mapPreferences.initialCameraSettings,
                viewportMetrics.cameraPadding,
            ),
        [mapPreferences.initialCameraSettings, viewportMetrics.cameraPadding],
    );
    const handleLayout = useCallback((event) => {
        const nextLayout = event?.nativeEvent?.layout;
        const width = getPositiveDimension(nextLayout?.width);
        const height = getPositiveDimension(nextLayout?.height);

        if (!width || !height) {
            return;
        }

        setLayoutSize((previousLayoutSize) => {
            if (
                previousLayoutSize?.width === width &&
                previousLayoutSize?.height === height
            ) {
                return previousLayoutSize;
            }

            return { height, width };
        });
    }, []);
    const autoPlayContextValues = useAutoPlayMapScreenContextValues({
        controller,
        directionsDebugFeatureCollection,
        directionsRouteFeatureCollection,
        electronicHorizonDebugFeatureCollection,
        directionsWaypointMarkers,
        hideCompassDuringNavigation: Boolean(
            (hideCompassDuringNavigation && activeDirectionsRoute) ||
            !mapContentVisibility.compassIsVisible,
        ),
        initialCameraSettings,
        isDrivingMode,
        mapLightPreset,
        mapPreferences,
        markerFeatureCollection,
        navigationPuckSize,
        navigationPuckRefreshKey,
        onMapAppearanceApplied: isRootMapSurface
            ? setAppliedMapLightPreset
            : undefined,
        policeAlertFeatureCollection,
        policeAlertsVisible:
            alertSurfaceVisibility.policeAlertsVisible &&
            !searchResultsMapIsActive,
        preferredFramesPerSecond: isRootMapSurface ? 30 : 20,
        presentation,
        submittedSearchResults,
        surveillanceMarkersVisible:
            mapContentVisibility.surveillanceMarkersVisible,
        userLocationPuckVisible: mapContentVisibility.userLocationPuckVisible,
    });
    useEffect(() => {
        const mapBrowsingContextWasActive =
            mapBrowsingContextWasActiveRef.current;

        mapBrowsingContextWasActiveRef.current = mapBrowsingContextIsActive;

        if (!mapBrowsingContextWasActive || mapBrowsingContextIsActive) {
            return;
        }

        if (isDrivingMode) {
            controller.handleDrivingRecenterPress().catch(() => {});
        } else {
            controller.handleLocationRecenterPress().catch(() => {});
        }
    }, [
        controller.handleDrivingRecenterPress,
        controller.handleLocationRecenterPress,
        isDrivingMode,
        mapBrowsingContextIsActive,
    ]);
    useEffect(() => {
        if (!isRootMapSurface) {
            return undefined;
        }

        return registerAutoPlayMapControlHandlers({
            handleDrivingMapViewPress,
            handleLocationTrackingPress:
                drivingMapViewMode === DRIVING_MAP_VIEW_ROUTE_OVERVIEW
                    ? handleDrivingMapViewPress
                    : controller.drivingRecenterIsVisible
                      ? controller.handleDrivingRecenterPress
                      : controller.handleLocationTrackingPress,
            handlePan: controller.handlePan,
            handlePanningInterfaceChanged:
                controller.handlePanningInterfaceChanged,
            handleZoomGesture: controller.handleZoomGesture,
            handleZoomInPress: (center) =>
                controller.handleZoomPress(ZOOM_STEP, center),
            handleZoomOutPress: () => controller.handleZoomPress(-ZOOM_STEP),
        });
    }, [
        controller.drivingRecenterIsVisible,
        controller.handleDrivingRecenterPress,
        controller.handleLocationTrackingPress,
        controller.handlePan,
        controller.handlePanningInterfaceChanged,
        controller.handleZoomGesture,
        controller.handleZoomPress,
        drivingMapViewMode,
        handleDrivingMapViewPress,
        isRootMapSurface,
    ]);

    useEffect(() => {
        if (!isRootMapSurface) {
            return;
        }

        notifyAutoPlayMapButtonAppearance({
            drivingMapViewMode,
            isDarkMapLayer: presentation.isDarkMapLayer,
            mapLightPreset: appliedMapLightPreset,
            trackingState: controller.drivingRecenterIsVisible
                ? 'recenter'
                : controller.locationTrackingMode !== LOCATION_TRACKING_NONE
                  ? 'active'
                  : 'inactive',
        });
    }, [
        appliedMapLightPreset,
        controller.drivingRecenterIsVisible,
        controller.locationTrackingMode,
        drivingMapViewMode,
        isRootMapSurface,
        presentation.isDarkMapLayer,
    ]);

    useEffect(() => {
        if (!isRootMapSurface) {
            return undefined;
        }

        return () => {
            notifyAutoPlayMapButtonAppearance(
                DEFAULT_AUTOPLAY_MAP_BUTTON_APPEARANCE,
            );
        };
    }, [isRootMapSurface]);

    useEffect(() => {
        if (!isRootMapSurface || activeDirectionsRoute) {
            return;
        }

        fittedDrivingRouteOverviewKeyRef.current = '';
        if (
            shouldRestoreDrivingPerspective({
                hasActiveDirectionsRoute: Boolean(activeDirectionsRoute),
                isRootMapSurface,
                mode: drivingMapViewMode,
            })
        ) {
            setAutoPlayState({
                drivingMapViewMode: DRIVING_MAP_VIEW_PERSPECTIVE,
            });
        }
    }, [activeDirectionsRoute, drivingMapViewMode, isRootMapSurface]);

    useEffect(() => {
        if (
            !isRootMapSurface ||
            !activeDirectionsRoute ||
            drivingMapViewMode !== DRIVING_MAP_VIEW_ROUTE_OVERVIEW
        ) {
            if (drivingMapViewMode !== DRIVING_MAP_VIEW_ROUTE_OVERVIEW) {
                fittedDrivingRouteOverviewKeyRef.current = '';
            }

            return undefined;
        }

        const bounds =
            getDirectionsRouteBounds(activeDirectionsRoute) ??
            activeDirectionsRoute.bounds;
        const overviewKey = [
            bounds?.sw,
            bounds?.ne,
            activeDirectionsRoute.selectedRouteKey,
            activeDirectionsRoute.routeKey,
            viewportMetrics.key,
        ]
            .flat()
            .join(':');

        if (
            !bounds ||
            fittedDrivingRouteOverviewKeyRef.current === overviewKey
        ) {
            return undefined;
        }

        let requestIsCurrent = true;

        void controller
            .fitDrivingCameraToBounds(bounds, {
                adaptsPaddingToViewport: true,
                allowBeforeMapReady: true,
                duration: 500,
                shouldApply: () => requestIsCurrent,
            })
            .then((wasFitted) => {
                if (requestIsCurrent && wasFitted) {
                    fittedDrivingRouteOverviewKeyRef.current = overviewKey;
                    logAutoPlayMapSurfaceAction(
                        'driving-route-overview-fitted',
                    );
                }
            });

        return () => {
            requestIsCurrent = false;
        };
    }, [
        activeDirectionsRoute,
        controller.fitDrivingCameraToBounds,
        controller.isMapReady,
        drivingMapViewMode,
        isRootMapSurface,
        viewportMetrics.key,
    ]);

    useEffect(() => {
        if (
            !isRootMapSurface ||
            !controller.isMapReady ||
            submittedSearchResults.length === 0
        ) {
            fittedSearchResultsKeyRef.current = '';
            return;
        }

        const bounds = getSubmittedSearchResultsBounds(submittedSearchResults);
        const searchResultsFitKey = getAutoPlaySearchResultsFitKey({
            bounds,
            query: autoPlayState.submittedSearchQuery,
            viewportKey: viewportMetrics.key,
        });

        if (
            !bounds ||
            !searchResultsFitKey ||
            fittedSearchResultsKeyRef.current === searchResultsFitKey
        ) {
            return;
        }

        let isCancelled = false;
        const fitSearchResultsToBounds = async () => {
            if (fittedSearchResultsKeyRef.current === searchResultsFitKey) {
                return true;
            }

            if (
                await controller.fitCameraToBounds(bounds, {
                    adaptsPaddingToViewport: true,
                    shouldApply: () => !isCancelled,
                })
            ) {
                if (!isCancelled) {
                    fittedSearchResultsKeyRef.current = searchResultsFitKey;
                }

                return true;
            }

            return false;
        };

        void fitSearchResultsToBounds();

        return () => {
            isCancelled = true;
        };
    }, [
        autoPlayState.submittedSearchQuery,
        controller.fitCameraToBounds,
        controller.isMapReady,
        isRootMapSurface,
        submittedSearchResults,
        viewportMetrics.key,
    ]);

    useEffect(() => {
        if (!displayedDirectionsRoute || !controller.isMapReady) {
            return;
        }

        const navigationFallbackFitIsNeeded = Boolean(
            autoPlayState.isNavigating &&
            isDrivingMode &&
            !mapPreferences.userLocation,
        );

        if (!routePreviewIsActive && !navigationFallbackFitIsNeeded) {
            return;
        }

        const bounds = routePreviewIsActive
            ? (getDirectionsRouteOptionsBounds(displayedDirectionsRoute) ??
              displayedDirectionsRoute.bounds)
            : (getDirectionsRouteBounds(displayedDirectionsRoute) ??
              displayedDirectionsRoute.bounds);
        const boundsKey = [bounds?.sw, bounds?.ne]
            .flat()
            .filter((coordinate) => Number.isFinite(Number(coordinate)))
            .join(',');
        const routeFitKey = routePreviewIsActive
            ? getAutoPlayRoutePreviewFitKey({
                  bounds,
                  route: displayedDirectionsRoute,
                  viewportKey: viewportMetrics.key,
              })
            : [
                  'navigation',
                  displayedDirectionsRoute.requestedAt,
                  displayedDirectionsRoute.selectedRouteKey,
                  displayedDirectionsRoute.routeKey,
                  displayedDirectionsRoute.destination?.id,
                  displayedDirectionsRoute.destination?.label,
                  displayedDirectionsRoute.destination?.inputValue,
                  boundsKey,
                  viewportMetrics.key,
              ].join(':');

        if (
            routeFitKey &&
            fittedDirectionsRouteKeyRef.current === routeFitKey
        ) {
            return;
        }

        let isCancelled = false;
        const fitRouteToBounds = async () => {
            if (fittedDirectionsRouteKeyRef.current === routeFitKey) {
                return true;
            }

            if (
                await controller.fitCameraToBounds(bounds, {
                    adaptsPaddingToViewport: routePreviewIsActive,
                    shouldApply: () => !isCancelled,
                })
            ) {
                if (!isCancelled) {
                    fittedDirectionsRouteKeyRef.current = routeFitKey;
                }

                return true;
            }

            return false;
        };

        void fitRouteToBounds();

        return () => {
            isCancelled = true;
        };
    }, [
        autoPlayState.isNavigating,
        controller.fitCameraToBounds,
        controller.isMapReady,
        displayedDirectionsRoute,
        isDrivingMode,
        mapPreferences.userLocation,
        routePreviewIsActive,
        viewportMetrics.key,
    ]);

    return (
        <MapScreenProviders {...autoPlayContextValues}>
            <View
                className="flex-1"
                onLayout={handleLayout}
                style={{
                    backgroundColor: presentation.isDarkMapLayer
                        ? '#111827'
                        : '#f5f5f5',
                }}
            >
                <MapCanvas />
                {rendersDrivingStatus && !searchResultsMapIsActive ? (
                    <AutoPlayMapStatusOverlay
                        activeDirectionsRoute={activeDirectionsRoute}
                        currentRoadPill={currentRoadPill}
                        drivingStatusIsVisible={
                            mapContentVisibility.drivingStatusIsVisible &&
                            shouldShowDrivingMapStatus(drivingMapViewMode)
                        }
                        freeDriveIsActive={
                            controller.roadMatchedLocationWatchEnabled ||
                            secondaryDrivingStatusIsVisible
                        }
                        isDarkMode={presentation.isDarkMapLayer}
                        markerLoader={markerLoader}
                        mapPreferencesAreLoaded={
                            mapPreferences.mapPreferencesAreLoaded
                        }
                        onLocationAnchorLayout={handleLocationAnchorLayout}
                        navigationPuckSize={navigationPuckSize}
                        presentation={presentation}
                        rendersSpeedLimit={rendersSpeedLimit}
                        speedLimitBadge={speedLimitBadge}
                        userLocation={mapPreferences.userLocation}
                        viewportMetrics={viewportMetrics}
                    />
                ) : null}
                {rendersDrivingStatus ? (
                    <AutoPlayTopRightStatusOverlay
                        isDarkMode={presentation.isDarkMapLayer}
                        mapControlLayoutInsets={
                            presentation.mapControlLayoutInsets
                        }
                        routeLoading={autoPlayState.routeLoading}
                        singleResultCountdown={
                            autoPlayState.singleResultCountdown
                        }
                        upcomingAlerts={
                            alertSurfaceVisibility.upcomingAlertsVisible &&
                            !searchResultsMapIsActive
                                ? upcomingAlerts
                                : []
                        }
                    />
                ) : null}
                <AutoPlayDebugOverlays
                    controller={controller}
                    debugOverlayVisibility={debugOverlayVisibility}
                    debugOverlaysAreVisible={debugOverlaysAreVisible}
                    isDrivingMode={isDrivingMode}
                    presentation={presentation}
                    userLocation={mapPreferences.userLocation}
                    viewportMetrics={viewportMetrics}
                />
            </View>
        </MapScreenProviders>
    );
}
