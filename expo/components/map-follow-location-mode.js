import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from '../lib/safe-area-insets';
import {
    EMPTY_CAMERA_PADDING,
    getCameraPadding,
    getLocationCoordinate,
    LOCATION_CAMERA_USER_ANIMATION_DURATION_MS,
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
    LOCATION_TRACKING_FOLLOW,
    LOCATION_TRACKING_NONE,
    LOCATION_ZOOM_LEVEL,
} from './map-location-mode-shared';
import {
    DRIVING_DESTINATION_CAMERA_GAP,
    DRIVING_DESTINATION_SURFACE_HEIGHT,
} from './map/constants';
import { getFollowCameraPadding } from './map/follow-camera-padding';

const LOCATION_FOLLOW_CAMERA_PITCH = 55;
const LOCATION_FOLLOW_ANIMATION_DURATION_MS = 220;
const LOCATION_FOLLOW_NATIVE_ACTIVATION_BUFFER_MS = 80;
const DEFAULT_LOCATION_FOLLOW_VIEWPORT_Y_RATIO = 0.8;
const DEFAULT_LOCATION_FOLLOW_VIEWPORT_BOTTOM_OFFSET =
    DRIVING_DESTINATION_SURFACE_HEIGHT + DRIVING_DESTINATION_CAMERA_GAP;
const LOCATION_FOLLOW_MIN_VIEWPORT_Y_RATIO = 0.5;
const LOCATION_FOLLOW_MAX_VIEWPORT_Y_RATIO = 0.95;
const LOCATION_FOLLOW_MAX_TOP_PADDING_RATIO = 0.95;
const LOCATION_FOLLOW_SPEED_ZOOM_UPDATE_EPSILON = 0.05;
const METERS_PER_SECOND_PER_MPH = 0.44704;
const RECENTER_REASON_AWAY = 'away';
const LOCATION_FOLLOW_SPEED_ZOOM_LEVELS = [
    { speedMph: 25, zoomLevel: 19 },
    { speedMph: 30, zoomLevel: 18.25 },
    { speedMph: 35, zoomLevel: 17.5 },
    { speedMph: 40, zoomLevel: 16.75 },
    { speedMph: 45, zoomLevel: 16 },
    { speedMph: 50, zoomLevel: 15.25 },
    { speedMph: 55, zoomLevel: 14.5 },
    { speedMph: 65, zoomLevel: 13.75 },
];

function clampViewportYRatio(value) {
    if (!Number.isFinite(value)) {
        return DEFAULT_LOCATION_FOLLOW_VIEWPORT_Y_RATIO;
    }

    return Math.max(
        LOCATION_FOLLOW_MIN_VIEWPORT_Y_RATIO,
        Math.min(value, LOCATION_FOLLOW_MAX_VIEWPORT_Y_RATIO),
    );
}

