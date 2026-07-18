export function normalizeNodeLocation(location) {
    const latitude = location?.latitude;
    const longitude = location?.longitude;

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null;
    }

    return { latitude, longitude };
}

export function getNodeLocationFromMapFeature(feature) {
    const coordinates = feature?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
    }

    return normalizeNodeLocation({
        latitude: coordinates[1],
        longitude: coordinates[0],
    });
}

export function updatePinLocationInList(pins, pinId, location) {
    if (!Array.isArray(pins)) {
        return [];
    }

    const normalizedLocation = normalizeNodeLocation(location);

    if (!normalizedLocation) {
        return pins;
    }

    let didUpdateLocation = false;
    const updatedPins = pins.map((pin) => {
        if (pin.id !== pinId) {
            return pin;
        }

        if (
            pin.latitude === normalizedLocation.latitude &&
            pin.longitude === normalizedLocation.longitude
        ) {
            return pin;
        }

        didUpdateLocation = true;

        return { ...pin, ...normalizedLocation };
    });

    return didUpdateLocation ? updatedPins : pins;
}
