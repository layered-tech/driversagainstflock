import { useCallback } from 'react';
import { Platform } from 'react-native';
import { logMapDrivingStarted } from './analytics';

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
    directionsRoute,
    isDrivingMode,
    lockOnLocationUpdateAnimationDurationRef,
    pendingDirectionsRequest,
    searchController,
}) {
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
}
