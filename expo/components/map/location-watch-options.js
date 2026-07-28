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

export function shouldRefreshLocationData({
    appState,
    persistentRoadMatchingWatchIsActive,
}) {
    return (
        appState === 'active' || persistentRoadMatchingWatchIsActive === true
    );
}

export function getRoadMatchingLocationSourcePolicy({
    activeRetainerCount,
    appState,
    automotiveLocationOwnerIsActive = false,
    persistentRetainerCount,
    platformOS,
}) {
    const sessionIsRetained = activeRetainerCount > 0;
    // Android holds only while-in-use location permission, so a connected car
    // session must keep the location foreground service running or the OS
    // stops GPS delivery once the phone locks. iOS CarPlay keeps the app
    // foreground while its scene is visible, so ownership replaces the task.
    const automotiveOwnerReplacesBackgroundTask =
        automotiveLocationOwnerIsActive && platformOS !== 'android';

    return {
        backgroundTaskIsNeeded:
            sessionIsRetained &&
            persistentRetainerCount > 0 &&
            !automotiveOwnerReplacesBackgroundTask,
        foregroundWatchIsNeeded: sessionIsRetained && appState === 'active',
    };
}

export function shouldPublishBackgroundRoadMatchingLocation({
    appState,
    automotiveLocationOwnerIsActive = false,
    foregroundLocationSourceIsActive,
}) {
    return (
        automotiveLocationOwnerIsActive === true ||
        appState !== 'active' ||
        foregroundLocationSourceIsActive !== true
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

export function getLocationUpdateRecordedAt(location) {
    const value = location?.recordedAt ?? location?.timestamp;

    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

export function locationUpdateIsStale({ currentLocation, nextLocation }) {
    const currentRecordedAt = getLocationUpdateRecordedAt(currentLocation);
    const nextRecordedAt = getLocationUpdateRecordedAt(nextLocation);

    return (
        currentRecordedAt !== null &&
        nextRecordedAt !== null &&
        nextRecordedAt < currentRecordedAt
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
