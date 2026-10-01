import {
    ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS,
    getActiveRouteDeviationDistanceMeters,
} from './active-route-deviation';
import {
    createCurrentLocationDirectionsWaypoint,
    createDirectionsRouteProgressTracker,
    getDirectionsRouteBounds,
    getDirectionsRouteProgress,
    getDirectionsWaypointApiCoord,
    getRemainingDirectionsStopWaypoints,
    getSelectedDirectionsRouteKey,
    getSelectedDirectionsRouteOption,
    selectDirectionsRoute,
} from './directions';
import { getCoordinateDistanceMeters, getStoredNumber } from './geo';

const CONFIRMATION_MS = 2000;
const COOLDOWN_MS = 8000;
const GRACE_PERIOD_MS = 3000;
const MAX_LOCATION_AGE_MS = 10000;
const REQUEST_TIMEOUT_MS = 60000;

export function createSharedNavigationReroutingController({
    getRoutingState,
    getDirections,
    publishRoute,
    onStatusChange = () => {},
    getShowZone = () => false,
    now = Date.now,
}) {
    const tracker = createDirectionsRouteProgressTracker();
    let activeRoute = null;
    let latestLocation = null;
    let offRouteSince = null;
    let nextAttemptAt = 0;
    let failureCount = 0;
    let pendingRequest = null;

    function cancel() {
        const request = pendingRequest;
        pendingRequest = null;
        if (request) {
            clearTimeout(request.timeoutId);
            request.controller.abort();
            onStatusChange(false);
        }
        offRouteSince = null;
    }

    function locationIsUsable(location) {
        const recordedAt = getStoredNumber(location?.recordedAt);
        const accuracy = getStoredNumber(location?.accuracy);
        return (
            recordedAt !== null &&
            now() - recordedAt <= MAX_LOCATION_AGE_MS &&
            recordedAt <= now() &&
            (accuracy === null || (accuracy >= 0 && accuracy <= 50))
        );
    }

    function update(location = latestLocation) {
        const state = getRoutingState();
        const route = state?.drivingModeIsActive ? state.directionsRoute : null;
        if (route !== activeRoute) {
            cancel();
            tracker.reset();
            activeRoute = route;
            nextAttemptAt = 0;
            failureCount = 0;
        }
        if (!route) {
            latestLocation = null;
            return;
        }
        if (
            getStoredNumber(location?.recordedAt) <
            getStoredNumber(latestLocation?.recordedAt)
        ) {
            return;
        }
        latestLocation = location;
        if (!locationIsUsable(location)) {
            offRouteSince = null;
            return;
        }
        const progress = tracker.update(route, location);
        const distance = getActiveRouteDeviationDistanceMeters({
            routeProgress: progress,
            userLocation: location,
        });
        if (
            !progress ||
            distance === null ||
            distance <= ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS
        ) {
            offRouteSince = null;
            return;
        }
        if (
            pendingRequest ||
            now() < nextAttemptAt ||
            now() - (route.requestedAt ?? 0) < GRACE_PERIOD_MS
        ) {
            offRouteSince = null;
            return;
        }
        offRouteSince ??= now();
        if (now() - offRouteSince < CONFIRMATION_MS) {
            return;
        }
        const startWaypoint = createCurrentLocationDirectionsWaypoint(location);
        const start = getDirectionsWaypointApiCoord(startWaypoint);
        const end = getDirectionsWaypointApiCoord(route.destination);
        if (!start || !end) {
            return;
        }
        const stops = getRemainingDirectionsStopWaypoints(route, progress);
        const selectedRouteKey = getSelectedDirectionsRouteKey(route);
        const request = { controller: new AbortController(), timeoutId: null };
        pendingRequest = request;
        offRouteSince = null;
        nextAttemptAt = now() + COOLDOWN_MS;
        onStatusChange(true);
        request.timeoutId = setTimeout(
            () => request.controller.abort(),
            REQUEST_TIMEOUT_MS,
        );

        Promise.resolve()
            .then(() =>
                getDirections({
                    advancedRouteSettings: route.advancedRouteSettings,
                    start,
                    end,
                    waypoints: stops
                        .map(getDirectionsWaypointApiCoord)
                        .filter(Boolean),
                    showZone: getShowZone(),
                    signal: request.controller.signal,
                }),
            )
            .then(({ route: responseRoute, debugGeometry, exclusionZone }) => {
                if (
                    pendingRequest !== request ||
                    request.controller.signal.aborted ||
                    getRoutingState()?.directionsRoute !== route ||
                    !getRoutingState()?.drivingModeIsActive
                ) {
                    return;
                }
                const selectedRoute = selectDirectionsRoute(
                    responseRoute,
                    selectedRouteKey,
                );
                const option = getSelectedDirectionsRouteOption(selectedRoute);
                const snappedStart =
                    option?.snappedWaypoints?.[0] ?? option?.coordinates?.[0];
                const snapDistance = getCoordinateDistanceMeters(
                    [start.longitude, start.latitude],
                    snappedStart,
                );
                const currentProgress = getDirectionsRouteProgress(
                    selectedRoute,
                    latestLocation,
                );
                if (
                    !locationIsUsable(latestLocation) ||
                    snapDistance === null ||
                    snapDistance > 75 ||
                    !currentProgress ||
                    currentProgress.distanceFromRoute >
                        ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS
                ) {
                    return;
                }
                failureCount = 0;
                clearTimeout(request.timeoutId);
                pendingRequest = null;
                onStatusChange(false);
                const nextRoute = {
                    ...selectedRoute,
                    advancedRouteSettings: route.advancedRouteSettings,
                    bounds: getDirectionsRouteBounds(selectedRoute),
                    debugGeometry,
                    destination: route.destination,
                    exclusionZone,
                    requestedAt: now(),
                    start: startWaypoint,
                    stopWaypoints: stops,
                };
                activeRoute = nextRoute;
                tracker.reset();
                nextAttemptAt = now() + COOLDOWN_MS;
                publishRoute(nextRoute);
            })
            .catch(() => {
                if (pendingRequest === request) {
                    failureCount += 1;
                    nextAttemptAt =
                        now() +
                        Math.min(60000, COOLDOWN_MS * 2 ** (failureCount - 1));
                }
            })
            .finally(() => {
                clearTimeout(request.timeoutId);
                if (pendingRequest === request) {
                    pendingRequest = null;
                    onStatusChange(false);
                }
            });
    }

    return { update, cancel };
}
