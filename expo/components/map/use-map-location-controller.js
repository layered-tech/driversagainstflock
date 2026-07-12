import { useNavigationCamera } from '@rnmapbox/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, useWindowDimensions } from 'react-native';
import {
    addAutoDriveSimulationLocationListener,
    useAutoDriveSimulationIsActive,
} from '../auto-play-drive-simulation';
import { useFollowLocationMode } from '../map-follow-location-mode';
import {
    EMPTY_CAMERA_PADDING,
    getLocationCoordinate,
    LOCATION_CAMERA_ANIMATION_DURATION_MS,
    LOCATION_CAMERA_USER_ANIMATION_DURATION_MS,
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
    LOCATION_TRACKING_FOLLOW,
    LOCATION_TRACKING_NONE,
    LOCATION_ZOOM_LEVEL,
} from '../map-location-mode-shared';
import { useLockOnLocationMode } from '../map-lock-on-location-mode';
import {
    getBoundsFitCameraStop,
    getCameraDebugState,
    getCameraDebugStateKey,
    getFlatCameraStop,
} from './camera-state';
import {
    DEFAULT_ZOOM_LEVEL,
    PLACE_RESULT_CAMERA_ANIMATION_DURATION_MS,
    PLACE_RESULT_ZOOM_LEVEL,
} from './constants';
import {
    getDrivingMotionState,
    getLocationWithDrivingMotionState,
} from './driving-motion-state';
import {
    clampZoomLevel,
    getBoundsFromCameraState,
    getDirectionDeltaDegrees,
    getLocationCourseHeading,
    getLocationUpdate,
    getSmoothedCourseHeading,
    getStoredNumber,
    normalizeDirectionDegrees,
    normalizeLongitude,
} from './geo';
import { shouldUseDeviceLocationWatch } from './location-watch-options';
import { getPlaceCoordinate } from './place-formatters';
import { useDeferredCameraDebugState } from './use-deferred-camera-debug-state';
import {
    mapboxNavigationEnhancedLocationIsSupported,
    useCurrentLocation,
    useEnhancedLocationWatch,
    useForegroundEnhancedLocationWatchIsActive,
    useHeadingWatch,
    useLocationWatch,
} from './use-device-location';
import { useDrivingModeExitCameraRetry } from './use-driving-mode-exit-camera-retry';
import { useLocationPermissionFlow } from './use-location-permission-flow';
import { useMapBoundsState } from './use-map-bounds-state';

const MARKER_FOCUS_CAMERA_ANIMATION_DURATION_MS = 900;
const MARKER_FOCUS_ZOOM_LEVEL = 16;
const MAP_BEARING_STATE_UPDATE_EPSILON_DEGREES = 1;
const ZOOM_LEVEL_STATE_UPDATE_EPSILON = 0.01;

