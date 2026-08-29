import { getStoredNumber, normalizeLongitude } from './geo';

export function normalizePlaceDetails(place) {
    const latitude = getStoredNumber(place?.location?.latitude);
    const longitude = getStoredNumber(place?.location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return {
            ...place,
            location: null,
        };
    }

    return {
        ...place,
        location: {
            latitude,
            longitude: normalizeLongitude(longitude),
        },
    };
}

export function getPlaceCoordinate(place) {
    const latitude = getStoredNumber(place?.location?.latitude);
    const longitude = getStoredNumber(place?.location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [normalizeLongitude(longitude), latitude];
}

export function getLocalizedText(value) {
    if (typeof value === 'string') {
        return value;
    }

    return typeof value?.text === 'string' ? value.text : '';
}

export function formatEnumLabel(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function getPlaceDisplayName(place, fallbackResult) {
    return (
        getLocalizedText(place?.displayName) ||
        fallbackResult?.primaryText ||
        fallbackResult?.label ||
        'Selected place'
    );
}

export function getPlaceAddress(place, fallbackResult) {
    return (
        place?.formattedAddress ||
        place?.shortFormattedAddress ||
        fallbackResult?.secondaryText ||
        ''
    );
}

export function getPlaceTypeLabel(place) {
    return (
        getLocalizedText(place?.primaryTypeDisplayName) ||
        formatEnumLabel(place?.primaryType) ||
        formatEnumLabel(place?.types?.[0])
    );
}
