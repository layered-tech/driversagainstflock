import { useCallback, useMemo, useRef } from 'react';
import {
    getCameraPadding,
    getLocationCoordinate,
    getTrackingZoomLevel,
    LOCATION_CAMERA_CENTER_ANIMATION_DURATION_MS,
    LOCATION_CAMERA_CENTER_ANIMATION_MODE,
    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
    LOCATION_TRACKING_LOCK_ON,
    LOCATION_TRACKING_NONE,
} from './map-location-mode-shared';

function getLocationUpdateAnimationDuration(value) {
    return Number.isFinite(value) && value > 0
        ? value
        : LOCATION_CAMERA_CENTER_ANIMATION_DURATION_MS;
}

export function useLockOnLocationMode({
    cameraRef,
    cameraViewportInsets,
    clampZoomLevel,
    currentZoomRef,
    isMapReadyRef,
    locationUpdateAnimationDurationRef,
    markerLoadsEnabledRef,
    moveCameraToUser,
    pendingCameraStopRef,
    setTrackingMode,
}) {
    const cameraPadding = getCameraPadding(cameraViewportInsets);
    const automatedLocationUpdatesResumeAtRef = useRef(0);
    const suspendAutomatedLocationUpdates = useCallback((animationDuration) => {
        automatedLocationUpdatesResumeAtRef.current =
            Date.now() + animationDuration;
    }, []);
    const automatedLocationUpdatesAreSuspended = useCallback(
        () => Date.now() < automatedLocationUpdatesResumeAtRef.current,
        [],
    );
    const keepCameraOnUser = useCallback(
        (location) => {
            if (!location) {
                return;
            }

            const nextZoomLevel = getTrackingZoomLevel(
                currentZoomRef,
                clampZoomLevel,
            );
            const cameraStop = {
                centerCoordinate: getLocationCoordinate(location),
                animationDuration: getLocationUpdateAnimationDuration(
                    locationUpdateAnimationDurationRef?.current,
                ),
                animationMode: LOCATION_CAMERA_CENTER_ANIMATION_MODE,
                padding: cameraPadding,
                pitch: 0,
                zoomLevel: nextZoomLevel,
            };

            markerLoadsEnabledRef.current = true;
            currentZoomRef.current = nextZoomLevel;

            if (isMapReadyRef.current && cameraRef.current) {
                cameraRef.current.setCamera(cameraStop);
                return;
            }

            pendingCameraStopRef.current = {
                camera: cameraStop,
                enableMarkerLoads: true,
            };
        },
        [
            cameraPadding,
            cameraRef,
            clampZoomLevel,
            currentZoomRef,
            isMapReadyRef,
            locationUpdateAnimationDurationRef,
            markerLoadsEnabledRef,
            pendingCameraStopRef,
        ],
    );

    const start = useCallback(
        (location, { isUserInitiated = false } = {}) => {
            if (!location) {
                return;
            }

            automatedLocationUpdatesResumeAtRef.current = 0;

            setTrackingMode(LOCATION_TRACKING_LOCK_ON);
            moveCameraToUser(location, { isUserInitiated });
        },
        [moveCameraToUser, setTrackingMode],
    );

    const stop = useCallback(() => {
        automatedLocationUpdatesResumeAtRef.current = 0;
        setTrackingMode(LOCATION_TRACKING_NONE);
    }, [setTrackingMode]);

    const orientNorthUp = useCallback(
        (location) => {
            if (!location) {
                return false;
            }

            const nextZoomLevel = getTrackingZoomLevel(
                currentZoomRef,
                clampZoomLevel,
            );
            const cameraStop = {
                centerCoordinate: getLocationCoordinate(location),
                zoomLevel: nextZoomLevel,
                heading: 0,
                pitch: 0,
                padding: cameraPadding,
                animationMode: 'easeTo',
                animationDuration:
                    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            };

            suspendAutomatedLocationUpdates(
                LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            );
            markerLoadsEnabledRef.current = true;
            currentZoomRef.current = nextZoomLevel;
            setTrackingMode(LOCATION_TRACKING_LOCK_ON);

            if (isMapReadyRef.current && cameraRef.current) {
                cameraRef.current.setCamera(cameraStop);
                return true;
            }

            pendingCameraStopRef.current = {
                camera: cameraStop,
                enableMarkerLoads: true,
            };

            return true;
        },
        [
            cameraPadding,
            cameraRef,
            clampZoomLevel,
            currentZoomRef,
            isMapReadyRef,
            markerLoadsEnabledRef,
            pendingCameraStopRef,
            setTrackingMode,
            suspendAutomatedLocationUpdates,
        ],
    );

    const handleLocationUpdate = useCallback(
        (trackingMode, location) => {
            if (trackingMode !== LOCATION_TRACKING_LOCK_ON) {
                return false;
            }

            if (automatedLocationUpdatesAreSuspended()) {
                return true;
            }

            keepCameraOnUser(location);
            return true;
        },
        [automatedLocationUpdatesAreSuspended, keepCameraOnUser],
    );

    const handleZoomLevelChange = useCallback(
        (trackingMode, nextZoomLevel, userLocation) => {
            if (trackingMode !== LOCATION_TRACKING_LOCK_ON) {
                return false;
            }

            const cameraStop = {
                zoomLevel: nextZoomLevel,
                padding: cameraPadding,
                pitch: 0,
                animationMode: 'easeTo',
                animationDuration:
                    LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            };

            suspendAutomatedLocationUpdates(
                LOCATION_CAMERA_USER_INTERACTION_ANIMATION_DURATION_MS,
            );

            if (userLocation) {
                cameraRef.current?.setCamera({
                    ...cameraStop,
                    centerCoordinate: getLocationCoordinate(userLocation),
                });
                return true;
            }

            cameraRef.current?.setCamera(cameraStop);
            return true;
        },
        [cameraPadding, cameraRef, suspendAutomatedLocationUpdates],
    );

    const isActive = useCallback(
        (trackingMode) => trackingMode === LOCATION_TRACKING_LOCK_ON,
        [],
    );
    const startAfterPermissionGrant = useCallback(
        (location) => start(location, { isUserInitiated: true }),
        [start],
    );

    return useMemo(
        () => ({
            handleLocationUpdate,
            handleZoomLevelChange,
            isActive,
            orientNorthUp,
            start,
            startAfterPermissionGrant,
            stop,
        }),
        [
            handleLocationUpdate,
            handleZoomLevelChange,
            isActive,
            orientNorthUp,
            start,
            startAfterPermissionGrant,
            stop,
        ],
    );
}
