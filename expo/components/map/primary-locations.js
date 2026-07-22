export const PRIMARY_LOCATION_HOME = 'home';
export const PRIMARY_LOCATION_WORK = 'work';

const PRIMARY_LOCATION_LABELS = {
    [PRIMARY_LOCATION_HOME]: 'Home',
    [PRIMARY_LOCATION_WORK]: 'Work',
};

const RESIDENTIAL_BUILDING_PLACE_TYPES = new Set([
    'apartment_building',
    'apartment_complex',
    'condominium_complex',
    'housing_complex',
]);

const RESIDENTIAL_ADDRESS_PLACE_TYPES = new Set([
    'premise',
    'street_address',
    'subpremise',
]);

const WORK_PLACE_TYPES = new Set([
    'business_center',
    'corporate_office',
    'coworking_space',
    'establishment',
    'government_office',
    'office',
]);

function getSafeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function getSafeCoordinate(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const coordinate = Number(value);

    return Number.isFinite(coordinate) ? coordinate : null;
}

function normalizeLongitude(longitude) {
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function getPlaceTypes(place) {
    return [
        place?.primaryType,
        ...(Array.isArray(place?.types) ? place.types : []),
    ]
        .map((type) => getSafeString(type).toLowerCase())
        .filter(Boolean);
}

export function isPrimaryLocationType(type) {
    return type === PRIMARY_LOCATION_HOME || type === PRIMARY_LOCATION_WORK;
}

export function getPrimaryLocationLabel(type) {
    return PRIMARY_LOCATION_LABELS[type] ?? '';
}

export function getSuggestedPrimaryLocationType(place) {
    const placeTypes = getPlaceTypes(place);

    if (
        placeTypes.some((type) => RESIDENTIAL_BUILDING_PLACE_TYPES.has(type)) ||
        (!place?.businessStatus &&
            placeTypes.some((type) =>
                RESIDENTIAL_ADDRESS_PLACE_TYPES.has(type),
            ))
    ) {
        return PRIMARY_LOCATION_HOME;
    }

    if (
        getSafeString(place?.businessStatus) ||
        placeTypes.some((type) => WORK_PLACE_TYPES.has(type))
    ) {
        return PRIMARY_LOCATION_WORK;
    }

    return null;
}

export function getPrimaryLocationTypeToOffer({
    place,
    preferredType,
    primaryLocations,
}) {
    const type = isPrimaryLocationType(preferredType)
        ? preferredType
        : getSuggestedPrimaryLocationType(place);

    if (!type || primaryLocations?.[type]) {
        return null;
    }

    return type;
}

export function createEmptyPrimaryLocations() {
    return {
        [PRIMARY_LOCATION_HOME]: null,
        [PRIMARY_LOCATION_WORK]: null,
    };
}

export function parseStoredPrimaryLocations(value, normalizeLocation) {
    if (!value) {
        return createEmptyPrimaryLocations();
    }

    try {
        const storedLocations = JSON.parse(value);

        if (!storedLocations || typeof storedLocations !== 'object') {
            return createEmptyPrimaryLocations();
        }

        return {
            [PRIMARY_LOCATION_HOME]:
                normalizeLocation(storedLocations[PRIMARY_LOCATION_HOME]) ??
                null,
            [PRIMARY_LOCATION_WORK]:
                normalizeLocation(storedLocations[PRIMARY_LOCATION_WORK]) ??
                null,
        };
    } catch {
        return createEmptyPrimaryLocations();
    }
}

export function updatePrimaryLocations(
    primaryLocations,
    type,
    location,
    normalizeLocation,
) {
    const normalizedLocations = {
        ...createEmptyPrimaryLocations(),
        ...primaryLocations,
    };

    if (!isPrimaryLocationType(type)) {
        return normalizedLocations;
    }

    if (location === null) {
        return {
            ...normalizedLocations,
            [type]: null,
        };
    }

    const normalizedLocation = normalizeLocation(location);

    if (!normalizedLocation) {
        return normalizedLocations;
    }

    return {
        ...normalizedLocations,
        [type]: normalizedLocation,
    };
}

export function createPrimaryLocationDirectionsWaypoint(type, location) {
    if (!isPrimaryLocationType(type) || !location) {
        return null;
    }

    const latitude = getSafeCoordinate(location.latitude);
    const longitude = getSafeCoordinate(location.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    const label = getPrimaryLocationLabel(type);
    const savedName = getSafeString(location.name) || label;
    const address = getSafeString(location.address);
    const typeLabel = getSafeString(location.typeLabel);
    const placeId =
        getSafeString(location.placeId) ||
        getSafeString(location.id) ||
        `${type}-${latitude}-${longitude}`;
    const normalizedLongitude = normalizeLongitude(longitude);
    const subtitle = [typeLabel, address || savedName]
        .filter(Boolean)
        .join(' - ');
    const result = {
        address,
        id: getSafeString(location.id) || placeId,
        label: [savedName, address].filter(Boolean).join(', '),
        placeId,
        primaryText: savedName,
        secondaryText: address,
        typeLabel,
    };
    const place = {
        displayName: { text: savedName },
        formattedAddress: address,
        id: placeId,
        location: {
            latitude,
            longitude: normalizedLongitude,
        },
        primaryTypeDisplayName: typeLabel ? { text: typeLabel } : undefined,
    };

    return {
        id: placeId,
        inputValue: address || savedName,
        kind: 'place',
        label,
        location: place.location,
        place,
        placeId,
        result,
        subtitle,
    };
}
