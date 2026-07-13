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
    enhancedNavigationLocationWatchEnabled,
    phoneLocationUpdatesAreEnabled,
}) {
    return (
        phoneLocationUpdatesAreEnabled &&
        !enhancedNavigationLocationWatchEnabled &&
        !autoDriveSimulationIsActive
    );
}
