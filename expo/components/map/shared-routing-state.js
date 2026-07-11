import { getSelectedDirectionsRouteOption } from './directions';

const DEFAULT_SHARED_ROUTING_STATE = {
    directionsRoute: null,
    drivingModeIsActive: false,
};

let sharedRoutingState = DEFAULT_SHARED_ROUTING_STATE;
const sharedRoutingStateListeners = new Set();

function getCoordinateSyncKey(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return '';
    }

    return coordinate
        .slice(0, 2)
        .map((value) => {
            const numericValue = Number(value);

            return Number.isFinite(numericValue) ? numericValue.toFixed(6) : '';
        })
        .join(',');
}

export function getDirectionsRouteSyncKey(route) {
    if (!route) {
        return '';
    }

    const routeOption = getSelectedDirectionsRouteOption(route);
    const firstCoordinate = routeOption?.coordinates?.[0];
    const lastCoordinate =
        routeOption?.coordinates?.[routeOption.coordinates.length - 1];

    return [
        route.requestedAt ?? '',
        route.selectedRouteKey ?? route.routeKey ?? routeOption?.routeKey ?? '',
        route.destination?.id ??
            route.destination?.placeId ??
            route.destination?.label ??
            route.destination?.inputValue ??
            '',
        route.start?.id ??
            route.start?.placeId ??
            route.start?.label ??
            route.start?.inputValue ??
            '',
        routeOption?.distance ?? '',
        routeOption?.duration ?? '',
        routeOption?.coordinates?.length ?? '',
        getCoordinateSyncKey(firstCoordinate),
        getCoordinateSyncKey(lastCoordinate),
    ].join('|');
}

export function routingStatesAreEqual(firstState, secondState) {
    return (
        Boolean(firstState?.drivingModeIsActive) ===
            Boolean(secondState?.drivingModeIsActive) &&
        getDirectionsRouteSyncKey(firstState?.directionsRoute) ===
            getDirectionsRouteSyncKey(secondState?.directionsRoute)
    );
}

function normalizeRoutingState(state) {
    const directionsRoute = state?.directionsRoute ?? null;

    return {
        directionsRoute,
        drivingModeIsActive: Boolean(
            directionsRoute && state?.drivingModeIsActive,
        ),
    };
}

export function getSharedRoutingState() {
    return sharedRoutingState;
}

export function setSharedRoutingState(nextState) {
    const normalizedState = normalizeRoutingState({
        ...sharedRoutingState,
        ...nextState,
    });

    if (routingStatesAreEqual(sharedRoutingState, normalizedState)) {
        return;
    }

    sharedRoutingState = normalizedState;
    sharedRoutingStateListeners.forEach((listener) =>
        listener(sharedRoutingState),
    );
}

export function addSharedRoutingStateListener(listener) {
    sharedRoutingStateListeners.add(listener);

    return () => {
        sharedRoutingStateListeners.delete(listener);
    };
}
