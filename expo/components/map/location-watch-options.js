const IDLE_LOCATION_WATCH_POLICY = Object.freeze({
    accuracyKey: 'Balanced',
    distanceInterval: 10,
    timeInterval: 5000,
});
const TRACKING_LOCATION_WATCH_POLICY = Object.freeze({
    accuracyKey: 'High',
    distanceInterval: 3,
    timeInterval: 1000,
});
const DRIVING_LOCATION_WATCH_POLICY = Object.freeze({
    accuracyKey: 'BestForNavigation',
    distanceInterval: 3,
    mayShowUserSettingsDialog: true,
    timeInterval: 1000,
});

export function getLocationWatchOptions({
    accuracies,
    isDrivingMode = false,
    isLocationTrackingActive = false,
}) {
    const policy = isDrivingMode
        ? DRIVING_LOCATION_WATCH_POLICY
        : isLocationTrackingActive
          ? TRACKING_LOCATION_WATCH_POLICY
          : IDLE_LOCATION_WATCH_POLICY;
    const { accuracyKey, ...options } = policy;

    return {
        ...options,
        accuracy: accuracies[accuracyKey],
    };
}

export function shouldUseDeviceLocationWatch({
    autoDriveSimulationIsActive,
    phoneLocationUpdatesAreEnabled,
    roadMatchedLocationWatchEnabled,
}) {
    return (
        phoneLocationUpdatesAreEnabled &&
        !roadMatchedLocationWatchEnabled &&
        !autoDriveSimulationIsActive
    );
}

export function shouldAcceptLocationUpdate({
    location,
    roadMatchedLocationWatchEnabled,
}) {
    return (
        roadMatchedLocationWatchEnabled ===
        isRoadMatchedLocationUpdate(location)
    );
}

export function isRoadMatchedLocationUpdate(location) {
    return (
        location?.roadMatch !== null && typeof location?.roadMatch === 'object'
    );
}

export async function getCurrentPositionForActiveLocationSource({
    getCurrentPositionAsync,
    getLastRoadMatchedLocation,
    isMountedRef,
    roadMatchedLocationWatchEnabledRef,
}) {
    async function getRoadMatchedLocationIfOwned() {
        if (!roadMatchedLocationWatchEnabledRef?.current) {
            return undefined;
        }

        const roadMatchedLocation = await getLastRoadMatchedLocation().catch(
            () => null,
        );

        if (!isMountedRef.current) {
            return null;
        }

        if (!roadMatchedLocationWatchEnabledRef.current) {
            return undefined;
        }

        return isRoadMatchedLocationUpdate(roadMatchedLocation)
            ? roadMatchedLocation
            : null;
    }

    const currentRoadMatchedLocation = await getRoadMatchedLocationIfOwned();

    if (currentRoadMatchedLocation !== undefined) {
        return currentRoadMatchedLocation;
    }

    const rawPosition = await getCurrentPositionAsync();

    if (!isMountedRef.current) {
        return null;
    }

    const roadMatchedLocationAfterRawFix =
        await getRoadMatchedLocationIfOwned();

    if (roadMatchedLocationAfterRawFix !== undefined) {
        return roadMatchedLocationAfterRawFix;
    }

    return rawPosition;
}

export function shouldUseRoadMatchedLocationWatch({
    autoDriveSimulationIsActive,
    isDrivingMode,
    locationAccessGranted,
    persistentRoadMatchingWatchIsActive,
    phoneLocationUpdatesAreEnabled,
    roadMatchingIsSupported,
}) {
    return (
        locationAccessGranted &&
        !autoDriveSimulationIsActive &&
        roadMatchingIsSupported &&
        (isDrivingMode ||
            (phoneLocationUpdatesAreEnabled &&
                persistentRoadMatchingWatchIsActive))
    );
}
