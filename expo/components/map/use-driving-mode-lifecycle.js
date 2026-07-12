import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { logMapDrivingStarted } from './analytics';
import {
    DRIVING_DESTINATION_CAMERA_GAP,
    DRIVING_DESTINATION_SURFACE_HEIGHT,
} from './constants';

const DRIVING_MODE_WAKE_LOCK_TAG = 'driversagainstflock.driving-mode';
const DRIVING_CAMERA_FOLLOW_VIEWPORT_Y_RATIO = 0.8;
const DRIVING_CAMERA_FOLLOW_VIEWPORT_BOTTOM_OFFSET =
    DRIVING_DESTINATION_SURFACE_HEIGHT + DRIVING_DESTINATION_CAMERA_GAP;
const IDLE_LOCK_ON_CAMERA_ANIMATION_DURATION_MS = 1250;

export function getDrivingCameraFollowOptions() {
    return {
        drivingCameraFollowViewportBottomOffset:
            DRIVING_CAMERA_FOLLOW_VIEWPORT_BOTTOM_OFFSET,
        drivingCameraFollowViewportYRatio:
            DRIVING_CAMERA_FOLLOW_VIEWPORT_Y_RATIO,
    };
}

export function useStartDrivingAction({
    directionsRoute,
    layerSheetRef,
    searchController,
    selectedDirectionsRouteOption,
    setDrivingModeIsActive,
}) {
    return useCallback(() => {
        if (!selectedDirectionsRouteOption) {
            return;
        }

        searchController.dismissDirectionsRouteSheet();
        layerSheetRef.current?.dismiss();
        logMapDrivingStarted({ route: directionsRoute });
        setDrivingModeIsActive(true);
    }, [
        directionsRoute,
        layerSheetRef,
        searchController.dismissDirectionsRouteSheet,
        selectedDirectionsRouteOption,
        setDrivingModeIsActive,
    ]);
}

export function useDrivingModeLifecycle({
    appStateIsActive = true,
    directionsRoute,
    isDrivingMode,
    screenIsFocused = true,
    lockOnLocationUpdateAnimationDurationRef,
    pendingDirectionsRequest,
    searchController,
    selectedDirectionsRouteOption,
    setDrivingModeIsActive,
}) {
    const wakeLockShouldBeActiveRef = useRef(false);
    const routeOrDestinationIsActive = Boolean(
        directionsRoute ||
        pendingDirectionsRequest?.destinationWaypoint ||
        searchController.directionsDestinationWaypoint,
    );
    const idleLockCameraAnimationIsEnabled = Platform.OS === 'android';
    lockOnLocationUpdateAnimationDurationRef.current =
        idleLockCameraAnimationIsEnabled &&
        !isDrivingMode &&
        !routeOrDestinationIsActive
            ? IDLE_LOCK_ON_CAMERA_ANIMATION_DURATION_MS
            : null;

    useEffect(() => {
        if (isDrivingMode && !selectedDirectionsRouteOption) {
            setDrivingModeIsActive(false);
        }
    }, [isDrivingMode, selectedDirectionsRouteOption, setDrivingModeIsActive]);

    useEffect(() => {
        if (!appStateIsActive || !isDrivingMode || !screenIsFocused) {
            wakeLockShouldBeActiveRef.current = false;
            return undefined;
        }

        wakeLockShouldBeActiveRef.current = true;

        activateKeepAwakeAsync(DRIVING_MODE_WAKE_LOCK_TAG)
            .then(() => {
                if (!wakeLockShouldBeActiveRef.current) {
                    deactivateKeepAwake(DRIVING_MODE_WAKE_LOCK_TAG).catch(
                        () => {},
                    );
                }
            })
            .catch(() => {});

        return () => {
            wakeLockShouldBeActiveRef.current = false;
            deactivateKeepAwake(DRIVING_MODE_WAKE_LOCK_TAG).catch(() => {});
        };
    }, [appStateIsActive, isDrivingMode, screenIsFocused]);
}
