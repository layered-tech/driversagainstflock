import { useNavigationCamera } from '@rnmapbox/navigation';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, View } from 'react-native';
import {
    autoPlayCameraDebugStateUpdatesAreEnabled,
    AutoPlayDebugOverlays,
} from './auto-play-debug-overlays';
import {
    addAutoDriveSimulationLocationListener,
    useAutoDriveSimulationIsActive,
} from './auto-play-drive-simulation';
import { AutoPlayMapStatusOverlay } from './auto-play-map-status-overlay';
import {
    AUTO_PLAY_DRIVING_CAMERA_FOLLOW_VISIBLE_Y_RATIO,
    getAutoPlayFollowViewportAnchorY,
    getAutoPlayViewportMetrics,
} from './auto-play-map-viewport';
import { useAutoPlayState } from './auto-play-state';
import { useFollowLocationMode } from './map-follow-location-mode';
import {
    EMPTY_CAMERA_PADDING,
    getCameraPadding,
    getCameraPaddingArray,
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
import {
    MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
    SHOW_MAP_DEBUG_CONTROLS,
} from './map/config';
import {
    DEFAULT_ZOOM_LEVEL,
    MINIMUM_DRIVING_COURSE_SPEED_MPS,
    ZOOM_STEP,
} from './map/constants';
import { DEBUG_OVERLAY_DIRECTIONS_GEOMETRY } from './map/debug-overlays';
import {
    DIRECTIONS_FIELD_DESTINATION,
    DIRECTIONS_FIELD_START,
    getDirectionsRouteBounds,
    getDirectionsWaypointCoordinate,
    makeDirectionsDebugFeatureCollection,
    makeDirectionsRouteFeatureCollection,
} from './map/directions';
import {
    clampZoomLevel,
    getBoundsFromCameraState,
    getCoordinateBearingDegrees,
    getCoordinateDistanceMeters,
    getLocationCourseHeading,
    getLocationUpdate,
    getSmoothedCourseHeading,
    getStoredNumber,
    hasPreciseLocation,
    makeMarkerFeatureCollection,
    normalizeDirectionDegrees,
} from './map/geo';
import { MapCanvas } from './map/map-canvas';
import {
    MapScreenProviders,
    useAutoPlayMapScreenContextValues,
} from './map/map-screen-context';
import { useDeferredCameraDebugState } from './map/use-deferred-camera-debug-state';
import {
    mapboxNavigationEnhancedLocationIsSupported,
    useCurrentLocation,
    useEnhancedLocationWatch,
    useHeadingWatch,
    useLocationWatch,
} from './map/use-device-location';
import { useMapboxStandardLightPreset } from './map/use-map-light-preset';
import { useMapPreferencesState } from './map/use-map-preferences-state';
import { useMapPresentation } from './map/use-map-presentation';
import { useMarkerLoader } from './map/use-marker-loader';
import { useWazePoliceAlerts } from './map/use-waze-police-alerts';
import { makeWazePoliceAlertFeatureCollection } from './map/waze-alerts-api';

const CAMERA_DEBUG_CENTER_PRECISION = 6;
const CAMERA_DEBUG_ORIENTATION_PRECISION = 2;
const CAMERA_DEBUG_ZOOM_PRECISION = 2;
const ZOOM_LEVEL_STATE_UPDATE_EPSILON = 0.01;
const MINIMUM_DERIVED_COURSE_DISTANCE_METERS = 2;
const MAXIMUM_DERIVED_COURSE_INTERVAL_MS = 5000;
const AUTO_PLAY_CAMERA_INTERACTION_ANIMATION_MODE = 'easeTo';
const AUTO_PLAY_PAN_ANIMATION_DURATION_MS =
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS;
const AUTO_PLAY_ZOOM_ANIMATION_DURATION_MS =
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS;
const AUTO_PLAY_ZOOM_BUTTON_ANIMATION_DURATION_MS =
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS;
const AUTO_PLAY_ROOT_MODULE_ID = 'AutoPlayRoot';
const DEFAULT_AUTO_PLAY_SURFACE_PLATFORM_CONFIG = {
    applyWindowScaleToMapGestures: false,
    ornamentSafeAreaLeftScale: 1,
};

const EMPTY_AUTOPLAY_MAP_CONTROL_HANDLERS = {
    handleLocationTrackingPress: () => {},
    handlePan: () => {},
    handleZoomGesture: () => {},
    handleZoomInPress: () => {},
    handleZoomOutPress: () => {},
};
const DEFAULT_AUTOPLAY_MAP_BUTTON_APPEARANCE = {
    isDarkMapLayer: false,
    trackingState: 'inactive',
};
const DEFAULT_AUTO_PLAY_COLOR_SCHEME = 'light';

let autoPlayMapControlHandlers = EMPTY_AUTOPLAY_MAP_CONTROL_HANDLERS;
let autoPlayMapButtonAppearanceListener = () => {};
let autoPlayMapColorScheme = DEFAULT_AUTO_PLAY_COLOR_SCHEME;
const autoPlayMapColorSchemeListeners = new Set();

export function getAutoPlayMapControlHandlers() {
    return autoPlayMapControlHandlers;
}

function registerAutoPlayMapControlHandlers(handlers) {
    const nextHandlers = {
        ...EMPTY_AUTOPLAY_MAP_CONTROL_HANDLERS,
        ...handlers,
    };

    autoPlayMapControlHandlers = nextHandlers;

    return () => {
        if (autoPlayMapControlHandlers === nextHandlers) {
            autoPlayMapControlHandlers = EMPTY_AUTOPLAY_MAP_CONTROL_HANDLERS;
        }
    };
}

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

function getAutoPlayMapLightPreset(colorScheme) {
    return colorScheme === 'dark'
        ? MAPBOX_STANDARD_LIGHT_PRESET_NIGHT
        : MAPBOX_STANDARD_LIGHT_PRESET_DAY;
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

function getLocationCoordinatePair(location) {
    const longitude = getStoredNumber(location?.longitude);
    const latitude = getStoredNumber(location?.latitude);

    if (longitude === null || latitude === null) {
        return null;
    }

    return [longitude, latitude];
}

function getDerivedMotion(previousLocation, nextLocation) {
    const previousCoordinate = getLocationCoordinatePair(previousLocation);
    const nextCoordinate = getLocationCoordinatePair(nextLocation);
    const previousRecordedAt = getStoredNumber(previousLocation?.recordedAt);
    const nextRecordedAt = getStoredNumber(nextLocation?.recordedAt);

    if (!previousCoordinate || !nextCoordinate) {
        return {
            courseHeading: null,
            speed: null,
        };
    }

    const distanceMeters = getCoordinateDistanceMeters(
        previousCoordinate,
        nextCoordinate,
    );

    if (
        distanceMeters === null ||
        distanceMeters < MINIMUM_DERIVED_COURSE_DISTANCE_METERS
    ) {
        return {
            courseHeading: null,
            speed: null,
        };
    }

    const elapsedMs =
        nextRecordedAt !== null && previousRecordedAt !== null
            ? nextRecordedAt - previousRecordedAt
            : null;
    const speed =
        elapsedMs !== null &&
        elapsedMs > 0 &&
        elapsedMs <= MAXIMUM_DERIVED_COURSE_INTERVAL_MS
            ? distanceMeters / (elapsedMs / 1000)
            : null;

    return {
        courseHeading: getCoordinateBearingDegrees(
            previousCoordinate,
            nextCoordinate,
        ),
        speed,
    };
}

function getDrivingMotionState({
    fallbackCourseHeading,
    locationCourseHeading,
    nextLocation,
    previousLocation,
}) {
    const derivedMotion = getDerivedMotion(previousLocation, nextLocation);
    const measuredSpeed = getStoredNumber(nextLocation?.speed);
    const speed = measuredSpeed ?? derivedMotion.speed;
    const measuredCourseHeading =
        locationCourseHeading ?? derivedMotion.courseHeading;
    const courseHeading =
        measuredCourseHeading ??
        (speed !== null && speed >= MINIMUM_DRIVING_COURSE_SPEED_MPS
            ? fallbackCourseHeading
            : null);
    const isMoving =
        courseHeading !== null &&
        (speed !== null
            ? speed >= MINIMUM_DRIVING_COURSE_SPEED_MPS
            : measuredCourseHeading !== null);

    return {
        courseHeading: isMoving ? courseHeading : null,
        isMoving,
        speed,
    };
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
    initialCameraSettings,
    isDrivingMode,
    locationUpdatesEnabled = true,
    mapGestureCoordinateScale = 1,
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
    const locationAccessHydrationHasRunRef = useRef(false);
    const locationTrackingModeRef = useRef(LOCATION_TRACKING_NONE);
    const latestMapBoundsRef = useRef(null);
    const markerLoadsEnabledRef = useRef(false);
    const markerShapeSourceRef = useRef(null);
    const mapViewRef = useRef(null);
    const pendingCameraStopRef = useRef(null);
    const previousDrivingModeRef = useRef(isDrivingMode);
    const previousMarkersAreVisibleRef = useRef(markersAreVisible);
    const userLocationRef = useRef(null);
    const viewportMetricsRef = useRef(viewportMetrics);
    const { currentCameraDebugState, setPendingCameraDebugState } =
        useDeferredCameraDebugState(cameraDebugStateUpdatesEnabled);
    const [isMapReady, setIsMapReady] = useState(false);
    const [locationAccessGranted, setLocationAccessGranted] = useState(false);
    const [locationTrackingMode, setLocationTrackingMode] = useState(
        LOCATION_TRACKING_NONE,
    );
    const { findCurrentLocation, isLocating, locationError, setLocationError } =
        useCurrentLocation({
            currentCourseHeadingRef,
            isMountedRef,
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

    const scheduleMarkerLoad = useCallback(
        (bounds, delay) => {
            if (
                !bounds ||
                !isMapReadyRef.current ||
                !markersAreVisible ||
                !markerLoadsEnabledRef.current
            ) {
                return;
            }

            scheduleSharedMarkerLoad(bounds, delay);
        },
        [markersAreVisible, scheduleSharedMarkerLoad],
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
        currentCourseHeadingRef,
        currentZoomRef,
        followSpeedZoomEnabled: true,
        followViewportAnchorY,
        followViewportBottomOffset: 0,
        followViewportYRatio: AUTO_PLAY_DRIVING_CAMERA_FOLLOW_VISIBLE_Y_RATIO,
        isDrivingMode,
        isMapReadyRef,
        locationTrackingMode,
        locationTrackingModeRef,
        markerLoadsEnabledRef,
        pendingCameraStopRef,
        setTrackingMode,
        userLocationRef,
        viewportHeight: viewportMetrics.height,
    });
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

            const currentLocation = locationUpdatesEnabled
                ? await findCurrentLocation()
                : userLocationRef.current;

            if (!isActive || !isMountedRef.current || !currentLocation) {
                return;
            }

            if (isDrivingMode) {
                followLocationMode.start(currentLocation);
            } else {
                lockOnLocationMode.start(currentLocation);
            }
        }

        hydrateLocationAccess();

        return () => {
            isActive = false;
        };
    }, [
        findCurrentLocation,
        isDrivingMode,
        locationUpdatesEnabled,
        mapPreferencesAreLoaded,
        setLocationError,
    ]);

    useEffect(() => {
        if (
            locationUpdatesEnabled ||
            !locationAccessGranted ||
            !userLocation ||
            locationTrackingModeRef.current !== LOCATION_TRACKING_NONE
        ) {
            return;
        }

        if (isDrivingMode) {
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

        if (
            isDrivingMode &&
            locationTrackingModeRef.current === LOCATION_TRACKING_FOLLOW &&
            !followLocationMode.recenterIsNeeded
        ) {
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

            if (bounds) {
                latestMapBoundsRef.current = bounds;
                scheduleMarkerLoad(bounds);
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
    }, []);

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
            const nextLocation = getLocationUpdate(location);

            if (!nextLocation || !isMountedRef.current) {
                return;
            }

            const previousLocation = userLocationRef.current;
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
            }

            const nextLocationWithHeading = {
                ...nextLocation,
                ...(motionState.speed !== null
                    ? { speed: motionState.speed }
                    : {}),
                isMoving: motionState.isMoving,
                ...(currentCourseHeadingRef.current !== null
                    ? {
                          courseHeading: currentCourseHeadingRef.current,
                          heading: currentCourseHeadingRef.current,
                      }
                    : {}),
                ...(currentCompassHeadingRef.current !== null
                    ? { compassHeading: currentCompassHeadingRef.current }
                    : {}),
            };

            userLocationRef.current = nextLocationWithHeading;
            setUserLocation(nextLocationWithHeading);

            const currentTrackingMode = locationTrackingModeRef.current;

            if (
                isDrivingMode &&
                currentTrackingMode !== LOCATION_TRACKING_FOLLOW
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
    const enhancedNavigationLocationWatchEnabled =
        locationUpdatesEnabled &&
        locationAccessGranted &&
        !autoDriveSimulationIsActive &&
        mapboxNavigationEnhancedLocationIsSupported();

    useEnhancedLocationWatch({
        enabled: enhancedNavigationLocationWatchEnabled,
        foregroundService: true,
        handleUserLocationUpdate,
        isMountedRef,
    });
    useLocationWatch({
        enabled:
            locationUpdatesEnabled &&
            !enhancedNavigationLocationWatchEnabled &&
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

    const navigationCameraMode = followLocationMode.nativeCameraFollowProps
        ?.enabled
        ? 'following'
        : 'idle';
    const navigationCamera = useNavigationCamera({
        attachKey: isMapReady ? 'ready' : 'pending',
        cameraOptions: followLocationMode.nativeCameraFollowProps,
        enabled:
            enhancedNavigationLocationWatchEnabled &&
            isDrivingMode &&
            isMapReady,
        mapViewRef,
        mode: navigationCameraMode,
        surfaceId: 'android-auto',
    });
    const nativeCameraFollowProps = navigationCamera.attached
        ? {
              ...followLocationMode.nativeCameraFollowProps,
              enabled: false,
          }
        : followLocationMode.nativeCameraFollowProps;

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

    const handleLocationTrackingPress = useCallback(async () => {
        if (activeLocationMode.isActive(locationTrackingMode)) {
            activeLocationMode.stop();
            return;
        }

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

        activeLocationMode.start(currentLocation, { isUserInitiated: true });
    }, [
        activeLocationMode,
        findCurrentLocation,
        locationAccessGranted,
        locationTrackingMode,
        refreshLocationPermission,
        setLocationError,
        userLocation,
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

        followLocationMode.recenter(currentLocation, { isUserInitiated: true });
    }, [
        findCurrentLocation,
        followLocationMode,
        locationAccessGranted,
        refreshLocationPermission,
        setLocationError,
        userLocation,
    ]);

    const fitCameraToBounds = useCallback(
        (bounds, { duration = 900, padding = [88, 96, 112, 96] } = {}) => {
            if (!Array.isArray(bounds?.sw) || !Array.isArray(bounds?.ne)) {
                return false;
            }

            markerLoadsEnabledRef.current = true;
            const resolvedPadding = mergeCameraPadding(
                padding,
                getViewportCameraPadding(),
            );

            if (isDrivingMode) {
                followLocationMode.pauseUntilRecenter();
                cameraRef.current?.fitBounds(
                    bounds.sw,
                    bounds.ne,
                    getCameraPaddingArray(resolvedPadding),
                    duration,
                );
            } else {
                setTrackingMode(LOCATION_TRACKING_NONE);
                cameraRef.current?.setCamera({
                    animationDuration: duration,
                    animationMode: 'easeTo',
                    bounds: {
                        ne: bounds.ne,
                        sw: bounds.sw,
                    },
                    padding: resolvedPadding,
                    pitch: 0,
                });
            }

            return Boolean(cameraRef.current);
        },
        [
            followLocationMode,
            getViewportCameraPadding,
            isDrivingMode,
            setTrackingMode,
        ],
    );

    const handlePan = useCallback(
        (translation) => {
            const x = Number(translation?.x);
            const y = Number(translation?.y);

            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }

            markerLoadsEnabledRef.current = true;

            if (isDrivingMode) {
                followLocationMode.pauseUntilRecenter();
            } else {
                setTrackingMode(LOCATION_TRACKING_NONE);
            }

            cameraRef.current?.moveBy({
                x: x * mapGestureCoordinateScale,
                y: y * mapGestureCoordinateScale,
                animationDuration: AUTO_PLAY_PAN_ANIMATION_DURATION_MS,
                animationMode: AUTO_PLAY_CAMERA_INTERACTION_ANIMATION_MODE,
            });
        },
        [
            followLocationMode,
            isDrivingMode,
            mapGestureCoordinateScale,
            setTrackingMode,
        ],
    );

    const handleZoomGesture = useCallback(
        (center, scale) => {
            const scaleFactor = Number(scale);

            if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
                return;
            }

            markerLoadsEnabledRef.current = true;

            if (isDrivingMode) {
                followLocationMode.pauseUntilRecenter();
            } else {
                setTrackingMode(LOCATION_TRACKING_NONE);
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
        [
            followLocationMode,
            isDrivingMode,
            mapGestureCoordinateScale,
            setTrackingMode,
        ],
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
        handleCameraChanged,
        handleDrivingRecenterPress,
        handleLocationTrackingPress,
        handleMapLoaded,
        handleMarkerSourcePress,
        handlePan,
        handleZoomGesture,
        handleZoomPress,
        isFollowing,
        isLocating,
        locationAccessGranted,
        locationError,
        locationTrackingMode,
        markerShapeSourceRef,
        mapViewRef,
        enhancedNavigationLocationWatchEnabled,
        nativeCameraFollowProps,
    };
}

export function AutoPlayMapSurfaceContent({
    autoPlaySafeAreaInsets,
    colorScheme,
    id,
    platformConfig,
    windowInfo,
}) {
    const {
        applyWindowScaleToMapGestures,
        hideCompassDuringNavigation,
        ornamentSafeAreaLeftScale,
    } = {
        ...DEFAULT_AUTO_PLAY_SURFACE_PLATFORM_CONFIG,
        ...platformConfig,
    };
    const autoPlayState = useAutoPlayState();
    const isRootMapSurface = !id || id === AUTO_PLAY_ROOT_MODULE_ID;
    const fittedDirectionsRouteKeyRef = useRef('');
    const [layoutSize, setLayoutSize] = useState(null);
    const mapPreferences = useMapPreferencesState();
    const markerLoader = useMarkerLoader();
    const isDrivingMode = autoPlayState.drivingModeIsActive !== false;
    const autoPlayColorScheme = useAutoPlayColorScheme(colorScheme);
    const activeDirectionsRoute =
        autoPlayState.isNavigating && autoPlayState.directionsRoute
            ? autoPlayState.directionsRoute
            : null;
    const userLocationIsUsableForLightPreset =
        Number.isFinite(Number(mapPreferences.userLocation?.latitude)) &&
        Number.isFinite(Number(mapPreferences.userLocation?.longitude));
    // Match the phone map: resolve the user's light preset preference by time
    // of day at their location. The car host's day/night scheme is only the
    // fallback when the preference is auto and no location is available yet.
    const mapLightPresetPreference =
        mapPreferences.mapLightPresetPreference ===
            MAPBOX_STANDARD_LIGHT_PRESET_AUTO &&
        !userLocationIsUsableForLightPreset
            ? getAutoPlayMapLightPreset(autoPlayColorScheme)
            : mapPreferences.mapLightPresetPreference;
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
    const followViewportAnchorY = useMemo(
        () => getAutoPlayFollowViewportAnchorY(viewportMetrics),
        [viewportMetrics],
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
    const controller = useAutoPlayMapController({
        cameraDebugStateUpdatesEnabled:
            autoPlayCameraDebugStateUpdatesAreEnabled({
                debugOverlayVisibility,
                debugOverlaysAreVisible,
            }),
        initialCameraSettings: mapPreferences.initialCameraSettings,
        isDrivingMode,
        locationUpdatesEnabled: isRootMapSurface,
        mapGestureCoordinateScale,
        mapPreferencesAreLoaded: mapPreferences.mapPreferencesAreLoaded,
        markersAreVisible: mapPreferences.surveillanceMarkersVisible,
        scheduleSharedMarkerLoad: markerLoader.scheduleMarkerLoad,
        setUserLocation: mapPreferences.setUserLocation,
        userLocation: mapPreferences.userLocation,
        followViewportAnchorY,
        viewportMetrics,
    });
    const presentation = useMapPresentation({
        destinationCardIsOverlay: true,
        hasActiveDirectionsRoute: Boolean(activeDirectionsRoute),
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
    const policeAlertsLoader = useWazePoliceAlerts({
        policeAlertsAreEnabled: mapPreferences.policeAlertsVisible,
        userLocation: mapPreferences.userLocation,
    });
    const policeAlertFeatureCollection = useMemo(
        () =>
            makeWazePoliceAlertFeatureCollection(
                policeAlertsLoader.policeAlerts,
            ),
        [policeAlertsLoader.policeAlerts],
    );
    const directionsRouteFeatureCollection = useMemo(
        () => makeDirectionsRouteFeatureCollection(activeDirectionsRoute),
        [activeDirectionsRoute],
    );
    const directionsDebugFeatureCollection = useMemo(
        () =>
            makeDirectionsDebugFeatureCollection(
                activeDirectionsRoute,
                debugOverlaysAreVisible &&
                    debugOverlayVisibility?.[
                        DEBUG_OVERLAY_DIRECTIONS_GEOMETRY
                    ] === true,
            ),
        [
            activeDirectionsRoute,
            debugOverlayVisibility,
            debugOverlaysAreVisible,
        ],
    );
    const directionsWaypointMarkers = useMemo(
        () => makeAutoPlayDirectionsWaypointMarkers(activeDirectionsRoute),
        [activeDirectionsRoute],
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
        directionsWaypointMarkers,
        hideCompassDuringNavigation: Boolean(
            hideCompassDuringNavigation && activeDirectionsRoute,
        ),
        initialCameraSettings,
        isDrivingMode,
        mapLightPreset,
        mapPreferences,
        markerFeatureCollection,
        policeAlertFeatureCollection,
        preferredFramesPerSecond: isRootMapSurface ? 30 : 20,
        presentation,
    });
    useEffect(() => {
        if (!isRootMapSurface) {
            return undefined;
        }

        return registerAutoPlayMapControlHandlers({
            handleLocationTrackingPress: controller.drivingRecenterIsVisible
                ? controller.handleDrivingRecenterPress
                : controller.handleLocationTrackingPress,
            handlePan: controller.handlePan,
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
        controller.handleZoomGesture,
        controller.handleZoomPress,
        isRootMapSurface,
    ]);

    useEffect(() => {
        if (!isRootMapSurface) {
            return;
        }

        notifyAutoPlayMapButtonAppearance({
            isDarkMapLayer: presentation.isDarkMapLayer,
            trackingState: controller.drivingRecenterIsVisible
                ? 'recenter'
                : controller.locationTrackingMode !== LOCATION_TRACKING_NONE
                  ? 'active'
                  : 'inactive',
        });
    }, [
        controller.drivingRecenterIsVisible,
        controller.locationTrackingMode,
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
        if (
            !isDrivingMode ||
            mapPreferences.userLocation ||
            !activeDirectionsRoute
        ) {
            return;
        }

        const routeFitKey = [
            activeDirectionsRoute.requestedAt,
            activeDirectionsRoute.selectedRouteKey,
            activeDirectionsRoute.routeKey,
            activeDirectionsRoute.destination?.id,
            activeDirectionsRoute.destination?.label,
            activeDirectionsRoute.destination?.inputValue,
            viewportMetrics.key,
        ].join(':');

        if (
            routeFitKey &&
            fittedDirectionsRouteKeyRef.current === routeFitKey
        ) {
            return;
        }

        fittedDirectionsRouteKeyRef.current = routeFitKey;

        const bounds =
            activeDirectionsRoute.bounds ??
            getDirectionsRouteBounds(activeDirectionsRoute);

        controller.fitCameraToBounds(bounds);
    }, [
        activeDirectionsRoute,
        controller.fitCameraToBounds,
        isDrivingMode,
        mapPreferences.userLocation,
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
                {isRootMapSurface ? (
                    <AutoPlayMapStatusOverlay
                        activeDirectionsRoute={activeDirectionsRoute}
                        freeDriveIsActive={
                            controller.enhancedNavigationLocationWatchEnabled
                        }
                        markerLoader={markerLoader}
                        mapPreferencesAreLoaded={
                            mapPreferences.mapPreferencesAreLoaded
                        }
                        presentation={presentation}
                        userLocation={mapPreferences.userLocation}
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
