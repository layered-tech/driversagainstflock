import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKGROUND_ALERT_STORAGE_TIMEOUT_MS } from './background-alert-budget';
import { getSelectedDirectionsRouteOption } from './directions';
import { createMapPreferencesPersistenceScheduler } from './map-preferences-persistence';
import {
    createBackgroundRoutingStateResolver,
    serializePersistedSharedRoutingState,
} from './shared-routing-state-persistence';

export const SHARED_ROUTING_STATE_STORAGE_KEY =
    'driversagainstflock.sharedRoutingState.v1';

const DEFAULT_SHARED_ROUTING_STATE = {
    directionsRoute: null,
    drivingModeIsActive: false,
};

let sharedRoutingState = DEFAULT_SHARED_ROUTING_STATE;
let liveRoutingStateHasBeenSet = false;
const sharedRoutingStateListeners = new Set();
const sharedRoutingStatePersistenceScheduler =
    createMapPreferencesPersistenceScheduler({
        write: (serializedState) =>
            AsyncStorage.setItem(
                SHARED_ROUTING_STATE_STORAGE_KEY,
                serializedState,
            ),
    });
const resolveBackgroundRoutingState = createBackgroundRoutingStateResolver({
    getLiveState: () => sharedRoutingState,
    hasLiveState: () => liveRoutingStateHasBeenSet,
    readPersistedState: () =>
        AsyncStorage.getItem(SHARED_ROUTING_STATE_STORAGE_KEY),
    readTimeoutMs: BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
});

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
        drivingModeIsActive: state?.drivingModeIsActive === true,
    };
}

export function getSharedRoutingState() {
    return sharedRoutingState;
}

export async function getSharedRoutingStateForBackgroundAsync() {
    return (
        (await resolveBackgroundRoutingState()) ?? DEFAULT_SHARED_ROUTING_STATE
    );
}

export function setSharedRoutingState(nextState) {
    const normalizedState = normalizeRoutingState({
        ...sharedRoutingState,
        ...nextState,
    });
    const serializedState = serializePersistedSharedRoutingState(
        normalizedState,
        Date.now(),
    );

    liveRoutingStateHasBeenSet = true;

    if (serializedState) {
        sharedRoutingStatePersistenceScheduler.schedule(serializedState, {
            immediate: true,
        });
    }

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
