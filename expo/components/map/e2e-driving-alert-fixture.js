import { useSyncExternalStore } from 'react';

const E2E_DRIVING_ALERT_FIXTURES = new Set(['alpr', 'combined', 'police']);

let activeE2EDrivingAlertsFixture = null;
const e2eDrivingAlertsFixtureListeners = new Set();

export function normalizeE2EDrivingAlertsFixture(value) {
    const fixture = String(value ?? '')
        .trim()
        .toLowerCase();

    return E2E_DRIVING_ALERT_FIXTURES.has(fixture) ? fixture : null;
}

export function getE2EDrivingAlertsFixture(value, now = Date.now()) {
    const fixture = normalizeE2EDrivingAlertsFixture(value);

    if (!fixture) {
        return null;
    }

    const policeAlert = {
        distanceMeters: 244,
        id: 'e2e-police-alert',
        source: {
            publishedAt: new Date(now - 4 * 60 * 1000).toISOString(),
        },
        type: 'police',
    };
    const alprAlert = {
        distanceMeters: 483,
        id: 'e2e-alpr-alert',
        source: {
            tags: {
                manufacturer: 'Flock Safety',
            },
        },
        type: 'alpr',
    };

    if (fixture === 'police') {
        return [policeAlert];
    }

    if (fixture === 'alpr') {
        return [alprAlert];
    }

    return [policeAlert, alprAlert];
}

export function setE2EDrivingAlertsFixture(value) {
    const nextFixture = normalizeE2EDrivingAlertsFixture(value);

    if (nextFixture === activeE2EDrivingAlertsFixture) {
        return;
    }

    activeE2EDrivingAlertsFixture = nextFixture;
    e2eDrivingAlertsFixtureListeners.forEach((listener) => listener());
}

function subscribeToE2EDrivingAlertsFixture(listener) {
    e2eDrivingAlertsFixtureListeners.add(listener);

    return () => {
        e2eDrivingAlertsFixtureListeners.delete(listener);
    };
}

function getActiveE2EDrivingAlertsFixture() {
    return activeE2EDrivingAlertsFixture;
}

export function useE2EDrivingAlertsFixture() {
    const fixture = useSyncExternalStore(
        subscribeToE2EDrivingAlertsFixture,
        getActiveE2EDrivingAlertsFixture,
        getActiveE2EDrivingAlertsFixture,
    );

    return getE2EDrivingAlertsFixture(fixture);
}
