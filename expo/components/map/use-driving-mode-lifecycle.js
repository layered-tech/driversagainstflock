import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { logMapDrivingStarted } from './analytics';

const DRIVING_MODE_WAKE_LOCK_TAG = 'driversagainstflock.driving-mode';
const IDLE_LOCK_ON_CAMERA_ANIMATION_DURATION_MS = 1250;

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
