import { useSyncExternalStore } from 'react';
import { getDirections } from './api';
import { DEBUG_OVERLAY_DIRECTIONS_GEOMETRY } from './debug-overlays';
import {
    addSharedMapPreferencesStateListener,
    getSharedMapPreferencesState,
} from './shared-map-preferences-sync';
import { createSharedNavigationReroutingController } from './shared-navigation-rerouting';
import {
    addSharedRoutingStateListener,
    getSharedRoutingState,
    setSharedRoutingState,
} from './shared-routing-state';

let rerouting = false;
const statusListeners = new Set();
const controller = createSharedNavigationReroutingController({
    getDirections,
    getRoutingState: getSharedRoutingState,
    publishRoute: (directionsRoute) =>
        setSharedRoutingState({ directionsRoute }),
    getShowZone: () =>
        getSharedMapPreferencesState().debugOverlayVisibility?.[
            DEBUG_OVERLAY_DIRECTIONS_GEOMETRY
        ] === true,
    onStatusChange: (value) => {
        rerouting = value;
        statusListeners.forEach((listener) => listener());
    },
});

export function updateSharedNavigationLocation(location) {
    controller.update(location);
}

export function cancelSharedNavigationRerouting() {
    controller.cancel();
}

export function startSharedNavigationController() {
    const removeRoutingListener = addSharedRoutingStateListener(() =>
        controller.update(),
    );
    const removeLocationListener = addSharedMapPreferencesStateListener(() =>
        controller.update(getSharedMapPreferencesState().userLocation),
    );
    return () => {
        removeRoutingListener();
        removeLocationListener();
        controller.cancel();
    };
}

function subscribeStatus(listener) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
}

export function useSharedNavigationRerouting() {
    return useSyncExternalStore(
        subscribeStatus,
        () => rerouting,
        () => false,
    );
}
