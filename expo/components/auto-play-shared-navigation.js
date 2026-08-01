const NO_SHARED_NAVIGATION_ACTION = Object.freeze({
    action: 'none',
    route: null,
});

export function getAutoPlaySharedNavigationAction({
    activeNavigationRoute,
    getRouteSyncKey,
    hostNavigationIsActive = true,
    rootMapTemplateIsReady,
    routingState,
}) {
    if (!rootMapTemplateIsReady) {
        return NO_SHARED_NAVIGATION_ACTION;
    }

    const nextRoute =
        routingState?.drivingModeIsActive && routingState?.directionsRoute
            ? routingState.directionsRoute
            : null;

    const activeHostNavigationRoute = hostNavigationIsActive
        ? activeNavigationRoute
        : null;

    if (nextRoute) {
        return getRouteSyncKey(nextRoute) ===
            getRouteSyncKey(activeHostNavigationRoute)
            ? NO_SHARED_NAVIGATION_ACTION
            : { action: 'start', route: nextRoute };
    }

    return activeHostNavigationRoute
        ? { action: 'stop', route: null }
        : NO_SHARED_NAVIGATION_ACTION;
}
