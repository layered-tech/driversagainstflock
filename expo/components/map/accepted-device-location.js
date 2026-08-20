let latestAcceptedDeviceLocation = null;

const acceptedDeviceLocationListeners = new Set();

export function publishAcceptedDeviceLocation(location) {
    if (!location) {
        return;
    }

    latestAcceptedDeviceLocation = location;

    for (const listener of acceptedDeviceLocationListeners) {
        try {
            listener(location);
        } catch {}
    }
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
