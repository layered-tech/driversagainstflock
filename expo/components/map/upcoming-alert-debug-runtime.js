import { presenceCoordinator } from './alpr-presence-runtime';
import { SHOW_MAP_DEBUG_CONTROLS } from './config';
import { DEBUG_OVERLAY_UPCOMING_ALERTS } from './debug-overlays';
import {
    addSharedMapPreferencesStateListener,
    getSharedMapPreferencesState,
} from './shared-map-preferences-sync';
import { upcomingAlertDebugStore } from './upcoming-alert-debug';

let started = false;
const resetListeners = new Set();
export function startUpcomingAlertDebug() {
    if (started) return;
    started = true;
    const update = (preferences) =>
        upcomingAlertDebugStore.setEnabled(
            SHOW_MAP_DEBUG_CONTROLS &&
                preferences.debugOverlayVisibility?.[
                    DEBUG_OVERLAY_UPCOMING_ALERTS
                ] === true,
        );
    update(getSharedMapPreferencesState());
    addSharedMapPreferencesStateListener(update);
}
export function addUpcomingAlertDebugResetListener(listener) {
    resetListeners.add(listener);
    return () => resetListeners.delete(listener);
}
export async function resetUpcomingAlertDebugHistory() {
    if (!SHOW_MAP_DEBUG_CONTROLS) throw new Error('Debug controls unavailable');
    resetListeners.forEach((listener) => listener());
    await presenceCoordinator.resetAutomotiveAlertHistory();
    upcomingAlertDebugStore.event('Upcoming warning history reset');
}