export function useMapLocationController({
    cameraFocusPadding = EMPTY_CAMERA_PADDING,
    cameraDebugStateUpdatesEnabled = false,
    drivingCameraFollowViewportBottomOffset,
    drivingCameraFollowViewportYRatio,
    initialCameraSettings,
    isDrivingMode,
    lockOnLocationUpdateAnimationDurationRef,
    mapBearingUpdatesEnabled = false,
    mapPreferencesAreLoaded,
    markersAreVisible = true,
    scheduleSharedMarkerLoad,
    screenIsFocused = true,
    setUserLocation,
    userLocation,
}) {
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const bottomSheetRef = useRef(null);
    const cameraRef = useRef(null);
    const closeTimeoutRef = useRef(null);
    const currentCompassHeadingRef = useRef(null);
    const currentCourseHeadingRef = useRef(null);
    const currentMapBearingRef = useRef(0);
    const currentZoomRef = useRef(DEFAULT_ZOOM_LEVEL);
    const isMapReadyRef = useRef(false);
    const isMountedRef = useRef(false);
    const locationTrackingModeRef = useRef(LOCATION_TRACKING_NONE);
    const markerLoadsEnabledRef = useRef(false);
    const mapPreferencesHydrationHasAppliedRef = useRef(false);
    const markerShapeSourceRef = useRef(null);
    const mapViewRef = useRef(null);
    const latestCameraSettingsRef = useRef(initialCameraSettings);
    const latestMapBoundsRef = useRef(null);
    const pendingCameraStopRef = useRef(null);
    const previousDrivingModeRef = useRef(isDrivingMode);
    const previousMarkersAreVisibleRef = useRef(markersAreVisible);
    const publishedMapBearingRef = useRef(0);
    const userLocationRef = useRef(null);
    const { currentCameraDebugState, setPendingCameraDebugState } =
        useDeferredCameraDebugState(cameraDebugStateUpdatesEnabled);
    const {
        clearDrivingModeExitCameraRetry,
        consumeDrivingModeExitCameraRetry,
        markDrivingModeExitCameraRetryWindowStarted,
        scheduleDrivingModeExitCameraRetry,
    } = useDrivingModeExitCameraRetry({ cameraRef, isMapReadyRef });
    const {
        cancelCurrentMapBoundsUpdate,
        currentMapBounds,
        handleCurrentMapBoundsUpdate,
    } = useMapBoundsState();
    const [appStateIsActive, setAppStateIsActive] = useState(
        AppState.currentState === null || AppState.currentState === 'active',
    );
    const [currentMapBearing, setCurrentMapBearing] = useState(0);
    const [isMapReady, setIsMapReady] = useState(false);
    const [locationTrackingMode, setLocationTrackingMode] = useState(
        LOCATION_TRACKING_NONE,
    );
    const [remountCameraSettings, setRemountCameraSettings] = useState(
        initialCameraSettings,
    );
    const { findCurrentLocation, isLocating, locationError, setLocationError } =
        useCurrentLocation({
            currentCourseHeadingRef,
            isMountedRef,
            setUserLocation,
        });
    const phoneLocationUpdatesAreEnabled = screenIsFocused && appStateIsActive;

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (appState) => {
            const isActive = appState === 'active';

            setAppStateIsActive(isActive);
        });

        return () => subscription.remove();
    }, []);

    useEffect(() => {
        locationTrackingModeRef.current = locationTrackingMode;
    }, [locationTrackingMode]);

    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);

    useEffect(() => {
        if (!initialCameraSettings || isMapReadyRef.current) {
            return;
        }

        latestCameraSettingsRef.current = initialCameraSettings;
        setRemountCameraSettings(initialCameraSettings);
    }, [initialCameraSettings]);

    useEffect(() => {
        if (screenIsFocused) {
            return;
        }

        isMapReadyRef.current = false;
        setIsMapReady(false);
        setRemountCameraSettings(latestCameraSettingsRef.current);
    }, [screenIsFocused]);

    useEffect(() => {
        if (!mapBearingUpdatesEnabled) {
            return;
        }

        publishedMapBearingRef.current = currentMapBearingRef.current;
        setCurrentMapBearing(currentMapBearingRef.current);
    }, [mapBearingUpdatesEnabled]);

    const setTrackingMode = useCallback((nextMode) => {
        locationTrackingModeRef.current = nextMode;
        setLocationTrackingMode(nextMode);
    }, []);

    useEffect(() => {
        const wasDrivingMode = previousDrivingModeRef.current;

        previousDrivingModeRef.current = isDrivingMode;

        if (!wasDrivingMode || isDrivingMode) {
            return;
        }

        setTrackingMode(LOCATION_TRACKING_NONE);
        markDrivingModeExitCameraRetryWindowStarted();

        const cameraStop = {
            animationDuration: LOCATION_CAMERA_ANIMATION_DURATION_MS,
            animationMode: 'easeTo',
            padding: EMPTY_CAMERA_PADDING,
            pitch: 0,
        };

        if (isMapReadyRef.current && cameraRef.current) {
            cameraRef.current.setCamera(cameraStop);
            scheduleDrivingModeExitCameraRetry(cameraStop);
            return;
        }

        pendingCameraStopRef.current = {
            camera: cameraStop,
            enableMarkerLoads: false,
        };
    }, [
        isDrivingMode,
        markDrivingModeExitCameraRetryWindowStarted,
        scheduleDrivingModeExitCameraRetry,
        setTrackingMode,
    ]);

    useEffect(() => {
        if (
            !mapPreferencesAreLoaded ||
            mapPreferencesHydrationHasAppliedRef.current
        ) {
            return;
        }

        mapPreferencesHydrationHasAppliedRef.current = true;

        const initialZoomLevel = getStoredNumber(
            initialCameraSettings?.zoomLevel,
        );

        if (initialZoomLevel !== null) {
            currentZoomRef.current = initialZoomLevel;
        }

        if (
            userLocation &&
            initialZoomLevel !== null &&
            initialZoomLevel >= LOCATION_ZOOM_LEVEL
        ) {
            markerLoadsEnabledRef.current = true;
        }
    }, [
        initialCameraSettings?.zoomLevel,
        mapPreferencesAreLoaded,
        userLocation,
    ]);

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

    const moveCameraToUser = useCallback((location, options = {}) => {
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
            cameraRef.current.setCamera(getFlatCameraStop(cameraStop));
            return;
        }

        pendingCameraStopRef.current = {
            camera: getFlatCameraStop(cameraStop),
            enableMarkerLoads: true,
        };
    }, []);

    const lockOnLocationMode = useLockOnLocationMode({
        cameraRef,
        clampZoomLevel,
        currentZoomRef,
        isMapReadyRef,
        locationUpdateAnimationDurationRef:
            lockOnLocationUpdateAnimationDurationRef,
        markerLoadsEnabledRef,
        moveCameraToUser,
        pendingCameraStopRef,
        setTrackingMode,
    });
    const followLocationMode = useFollowLocationMode({
        cameraRef,
        clampZoomLevel,
        currentCourseHeadingRef,
        currentZoomRef,
        followSpeedZoomEnabled: true,
        followViewportBottomOffset: drivingCameraFollowViewportBottomOffset,
        followViewportYRatio: drivingCameraFollowViewportYRatio,
        isDrivingMode,
        isMapReadyRef,
        locationTrackingMode,
        locationTrackingModeRef,
        markerLoadsEnabledRef,
        pendingCameraStopRef,
        setTrackingMode,
        userLocationRef,
    });
    const activeLocationMode = isDrivingMode
        ? followLocationMode
        : lockOnLocationMode;
    const startActiveLocationModeAfterPermissionGrant =
        activeLocationMode.startAfterPermissionGrant;
    const startLocationModeAfterPermissionGrant = useCallback(
        (location) => {
            startActiveLocationModeAfterPermissionGrant(location);
        },
        [startActiveLocationModeAfterPermissionGrant],
    );

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
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            clearDrivingModeExitCameraRetry();
            cancelCurrentMapBoundsUpdate();
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
            }
        };
    }, [cancelCurrentMapBoundsUpdate, clearDrivingModeExitCameraRetry]);

    const {
        isRequestingLocation,
        locationAccessGranted,
        permissionError,
        requestLocationAccess,
        retryCurrentLocation,
    } = useLocationPermissionFlow({
        bottomSheetRef,
        closeTimeoutRef,
        findCurrentLocation,
        isDrivingMode,
        isMountedRef,
        mapPreferencesAreLoaded,
        startLocationModeAfterPermissionGrant,
    });

    const moveCameraToPlace = useCallback(
        (place) => {
            const centerCoordinate = getPlaceCoordinate(place);

            if (!centerCoordinate) {
                return false;
            }

            const nextZoomLevel = clampZoomLevel(PLACE_RESULT_ZOOM_LEVEL);
            const cameraStop = {
                centerCoordinate,
                zoomLevel: nextZoomLevel,
                animationDuration: PLACE_RESULT_CAMERA_ANIMATION_DURATION_MS,
                animationMode: 'flyTo',
            };

            markerLoadsEnabledRef.current = true;
            currentZoomRef.current = nextZoomLevel;

            if (isDrivingMode) {
                followLocationMode.pauseUntilRecenter();
            } else {
                setTrackingMode(LOCATION_TRACKING_NONE);
            }

            const resolvedCameraStop = isDrivingMode
                ? cameraStop
                : getFlatCameraStop(cameraStop, cameraFocusPadding);
            const retryAfterDrivingModeExit =
                !isDrivingMode && consumeDrivingModeExitCameraRetry();

            if (isMapReadyRef.current && cameraRef.current) {
                cameraRef.current.setCamera(resolvedCameraStop);
                if (retryAfterDrivingModeExit) {
                    scheduleDrivingModeExitCameraRetry(resolvedCameraStop);
                }
                return true;
            }

            pendingCameraStopRef.current = {
                camera: resolvedCameraStop,
                enableMarkerLoads: true,
            };

            return true;
        },
        [
            consumeDrivingModeExitCameraRetry,
            cameraFocusPadding,
            followLocationMode,
            isDrivingMode,
            scheduleDrivingModeExitCameraRetry,
            setTrackingMode,
        ],
    );

    const moveCameraToCoordinate = useCallback(
        (coordinate) => {
            if (!Array.isArray(coordinate) || coordinate.length < 2) {
                return false;
            }

            const longitude = getStoredNumber(coordinate[0]);
            const latitude = getStoredNumber(coordinate[1]);

            if (
                longitude === null ||
                latitude === null ||
                latitude < -90 ||
                latitude > 90
            ) {
                return false;
            }

            const nextZoomLevel = clampZoomLevel(MARKER_FOCUS_ZOOM_LEVEL);
            const cameraStop = {
                centerCoordinate: [normalizeLongitude(longitude), latitude],
                zoomLevel: nextZoomLevel,
                animationDuration: MARKER_FOCUS_CAMERA_ANIMATION_DURATION_MS,
                animationMode: 'flyTo',
            };

            markerLoadsEnabledRef.current = true;
            currentZoomRef.current = nextZoomLevel;

            if (isDrivingMode) {
                followLocationMode.pauseUntilRecenter();
            } else {
                setTrackingMode(LOCATION_TRACKING_NONE);
            }

            const resolvedCameraStop = isDrivingMode
                ? cameraStop
                : getFlatCameraStop(cameraStop, cameraFocusPadding);

            if (isMapReadyRef.current && cameraRef.current) {
                cameraRef.current.setCamera(resolvedCameraStop);
                return true;
            }

            pendingCameraStopRef.current = {
                camera: resolvedCameraStop,
                enableMarkerLoads: true,
            };

            return true;
        },
        [
            cameraFocusPadding,
            followLocationMode,
            isDrivingMode,
            setTrackingMode,
        ],
    );

    const handleCameraChanged = useCallback(
        (state) => {
            const previousZoomLevel = currentZoomRef.current;
            const nextZoomLevel = state?.properties?.zoom;
            const nextCameraDebugState = cameraDebugStateUpdatesEnabled
                ? getCameraDebugState(state)
                : null;
            const nextBearing = getStoredNumber(
                state?.properties?.heading ?? state?.properties?.bearing,
            );
            const nextCenter = state?.properties?.center;
            const nextPitch = getStoredNumber(state?.properties?.pitch);
            let zoomLevelChanged = false;

            if (
                Array.isArray(nextCenter) &&
                nextCenter.length >= 2 &&
                Number.isFinite(nextZoomLevel)
            ) {
                latestCameraSettingsRef.current = {
                    centerCoordinate: [...nextCenter],
                    heading: nextBearing ?? 0,
                    pitch: nextPitch ?? 0,
                    zoomLevel: nextZoomLevel,
                };
            }

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

            if (nextBearing !== null) {
                const normalizedBearing =
                    normalizeDirectionDegrees(nextBearing);

                currentMapBearingRef.current = normalizedBearing;

                if (
                    mapBearingUpdatesEnabled &&
                    Math.abs(
                        getDirectionDeltaDegrees(
                            publishedMapBearingRef.current,
                            normalizedBearing,
                        ),
                    ) > MAP_BEARING_STATE_UPDATE_EPSILON_DEGREES
                ) {
                    publishedMapBearingRef.current = normalizedBearing;
                    setCurrentMapBearing(normalizedBearing);
                }
            }

            if (state?.gestures?.isGestureActive) {
                markerLoadsEnabledRef.current = true;
            }

            const bounds = getBoundsFromCameraState(state);

            if (bounds) {
                latestMapBoundsRef.current = bounds;
                handleCurrentMapBoundsUpdate(bounds);
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
            handleCurrentMapBoundsUpdate,
            isDrivingMode,
            mapBearingUpdatesEnabled,
            scheduleMarkerLoad,
            setPendingCameraDebugState,
            setTrackingMode,
        ],
    );

    const handleMapLoaded = useCallback(() => {
        isMapReadyRef.current = true;
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
    const foregroundEnhancedLocationWatchIsActive =
        useForegroundEnhancedLocationWatchIsActive();
    // While the Android Auto auto-drive simulation is running, real device fixes
    // would fight the simulated route positions through the shared map
    // preferences sync, so the simulation becomes the only location source.
    const autoDriveSimulationIsActive = useAutoDriveSimulationIsActive();
    const enhancedNavigationLocationWatchEnabled =
        phoneLocationUpdatesAreEnabled &&
        locationAccessGranted &&
        !autoDriveSimulationIsActive &&
        mapboxNavigationEnhancedLocationIsSupported() &&
        (isDrivingMode || foregroundEnhancedLocationWatchIsActive);

    useEnhancedLocationWatch({
        enabled: enhancedNavigationLocationWatchEnabled,
        handleUserLocationUpdate,
        isMountedRef,
    });
    useLocationWatch({
        enabled: shouldUseDeviceLocationWatch({
            autoDriveSimulationIsActive,
            enhancedNavigationLocationWatchEnabled,
            phoneLocationUpdatesAreEnabled,
        }),
        handleUserLocationUpdate,
        isDrivingMode,
        isLocationTrackingActive:
            locationTrackingMode !== LOCATION_TRACKING_NONE,
        isMountedRef,
        locationAccessGranted,
        setLocationError,
    });

    useEffect(() => {
        if (!phoneLocationUpdatesAreEnabled || !autoDriveSimulationIsActive) {
            return undefined;
        }

        return addAutoDriveSimulationLocationListener(handleUserLocationUpdate);
    }, [
        autoDriveSimulationIsActive,
        handleUserLocationUpdate,
        phoneLocationUpdatesAreEnabled,
    ]);
    useHeadingWatch({
        handleHeadingUpdate: handleCompassHeadingUpdate,
        isDrivingMode:
            phoneLocationUpdatesAreEnabled &&
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
            isMapReady &&
            phoneLocationUpdatesAreEnabled,
        mapViewRef,
        mode: navigationCameraMode,
        surfaceId: 'android-driving-mode',
    });
    const nativeCameraFollowProps = navigationCamera.attached
        ? {
              ...followLocationMode.nativeCameraFollowProps,
              enabled: false,
          }
        : followLocationMode.nativeCameraFollowProps;

    const handleZoomPress = useCallback(
        (zoomDelta) => {
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

            const cameraStop = {
                zoomLevel: nextZoomLevel,
                animationDuration:
                    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
                animationMode: 'easeTo',
            };

            cameraRef.current?.setCamera(
                isDrivingMode ? cameraStop : getFlatCameraStop(cameraStop),
            );
        },
        [activeLocationMode, isDrivingMode, locationTrackingMode, userLocation],
    );

    const handleMarkerSourcePress = useCallback(
        async (event) => {
            const feature = event?.features?.[0];

            if (!feature?.properties?.cluster) {
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
                    isDrivingMode ? cameraStop : getFlatCameraStop(cameraStop),
                );
            } catch {
                // Clusters are still useful without tap-to-expand if Mapbox cannot resolve this feature.
            }
        },
        [followLocationMode, isDrivingMode, setTrackingMode],
    );

    const handleLocationTrackingPress = useCallback(async () => {
        if (activeLocationMode.isActive(locationTrackingMode)) {
            if (activeLocationMode.orientNorthUp?.(userLocation)) {
                return;
            }

            activeLocationMode.stop();
            return;
        }

        if (!locationAccessGranted) {
            bottomSheetRef.current?.present();
            return;
        }

        const currentLocation = (await findCurrentLocation()) ?? userLocation;

        if (!currentLocation) {
            bottomSheetRef.current?.present();
            return;
        }

        activeLocationMode.start(currentLocation, { isUserInitiated: true });
    }, [
        activeLocationMode,
        findCurrentLocation,
        locationAccessGranted,
        locationTrackingMode,
        userLocation,
    ]);

    const handleDrivingRecenterPress = useCallback(async () => {
        if (!locationAccessGranted) {
            bottomSheetRef.current?.present();
            return;
        }

        const currentLocation = userLocation ?? (await findCurrentLocation());

        if (!currentLocation) {
            bottomSheetRef.current?.present();
            return;
        }

        followLocationMode.recenter(currentLocation, { isUserInitiated: true });
    }, [
        findCurrentLocation,
        followLocationMode,
        locationAccessGranted,
        userLocation,
    ]);

    const fitCameraToBounds = useCallback(
        (bounds, { duration = 1200, padding = [180, 36, 280, 36] } = {}) => {
            const cameraStop = getBoundsFitCameraStop({
                bounds,
                duration,
                padding,
                viewportHeight: windowHeight,
                viewportWidth: windowWidth,
            });

            if (!cameraStop) {
                return false;
            }

            if (isDrivingMode) {
                followLocationMode.pauseUntilRecenter();
            } else {
                setTrackingMode(LOCATION_TRACKING_NONE);
            }

            markerLoadsEnabledRef.current = true;
            currentZoomRef.current = cameraStop.zoomLevel;

            cameraRef.current?.setCamera(cameraStop);

            return Boolean(cameraRef.current);
        },
        [
            followLocationMode,
            isDrivingMode,
            setTrackingMode,
            windowHeight,
            windowWidth,
        ],
    );

    const isFollowing = locationTrackingMode === LOCATION_TRACKING_FOLLOW;
    const drivingRecenterIsVisible =
        isDrivingMode &&
        isFollowing &&
        followLocationMode.recenterActionIsNeeded;

    return {
        appStateIsActive,
        bottomSheetRef,
        currentCameraDebugState,
        currentMapBearing,
        currentMapBounds,
        cameraRef,
        drivingRecenterIsVisible,
        findCurrentLocation,
        followLocationMode,
        fitCameraToBounds,
        handleCameraChanged,
        handleDrivingRecenterPress,
        handleLocationTrackingPress,
        handleMapLoaded,
        handleMarkerSourcePress,
        handleZoomPress,
        isFollowing,
        isLocating,
        isMapReady,
        isMountedRef,
        isRequestingLocation,
        locationAccessGranted,
        locationError,
        locationTrackingMode,
        markerShapeSourceRef,
        mapViewRef,
        moveCameraToCoordinate,
        moveCameraToPlace,
        nativeCameraFollowProps,
        permissionError,
        remountCameraSettings,
        requestLocationAccess,
        retryCurrentLocation,
    };
}
