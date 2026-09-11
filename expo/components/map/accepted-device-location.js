import { getAutoDriveSimulationIsActive } from '../auto-play-drive-simulation';

const AUTO_DRIVE_SIMULATION_LOCATION_PROVIDER = 'auto-drive-simulation';

let latestAcceptedDeviceLocation = null;

const acceptedDeviceLocationListeners = new Set();

export function publishAcceptedDeviceLocation(location) {
    if (!location) {
        return;
    }

    if (
        getAutoDriveSimulationIsActive() &&
        location.locationProvider !== AUTO_DRIVE_SIMULATION_LOCATION_PROVIDER
    ) {
        return;
    }

    const listenerSettlements = [];

    latestAcceptedDeviceLocation = location;

    for (const listener of acceptedDeviceLocationListeners) {
        try {
            const settlement = listener(location);

            if (settlement && typeof settlement.then === 'function') {
                listenerSettlements.push(settlement);
            }
        } catch {}
    }

    return Promise.allSettled(listenerSettlements);
}

export function getLatestAcceptedDeviceLocation() {
    return latestAcceptedDeviceLocation;
}

export function addAcceptedDeviceLocationListener(listener) {
    acceptedDeviceLocationListeners.add(listener);

    return {
        remove() {
            acceptedDeviceLocationListeners.delete(listener);
        },
    };
}
