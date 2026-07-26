const NO_SHARED_NAVIGATION_ACTION = Object.freeze({
    action: 'none',
    route: null,
});

export function getAutoPlaySharedNavigationAction({
    activeNavigationRoute,
    getRouteSyncKey,
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

    if (nextRoute) {
        return getRouteSyncKey(nextRoute) ===
            getRouteSyncKey(activeNavigationRoute)
            ? NO_SHARED_NAVIGATION_ACTION
            : { action: 'start', route: nextRoute };
    }

    return activeNavigationRoute
        ? { action: 'stop', route: null }
        : NO_SHARED_NAVIGATION_ACTION;
}
