import {
    getPrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import { BACKGROUND_ALERT_STORAGE_TIMEOUT_MS } from './background-alert-budget';
import { getSelectedDirectionsRouteOption } from './directions';
import { createMapPreferencesPersistenceScheduler } from './map-preferences-persistence';
import {
    createBackgroundRoutingStateResolver,
    parsePersistedSharedRoutingState,
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
let sharedRoutingStateHydrationPromise = null;
let sharedRoutingStateStorageReadHasCompleted = false;
let sharedRoutingStateStorageReadPromise = null;
const sharedRoutingStateListeners = new Set();
const sharedRoutingStatePersistenceScheduler =
    createMapPreferencesPersistenceScheduler({
        write: (serializedState) =>
            setPrivateCacheItem(
                SHARED_ROUTING_STATE_STORAGE_KEY,
                serializedState,
            ),
    });
const routeCoordinatesSyncKeyCache = new WeakMap();
const resolveBackgroundRoutingState = createBackgroundRoutingStateResolver({
    getLiveState: () => sharedRoutingState,
    hasLiveState: () => liveRoutingStateHasBeenSet,
    readPersistedState: () =>
        getPrivateCacheItem(SHARED_ROUTING_STATE_STORAGE_KEY),
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

function getRouteCoordinatesSyncKey(coordinates) {
    if (!Array.isArray(coordinates)) {
        return '';
    }

    const cachedKey = routeCoordinatesSyncKeyCache.get(coordinates);

    if (cachedKey) {
        return cachedKey;
    }

    let hash = 2166136261;

    coordinates.forEach((coordinate) => {
        const coordinateKey = `${getCoordinateSyncKey(coordinate)};`;

        for (let index = 0; index < coordinateKey.length; index += 1) {
            hash = Math.imul(hash ^ coordinateKey.charCodeAt(index), 16777619);
        }
    });

    const key = `${coordinates.length}:${(hash >>> 0).toString(36)}`;

    routeCoordinatesSyncKeyCache.set(coordinates, key);

    return key;
}

export function getDirectionsRouteSyncKey(route) {
    if (!route) {
        return '';
    }

    const routeOption = getSelectedDirectionsRouteOption(route);

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
        getRouteCoordinatesSyncKey(routeOption?.coordinates),
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

export function sharedRoutingStateCanPublish() {
    return (
        liveRoutingStateHasBeenSet || sharedRoutingStateStorageReadHasCompleted
    );
}

function readPersistedSharedRoutingStateAsync() {
    if (sharedRoutingStateStorageReadPromise) {
        return sharedRoutingStateStorageReadPromise;
    }

    const storageRead = Promise.resolve()
        .then(() => getPrivateCacheItem(SHARED_ROUTING_STATE_STORAGE_KEY))
        .then((serializedState) => {
            sharedRoutingStateStorageReadHasCompleted = true;

            if (!liveRoutingStateHasBeenSet) {
                const persistedState =
                    parsePersistedSharedRoutingState(serializedState);

                if (persistedState) {
                    sharedRoutingState = normalizeRoutingState(persistedState);
                }
            }

            sharedRoutingStateListeners.forEach((listener) =>
                listener(sharedRoutingState),
            );

            return sharedRoutingState;
        })
        .catch(() => sharedRoutingState)
        .finally(() => {
            if (sharedRoutingStateStorageReadPromise === storageRead) {
                sharedRoutingStateStorageReadPromise = null;
            }
        });

    sharedRoutingStateStorageReadPromise = storageRead;

    return storageRead;
}

export function hydrateSharedRoutingStateAsync() {
    if (sharedRoutingStateCanPublish()) {
        return Promise.resolve(sharedRoutingState);
    }

    if (sharedRoutingStateHydrationPromise) {
        return sharedRoutingStateHydrationPromise;
    }

    let hydrationTimeoutId = null;
    const hydrationTimeout = new Promise((resolve) => {
        hydrationTimeoutId = setTimeout(
            () => resolve(sharedRoutingState),
            BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
        );
    });

    sharedRoutingStateHydrationPromise = Promise.race([
        readPersistedSharedRoutingStateAsync(),
        hydrationTimeout,
    ]).finally(() => {
        if (hydrationTimeoutId !== null) {
            clearTimeout(hydrationTimeoutId);
        }

        sharedRoutingStateHydrationPromise = null;
    });

    return sharedRoutingStateHydrationPromise;
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
    listener(sharedRoutingState);

    return () => {
        sharedRoutingStateListeners.delete(listener);
    };
}
