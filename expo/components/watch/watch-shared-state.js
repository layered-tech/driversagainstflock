const listeners = new Set();
let upcomingAlerts = [];
let areas = { status: 'loading', sourceAt: null, items: [] };

function notify() {
    listeners.forEach((listener) => listener());
}

export function subscribeWatchSharedState(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setWatchUpcomingAlerts(alerts) {
    upcomingAlerts = Array.isArray(alerts) ? alerts : [];
    notify();
}

export function getWatchUpcomingAlerts() {
    return upcomingAlerts;
}

export function setWatchAreas(next) {
    areas = next;
    notify();
}

export function getWatchAreas() {
    return areas;
}
