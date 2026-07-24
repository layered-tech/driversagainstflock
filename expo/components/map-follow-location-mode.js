import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from '../lib/safe-area-insets';
import {
    EMPTY_CAMERA_PADDING,
    getCameraPadding,
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
    LOCATION_TRACKING_FOLLOW,
    LOCATION_TRACKING_NONE,
    LOCATION_ZOOM_LEVEL,
} from './map-location-mode-shared';
import {
    FOLLOW_CAMERA_MAX_TOP_PADDING_RATIO,
    getFollowCameraPadding,
} from './map/follow-camera-padding';
import { getFollowZoomUpdate } from './map/follow-zoom-update';
import { getImperativeFollowCameraStop } from './map/imperative-follow-camera';

const LOCATION_FOLLOW_CAMERA_PITCH = 55;
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
    currentZoomRef,
    followSpeedZoomEnabled = false,
    followViewportAnchorY,
    isDrivingMode,
    locationTrackingMode,
    locationTrackingModeRef,
    markerLoadsEnabledRef,
    setTrackingMode,
    userLocationRef,
    viewportHeight,
}) {
    const { height: windowHeight } = useWindowDimensions();
    const cameraViewportHeight =
        Number.isFinite(viewportHeight) && viewportHeight > 0
            ? viewportHeight
            : windowHeight;
    const insets = useSafeAreaInsets();
    const recenterReasonRef = useRef(null);
    const recenterIsNeededRef = useRef(false);
    const followCameraLocationUpdateTimestampRef = useRef(null);
    const nativeFollowZoomLevelRef = useRef(LOCATION_ZOOM_LEVEL);
    const lastFollowSpeedZoomUpdateAtRef = useRef(null);
    const userZoomOverrideIsActiveRef = useRef(false);
    const [nativeFollowZoomLevel, setNativeFollowZoomLevelState] =
        useState(LOCATION_ZOOM_LEVEL);
    const [recenterIsNeeded, setRecenterIsNeeded] = useState(false);
    const [userZoomOverrideIsActive, setUserZoomOverrideIsActive] =
        useState(false);
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
            maxTopPaddingRatio: FOLLOW_CAMERA_MAX_TOP_PADDING_RATIO,
            viewportHeight: cameraViewportHeight,
            viewportInsets: viewportCameraPadding,
        });
    }, [cameraViewportHeight, followViewportAnchorY, viewportCameraPadding]);
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
        (
            location,
            { force = false, respectSpeedZoomInterval = false } = {},
        ) => {
            const recordedAt = Number(location?.recordedAt);
            const now = Number.isFinite(recordedAt) ? recordedAt : Date.now();
            const nextZoomLevel = getFollowZoomLevel(location);
            const zoomUpdate = getFollowZoomUpdate({
                currentZoomLevel: nativeFollowZoomLevelRef.current,
                force,
                lastUpdateAt: respectSpeedZoomInterval
                    ? lastFollowSpeedZoomUpdateAtRef.current
                    : null,
                nextZoomLevel,
                now,
                userZoomOverrideIsActive: userZoomOverrideIsActiveRef.current,
            });

            if (!zoomUpdate.shouldUpdate) {
                return nativeFollowZoomLevelRef.current;
            }

            followCameraLocationUpdateTimestampRef.current = now;

            if (followSpeedZoomEnabled) {
                lastFollowSpeedZoomUpdateAtRef.current = now;
            }

            setNativeFollowZoomLevel(nextZoomLevel);
            currentZoomRef.current = nextZoomLevel;

            return nextZoomLevel;
        },
        [
            currentZoomRef,
            followSpeedZoomEnabled,
            getFollowZoomLevel,
            setNativeFollowZoomLevel,
        ],
    );
    const updateImperativeFollowCamera = useCallback(
        (location, zoomLevel = nativeFollowZoomLevelRef.current) => {
            if (Platform.OS !== 'android') {
                return;
            }

            const cameraStop = getImperativeFollowCameraStop({
                location,
                padding: followCameraPadding,
                pitch: LOCATION_FOLLOW_CAMERA_PITCH,
                zoomLevel,
            });

            if (cameraStop) {
                cameraRef.current?.setCamera(cameraStop);
            }
        },
        [cameraRef, followCameraPadding],
    );
    const setUserZoomOverride = useCallback(
        (nextZoomLevel) => {
            const recordedAt = Number(userLocationRef.current?.recordedAt);

            userZoomOverrideIsActiveRef.current = true;
            followCameraLocationUpdateTimestampRef.current = Number.isFinite(
                recordedAt,
            )
                ? recordedAt
                : null;
            lastFollowSpeedZoomUpdateAtRef.current = null;
            setUserZoomOverrideIsActive(true);
            setNativeFollowZoomLevel(clampZoomLevel(nextZoomLevel));
            currentZoomRef.current = clampZoomLevel(nextZoomLevel);
        },
        [
            clampZoomLevel,
            currentZoomRef,
            setNativeFollowZoomLevel,
            userLocationRef,
        ],
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
                !recenterIsNeeded,
            locationUpdateTimestamp:
                followCameraLocationUpdateTimestampRef.current ?? undefined,
            padding: followCameraPadding,
            pitch: LOCATION_FOLLOW_CAMERA_PITCH,
            zoomLevel: nativeFollowZoomLevel,
        }),
        [
            followCameraPadding,
            isDrivingMode,
            locationTrackingMode,
            nativeFollowZoomLevel,
            recenterIsNeeded,
        ],
    );

    const start = useCallback(
        (location) => {
            if (!location) {
                return;
            }

            markerLoadsEnabledRef.current = true;
            setRecenterNeeded(false);
            setTrackingMode(LOCATION_TRACKING_FOLLOW);
            clearUserZoomOverride();
            const nextZoomLevel = syncNativeFollowZoomLevel(location, {
                force: true,
            });
            updateImperativeFollowCamera(location, nextZoomLevel);
        },
        [
            clearUserZoomOverride,
            markerLoadsEnabledRef,
            setRecenterNeeded,
            setTrackingMode,
            syncNativeFollowZoomLevel,
            updateImperativeFollowCamera,
        ],
    );

    const stop = useCallback(() => {
        followCameraLocationUpdateTimestampRef.current = null;
        lastFollowSpeedZoomUpdateAtRef.current = null;
        setRecenterNeeded(false);
        setTrackingMode(LOCATION_TRACKING_NONE);
        cameraRef.current?.setCamera({
            padding: viewportCameraPadding,
            pitch: 0,
            animationDuration:
                LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            animationMode: 'easeTo',
        });
    }, [cameraRef, setRecenterNeeded, setTrackingMode, viewportCameraPadding]);

    const pauseUntilRecenter = useCallback(() => {
        if (
            !isDrivingMode ||
            locationTrackingModeRef.current !== LOCATION_TRACKING_FOLLOW
        ) {
            return false;
        }

        followCameraLocationUpdateTimestampRef.current = null;
        lastFollowSpeedZoomUpdateAtRef.current = null;
        setRecenterNeeded(true);
        return true;
    }, [isDrivingMode, locationTrackingModeRef, setRecenterNeeded]);

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
        (location = userLocationRef.current) => {
            if (!location) {
                return false;
            }

            markerLoadsEnabledRef.current = true;
            setRecenterNeeded(false);
            clearUserZoomOverride();
            const nextZoomLevel = syncNativeFollowZoomLevel(location, {
                force: true,
            });
            updateImperativeFollowCamera(location, nextZoomLevel);
            return true;
        },
        [
            clearUserZoomOverride,
            markerLoadsEnabledRef,
            setRecenterNeeded,
            syncNativeFollowZoomLevel,
            updateImperativeFollowCamera,
            userLocationRef,
        ],
    );

    const startAfterPermissionGrant = useCallback(
        (location) => start(location),
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

            const nextZoomLevel = followSpeedZoomEnabled
                ? syncNativeFollowZoomLevel(location, {
                      respectSpeedZoomInterval: true,
                  })
                : nativeFollowZoomLevelRef.current;

            updateImperativeFollowCamera(location, nextZoomLevel);

            return true;
        },
        [
            followSpeedZoomEnabled,
            syncNativeFollowZoomLevel,
            updateImperativeFollowCamera,
        ],
    );

    const handleZoomLevelChange = useCallback(
        (trackingMode, nextZoomLevel) => {
            if (trackingMode !== LOCATION_TRACKING_FOLLOW) {
                return false;
            }

            if (recenterReasonRef.current === RECENTER_REASON_AWAY) {
                return false;
            }

            markerLoadsEnabledRef.current = true;
            setUserZoomOverride(nextZoomLevel);

            return true;
        },
        [markerLoadsEnabledRef, setUserZoomOverride],
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
            followCameraLocationUpdateTimestampRef.current = null;
            lastFollowSpeedZoomUpdateAtRef.current = null;
            setRecenterNeeded(false);
        }
    }, [isDrivingMode, locationTrackingMode, setRecenterNeeded]);

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
