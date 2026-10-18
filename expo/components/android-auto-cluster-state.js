const EMPTY_SEARCH_RESULTS = [];

export const ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG = {
    currentRoadPill: { compact: true },
    followPitch: 60,
    followZoomOffset: -1,
    hideMapboxCompass: true,
    hostOwnsNavigationUI: true,
    isClusterMapSurface: true,
    usesHostColorSchemeForAutomaticMapPreset: true,
};

export function getAndroidAutoClusterState(routingState) {
    const isNavigating = Boolean(
        routingState.drivingModeIsActive && routingState.directionsRoute,
    );

    return {
        directionsRoute: isNavigating ? routingState.directionsRoute : null,
        drivingMapViewMode: 'perspective',
        drivingModeIsActive: true,
        isNavigating,
        submittedSearchQuery: '',
        submittedSearchResults: EMPTY_SEARCH_RESULTS,
    };
}
