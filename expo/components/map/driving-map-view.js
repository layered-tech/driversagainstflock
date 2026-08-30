export const DRIVING_MAP_VIEW_PERSPECTIVE = 'perspective';
export const DRIVING_MAP_VIEW_ROUTE_OVERVIEW = 'route-overview';

const DRIVING_ROUTE_OVERVIEW_BOTTOM_PADDING = 144;
const DRIVING_ROUTE_OVERVIEW_HORIZONTAL_PADDING = 24;
const DRIVING_ROUTE_OVERVIEW_RIGHT_PADDING = 72;
const DRIVING_ROUTE_OVERVIEW_TOP_PADDING = 120;

const DRIVING_MAP_VIEW_MODES = [
    DRIVING_MAP_VIEW_PERSPECTIVE,
    DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
];

const DRIVING_MAP_VIEW_PRESENTATIONS = {
    [DRIVING_MAP_VIEW_PERSPECTIVE]: {
        iconName: 'navigation-2',
        label: 'Perspective',
        shortLabel: '3D',
    },
    [DRIVING_MAP_VIEW_ROUTE_OVERVIEW]: {
        iconName: 'map',
        label: 'Route overview',
        shortLabel: 'Route',
    },
};

const DRIVING_MAP_VIEW_FOLLOW_CONFIGURATIONS = {
    [DRIVING_MAP_VIEW_PERSPECTIVE]: {
        pitch: 55,
    },
    [DRIVING_MAP_VIEW_ROUTE_OVERVIEW]: {
        pitch: 0,
    },
};

export function getNextDrivingMapViewMode(mode) {
    const currentIndex = DRIVING_MAP_VIEW_MODES.indexOf(mode);

    return DRIVING_MAP_VIEW_MODES[
        (currentIndex + 1) % DRIVING_MAP_VIEW_MODES.length
    ];
}

export function getDrivingMapViewPresentation(mode) {
    return (
        DRIVING_MAP_VIEW_PRESENTATIONS[mode] ??
        DRIVING_MAP_VIEW_PRESENTATIONS[DRIVING_MAP_VIEW_PERSPECTIVE]
    );
}

export function getDrivingMapViewFollowConfiguration(mode) {
    return (
        DRIVING_MAP_VIEW_FOLLOW_CONFIGURATIONS[mode] ??
        DRIVING_MAP_VIEW_FOLLOW_CONFIGURATIONS[DRIVING_MAP_VIEW_PERSPECTIVE]
    );
}

export function shouldShowDrivingMapStatus(mode) {
    return mode !== DRIVING_MAP_VIEW_ROUTE_OVERVIEW;
}

export function shouldRestoreDrivingPerspective({
    hasActiveDirectionsRoute,
    isRootMapSurface,
    mode,
}) {
    return (
        isRootMapSurface &&
        !hasActiveDirectionsRoute &&
        mode !== DRIVING_MAP_VIEW_PERSPECTIVE
    );
}

export function getDrivingRouteOverviewPadding(insets = {}) {
    return [
        (insets.top ?? 0) + DRIVING_ROUTE_OVERVIEW_TOP_PADDING,
        (insets.right ?? 0) + DRIVING_ROUTE_OVERVIEW_RIGHT_PADDING,
        (insets.bottom ?? 0) + DRIVING_ROUTE_OVERVIEW_BOTTOM_PADDING,
        (insets.left ?? 0) + DRIVING_ROUTE_OVERVIEW_HORIZONTAL_PADDING,
    ];
}