function getNonNegativeNumber(value, fallback) {
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function getFollowSpeedZoomLevel(speed, clampZoomLevel) {
    const firstLevel = LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[0];
    const lastLevel =
        LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[
            LOCATION_FOLLOW_SPEED_ZOOM_LEVELS.length - 1
        ];

    if (!Number.isFinite(speed)) {
        return clampZoomLevel(firstLevel.zoomLevel);
    }

    const speedMph = Math.max(0, speed / METERS_PER_SECOND_PER_MPH);

    if (speedMph <= firstLevel.speedMph) {
        return clampZoomLevel(firstLevel.zoomLevel);
    }

    for (
        let index = 1;
        index < LOCATION_FOLLOW_SPEED_ZOOM_LEVELS.length;
        index += 1
    ) {
        const previousLevel = LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[index - 1];
        const nextLevel = LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[index];

        if (speedMph <= nextLevel.speedMph) {
            const speedRange = nextLevel.speedMph - previousLevel.speedMph;
            const speedRatio = (speedMph - previousLevel.speedMph) / speedRange;
            const zoomRange = nextLevel.zoomLevel - previousLevel.zoomLevel;

            return clampZoomLevel(
                previousLevel.zoomLevel + zoomRange * speedRatio,
            );
        }
    }

    return clampZoomLevel(lastLevel.zoomLevel);
}

export function useFollowLocationMode({
    cameraRef,
    cameraViewportInsets,
    clampZoomLevel,
    currentCourseHeadingRef,
    currentZoomRef,
    followSpeedZoomEnabled = false,
    followViewportAnchorY,
    followViewportYRatio,
    followViewportBottomOffset = DEFAULT_LOCATION_FOLLOW_VIEWPORT_BOTTOM_OFFSET,
    isDrivingMode,
    isMapReadyRef,
    locationTrackingMode,
    locationTrackingModeRef,
    markerLoadsEnabledRef,
    pendingCameraStopRef,
    setTrackingMode,
    userLocationRef,
    viewportHeight,
}) {
    const { height: windowHeight } = useWindowDimensions();
    const cameraViewportHeight =
        Number.isFinite(viewportHeight) && viewportHeight > 0
            ? viewportHeight
            : windowHeight;
    const resolvedFollowViewportBottomOffset = getNonNegativeNumber(
        followViewportBottomOffset,
        DEFAULT_LOCATION_FOLLOW_VIEWPORT_BOTTOM_OFFSET,
    );
    const insets = useSafeAreaInsets();
    const recenterReasonRef = useRef(null);
    const recenterIsNeededRef = useRef(false);
    const nativeFollowActivationIsSuspendedRef = useRef(false);
    const nativeFollowActivationTimeoutRef = useRef(null);
    const nativeFollowZoomLevelRef = useRef(LOCATION_ZOOM_LEVEL);
    const pendingUserCameraFrameRef = useRef(null);
    const pendingUserCameraTimeoutRef = useRef(null);
    const userZoomOverrideIsActiveRef = useRef(false);
    const [
        nativeFollowActivationIsSuspended,
        setNativeFollowActivationIsSuspendedState,
    ] = useState(false);
    const [nativeFollowZoomLevel, setNativeFollowZoomLevelState] =
        useState(LOCATION_ZOOM_LEVEL);
    const [recenterIsNeeded, setRecenterIsNeeded] = useState(false);
    const [userZoomOverrideIsActive, setUserZoomOverrideIsActive] =
        useState(false);
    const resolvedFollowViewportYRatio =
        clampViewportYRatio(followViewportYRatio);
    const viewportCameraPadding = useMemo(() => {
        if (cameraViewportInsets) {
            return getCameraPadding(cameraViewportInsets);
        }

        return {
            ...EMPTY_CAMERA_PADDING,
            paddingBottom: insets.bottom,
        };
    }, [cameraViewportInsets, insets.bottom]);
    const followCameraPadding = useMemo(() => {
        return getFollowCameraPadding({
            followViewportAnchorY,
            followViewportBottomOffset: resolvedFollowViewportBottomOffset,
            followViewportYRatio: resolvedFollowViewportYRatio,
            maxTopPaddingRatio: LOCATION_FOLLOW_MAX_TOP_PADDING_RATIO,
            viewportHeight: cameraViewportHeight,
            viewportInsets: viewportCameraPadding,
        });
    }, [
        cameraViewportHeight,
        followViewportAnchorY,
        resolvedFollowViewportBottomOffset,
        resolvedFollowViewportYRatio,
        viewportCameraPadding,
    ]);
    const setNativeFollowZoomLevel = useCallback((nextZoomLevel) => {
        nativeFollowZoomLevelRef.current = nextZoomLevel;
        setNativeFollowZoomLevelState(nextZoomLevel);
    }, []);
    const setRecenterReason = useCallback((nextReason) => {
        const nextRecenterIsNeeded = nextReason !== null;

        recenterReasonRef.current = nextReason;

        if (recenterIsNeededRef.current === nextRecenterIsNeeded) {
            return;
        }

        recenterIsNeededRef.current = nextRecenterIsNeeded;
        setRecenterIsNeeded(nextRecenterIsNeeded);
    }, []);
    const setRecenterNeeded = useCallback(
        (nextValue) => {
            setRecenterReason(nextValue ? RECENTER_REASON_AWAY : null);
        },
        [setRecenterReason],
    );
    const setNativeFollowActivationSuspended = useCallback((nextValue) => {
        if (nativeFollowActivationIsSuspendedRef.current === nextValue) {
            return;
        }

        nativeFollowActivationIsSuspendedRef.current = nextValue;
        setNativeFollowActivationIsSuspendedState(nextValue);
    }, []);
    const clearNativeFollowActivationTimeout = useCallback(() => {
        if (nativeFollowActivationTimeoutRef.current === null) {
            return;
        }

        clearTimeout(nativeFollowActivationTimeoutRef.current);
        nativeFollowActivationTimeoutRef.current = null;
    }, []);
    const clearNativeFollowActivationSuspension = useCallback(() => {
        clearNativeFollowActivationTimeout();
        setNativeFollowActivationSuspended(false);
    }, [
        clearNativeFollowActivationTimeout,
        setNativeFollowActivationSuspended,
    ]);
    const suspendNativeFollowActivation = useCallback(
        (animationDuration) => {
            clearNativeFollowActivationTimeout();
            setNativeFollowActivationSuspended(true);

            nativeFollowActivationTimeoutRef.current = setTimeout(() => {
                nativeFollowActivationTimeoutRef.current = null;
                setNativeFollowActivationSuspended(false);
            }, animationDuration + LOCATION_FOLLOW_NATIVE_ACTIVATION_BUFFER_MS);
        },
        [
            clearNativeFollowActivationTimeout,
            setNativeFollowActivationSuspended,
        ],
    );
    const clearPendingUserCameraUpdate = useCallback(() => {
        if (pendingUserCameraFrameRef.current !== null) {
            cancelAnimationFrame(pendingUserCameraFrameRef.current);
            pendingUserCameraFrameRef.current = null;
        }

        if (pendingUserCameraTimeoutRef.current !== null) {
            clearTimeout(pendingUserCameraTimeoutRef.current);
            pendingUserCameraTimeoutRef.current = null;
        }
    }, []);
    const getFollowZoomLevel = useCallback(
        (location) =>
            followSpeedZoomEnabled
                ? getFollowSpeedZoomLevel(
                      Number(location?.speed),
                      clampZoomLevel,
                  )
                : clampZoomLevel(LOCATION_ZOOM_LEVEL),
        [clampZoomLevel, followSpeedZoomEnabled],
    );
    const syncNativeFollowZoomLevel = useCallback(
        (location, { force = false } = {}) => {
            if (userZoomOverrideIsActiveRef.current && !force) {
                return nativeFollowZoomLevelRef.current;
            }

            const nextZoomLevel = getFollowZoomLevel(location);

            if (
                !force &&
                Math.abs(nativeFollowZoomLevelRef.current - nextZoomLevel) <
                    LOCATION_FOLLOW_SPEED_ZOOM_UPDATE_EPSILON
            ) {
                return nativeFollowZoomLevelRef.current;
            }

            setNativeFollowZoomLevel(nextZoomLevel);
            currentZoomRef.current = nextZoomLevel;

            return nextZoomLevel;
        },
        [currentZoomRef, getFollowZoomLevel, setNativeFollowZoomLevel],
    );
    const setUserZoomOverride = useCallback(
        (nextZoomLevel) => {
            userZoomOverrideIsActiveRef.current = true;
            setUserZoomOverrideIsActive(true);
            setNativeFollowZoomLevel(clampZoomLevel(nextZoomLevel));
            currentZoomRef.current = clampZoomLevel(nextZoomLevel);
        },
        [clampZoomLevel, currentZoomRef, setNativeFollowZoomLevel],
    );
    const clearUserZoomOverride = useCallback(() => {
        userZoomOverrideIsActiveRef.current = false;
        setUserZoomOverrideIsActive(false);
    }, []);
    const nativeCameraFollowProps = useMemo(
        () => ({
            enabled:
                isDrivingMode &&
                locationTrackingMode === LOCATION_TRACKING_FOLLOW &&
                !recenterIsNeeded &&
                !nativeFollowActivationIsSuspended,
            padding: followCameraPadding,
            pitch: LOCATION_FOLLOW_CAMERA_PITCH,
            zoomLevel: nativeFollowZoomLevel,
        }),
        [
            followCameraPadding,
            isDrivingMode,
            locationTrackingMode,
            nativeFollowActivationIsSuspended,
            nativeFollowZoomLevel,
            recenterIsNeeded,
        ],
    );

    const applyCameraStop = useCallback(
        (cameraStop, { enableMarkerLoads = true } = {}) => {
            if (enableMarkerLoads) {
                markerLoadsEnabledRef.current = true;
            }

            if (typeof cameraStop.zoomLevel === 'number') {
                currentZoomRef.current = cameraStop.zoomLevel;
            }

            if (isMapReadyRef.current && cameraRef.current) {
                cameraRef.current.setCamera(cameraStop);
                return;
            }

            pendingCameraStopRef.current = {
                camera: cameraStop,
                enableMarkerLoads,
            };
        },
        [
            cameraRef,
            currentZoomRef,
            isMapReadyRef,
            markerLoadsEnabledRef,
            pendingCameraStopRef,
        ],
    );

    const updateCamera = useCallback(
        (
            location,
            heading = currentCourseHeadingRef.current,
            animationDuration = LOCATION_FOLLOW_ANIMATION_DURATION_MS,
            options = {},
        ) => {
            if (!location) {
                return;
            }

            const nextZoomLevel =
                typeof options.zoomLevel === 'number'
                    ? options.zoomLevel
                    : null;
            const cameraStop = {
                centerCoordinate: getLocationCoordinate(location),
                padding: followCameraPadding,
                pitch: LOCATION_FOLLOW_CAMERA_PITCH,
                animationDuration,
                animationMode: options.animationMode || 'easeTo',
            };

            if (nextZoomLevel !== null) {
                cameraStop.zoomLevel = nextZoomLevel;
            }

            if (heading !== null) {
                cameraStop.heading = heading;
            }

            applyCameraStop(cameraStop);
        },
        [applyCameraStop, currentCourseHeadingRef, followCameraPadding],
    );
    const scheduleUserInitiatedCameraUpdate = useCallback(
        (applyCameraUpdate) => {
            clearPendingUserCameraUpdate();

            pendingUserCameraFrameRef.current = requestAnimationFrame(() => {
                pendingUserCameraFrameRef.current = null;
                pendingUserCameraTimeoutRef.current = setTimeout(() => {
                    pendingUserCameraTimeoutRef.current = null;
                    applyCameraUpdate();
                }, 0);
            });
        },
        [clearPendingUserCameraUpdate],
    );
    const updateFollowCamera = useCallback(
        (
            location,
            heading = currentCourseHeadingRef.current,
            {
                animationDuration = LOCATION_FOLLOW_ANIMATION_DURATION_MS,
                isUserInitiated = false,
                zoomLevel,
            } = {},
        ) => {
            const cameraOptions = {
                animationMode: 'easeTo',
            };

            if (typeof zoomLevel === 'number') {
                cameraOptions.zoomLevel = zoomLevel;
            }

            if (!isUserInitiated) {
                clearPendingUserCameraUpdate();
                clearNativeFollowActivationSuspension();
                updateCamera(
                    location,
                    heading,
                    animationDuration,
                    cameraOptions,
                );
                return;
            }

            suspendNativeFollowActivation(animationDuration);
            scheduleUserInitiatedCameraUpdate(() => {
                updateCamera(
                    location,
                    heading,
                    animationDuration,
                    cameraOptions,
                );
            });
        },
        [
            clearNativeFollowActivationSuspension,
            clearPendingUserCameraUpdate,
            currentCourseHeadingRef,
            scheduleUserInitiatedCameraUpdate,
            suspendNativeFollowActivation,
            updateCamera,
        ],
    );

    const start = useCallback(
        (location, { isUserInitiated = false } = {}) => {
            if (!location) {
                return;
            }

            setRecenterNeeded(false);
            setTrackingMode(LOCATION_TRACKING_FOLLOW);
            clearUserZoomOverride();
            const nextZoomLevel = syncNativeFollowZoomLevel(location, {
                force: true,
            });

            updateFollowCamera(location, currentCourseHeadingRef.current, {
                animationDuration: isUserInitiated
                    ? LOCATION_CAMERA_USER_ANIMATION_DURATION_MS
                    : LOCATION_FOLLOW_ANIMATION_DURATION_MS,
                isUserInitiated,
                zoomLevel: nextZoomLevel,
            });
        },
        [
            currentCourseHeadingRef,
            clearUserZoomOverride,
            setRecenterNeeded,
            setTrackingMode,
            syncNativeFollowZoomLevel,
            updateFollowCamera,
        ],
    );

    const stop = useCallback(() => {
        clearPendingUserCameraUpdate();
        clearNativeFollowActivationSuspension();
        setRecenterNeeded(false);
        setTrackingMode(LOCATION_TRACKING_NONE);
        cameraRef.current?.setCamera({
            padding: viewportCameraPadding,
            pitch: 0,
            animationDuration:
                LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            animationMode: 'easeTo',
        });
    }, [
        cameraRef,
        clearNativeFollowActivationSuspension,
        clearPendingUserCameraUpdate,
        setRecenterNeeded,
        setTrackingMode,
        viewportCameraPadding,
    ]);

    const pauseUntilRecenter = useCallback(() => {
        if (
            !isDrivingMode ||
            locationTrackingModeRef.current !== LOCATION_TRACKING_FOLLOW
        ) {
            return false;
        }

        clearPendingUserCameraUpdate();
        clearNativeFollowActivationSuspension();
        setRecenterNeeded(true);
        return true;
    }, [
        clearNativeFollowActivationSuspension,
        clearPendingUserCameraUpdate,
        isDrivingMode,
        locationTrackingModeRef,
        setRecenterNeeded,
    ]);

    const keepSyncedAfterZoomChange = useCallback(
        (trackingMode) => {
            if (trackingMode !== LOCATION_TRACKING_FOLLOW) {
                return false;
            }

            if (recenterReasonRef.current === RECENTER_REASON_AWAY) {
                return false;
            }

            setUserZoomOverride(currentZoomRef.current);
            return true;
        },
        [currentZoomRef, setUserZoomOverride],
    );

    const recenter = useCallback(
        (
            location = userLocationRef.current,
            { isUserInitiated = false } = {},
        ) => {
            if (!location) {
                return false;
            }

            setRecenterNeeded(false);
            clearUserZoomOverride();
            const nextZoomLevel = syncNativeFollowZoomLevel(location, {
                force: true,
            });

            updateFollowCamera(location, currentCourseHeadingRef.current, {
                animationDuration: isUserInitiated
                    ? LOCATION_CAMERA_USER_ANIMATION_DURATION_MS
                    : LOCATION_FOLLOW_ANIMATION_DURATION_MS,
                isUserInitiated,
                zoomLevel: nextZoomLevel,
            });
            return true;
        },
        [
            currentCourseHeadingRef,
            clearUserZoomOverride,
            setRecenterNeeded,
            syncNativeFollowZoomLevel,
            updateFollowCamera,
            userLocationRef,
        ],
    );

    const startAfterPermissionGrant = useCallback(
        (location) => start(location, { isUserInitiated: true }),
        [start],
    );

    const handleLocationUpdate = useCallback(
        (trackingMode, location) => {
            if (trackingMode !== LOCATION_TRACKING_FOLLOW) {
                return false;
            }

            if (recenterReasonRef.current === RECENTER_REASON_AWAY) {
                return true;
            }

            if (nativeFollowActivationIsSuspendedRef.current) {
                return true;
            }

            if (followSpeedZoomEnabled) {
                syncNativeFollowZoomLevel(location);
            }

            return true;
        },
        [followSpeedZoomEnabled, syncNativeFollowZoomLevel],
    );

    const handleZoomLevelChange = useCallback(
        (trackingMode, nextZoomLevel, userLocation) => {
            if (trackingMode !== LOCATION_TRACKING_FOLLOW) {
                return false;
            }

            if (recenterReasonRef.current === RECENTER_REASON_AWAY) {
                return false;
            }

            setUserZoomOverride(nextZoomLevel);

            const cameraStop = {
                zoomLevel: nextZoomLevel,
                padding: followCameraPadding,
                pitch: LOCATION_FOLLOW_CAMERA_PITCH,
                animationMode: 'easeTo',
                animationDuration:
                    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            };
            const heading = currentCourseHeadingRef.current;

            if (heading !== null) {
                cameraStop.heading = heading;
            }

            const nextCameraStop = userLocation
                ? {
                      ...cameraStop,
                      centerCoordinate: getLocationCoordinate(userLocation),
                  }
                : cameraStop;

            suspendNativeFollowActivation(
                LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            );
            scheduleUserInitiatedCameraUpdate(() => {
                applyCameraStop(nextCameraStop);
            });

            return true;
        },
        [
            applyCameraStop,
            currentCourseHeadingRef,
            followCameraPadding,
            scheduleUserInitiatedCameraUpdate,
            setUserZoomOverride,
            suspendNativeFollowActivation,
        ],
    );

    const isActive = useCallback(
        (trackingMode) => trackingMode === LOCATION_TRACKING_FOLLOW,
        [],
    );

    useEffect(() => {
        if (
            !isDrivingMode ||
            locationTrackingMode !== LOCATION_TRACKING_FOLLOW
        ) {
            clearPendingUserCameraUpdate();
            clearNativeFollowActivationSuspension();
            setRecenterNeeded(false);
        }
    }, [
        clearNativeFollowActivationSuspension,
        clearPendingUserCameraUpdate,
        isDrivingMode,
        locationTrackingMode,
        setRecenterNeeded,
    ]);

    useEffect(
        () => () => {
            clearNativeFollowActivationTimeout();
            clearPendingUserCameraUpdate();
        },
        [clearNativeFollowActivationTimeout, clearPendingUserCameraUpdate],
    );

    const recenterActionIsNeeded = recenterIsNeeded || userZoomOverrideIsActive;

    return useMemo(
        () => ({
            handleLocationUpdate,
            handleZoomLevelChange,
            isActive,
            keepSyncedAfterZoomChange,
            nativeCameraFollowProps,
            pauseUntilRecenter,
            recenter,
            recenterActionIsNeeded,
            recenterIsNeeded,
            start,
            startAfterPermissionGrant,
            stop,
        }),
        [
            handleLocationUpdate,
            handleZoomLevelChange,
            isActive,
            keepSyncedAfterZoomChange,
            nativeCameraFollowProps,
            pauseUntilRecenter,
            recenter,
            recenterActionIsNeeded,
            recenterIsNeeded,
            start,
            startAfterPermissionGrant,
            stop,
        ],
    );
}
