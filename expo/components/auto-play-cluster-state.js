import { resolveNavigationTuning } from './map/navigation-tuning.js';

const EMPTY_SEARCH_RESULTS = [];

export const AUTO_PLAY_CLUSTER_PLATFORM_CONFIG = {
    currentRoadPill: { compact: true },
    followPitch: 60,
    followZoomOffset: resolveNavigationTuning({ surface: 'cluster' })
        .zoomOffset,
    hideMapboxCompass: true,
    hostOwnsNavigationUI: true,
    isClusterMapSurface: true,
    usesHostColorSchemeForAutomaticMapPreset: true,
};

export function getAutoPlayClusterState(routingState) {
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
