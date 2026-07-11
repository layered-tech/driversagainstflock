import { PLACE_RATING_STAR_COUNT } from './constants';
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

export function getPlacePhoneNumber(place) {
    return place?.nationalPhoneNumber || place?.internationalPhoneNumber || '';
}

export function formatCompactCount(value) {
    const count = getStoredNumber(value);

    if (count === null) {
        return '';
    }

    if (count >= 1000000) {
        return `${Number((count / 1000000).toFixed(count >= 10000000 ? 0 : 1))}M`;
    }

    if (count >= 1000) {
        return `${Number((count / 1000).toFixed(count >= 10000 ? 0 : 1))}k`;
    }

    return String(Math.round(count));
}

export function getPlaceRatingValue(place) {
    const rating = getStoredNumber(place?.rating);

    if (rating === null) {
        return null;
    }

    return Math.max(0, Math.min(PLACE_RATING_STAR_COUNT, rating));
}

export function formatPlaceRating(place) {
    const rating = getPlaceRatingValue(place);

    if (rating === null) {
        return '';
    }

    const ratingLabel = Number.isInteger(rating)
        ? String(rating)
        : rating.toFixed(1);
    const reviewCount = formatCompactCount(place?.userRatingCount);

    return reviewCount ? `${ratingLabel} (${reviewCount})` : ratingLabel;
}

export function getPlaceRatingStarStates(rating) {
    if (rating === null) {
        return [];
    }

    const roundedRating = Math.round(rating * 2) / 2;

    return Array.from({ length: PLACE_RATING_STAR_COUNT }, (_, index) => {
        const starValue = index + 1;

        if (roundedRating >= starValue) {
            return 'full';
        }

        return roundedRating >= starValue - 0.5 ? 'half' : 'empty';
    });
}

export function getPlaceOpeningHours(place) {
    return place?.currentOpeningHours ?? place?.regularOpeningHours ?? null;
}

export function getPlaceOpenNowLabel(place) {
    const openingHours = getPlaceOpeningHours(place);

    if (typeof openingHours?.openNow !== 'boolean') {
        return '';
    }

    return openingHours.openNow ? 'Open' : 'Closed';
}

export function getPlaceWeekdayDescriptions(place) {
    const descriptions =
        place?.regularOpeningHours?.weekdayDescriptions ??
        place?.currentOpeningHours?.weekdayDescriptions;

    return Array.isArray(descriptions)
        ? descriptions.filter((description) => typeof description === 'string')
        : [];
}

export function getPlaceCurrentHoursSummary(place) {
    const openingHours = getPlaceOpeningHours(place);

    if (openingHours?.openNow !== true) {
        return '';
    }

    const descriptions = getPlaceWeekdayDescriptions(place);
    const weekdayIndex = new Date().getDay();
    const weekdayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
    ];
    const currentDayName = weekdayNames[weekdayIndex];
    const currentDescription =
        descriptions.find((description) =>
            description.toLowerCase().startsWith(currentDayName.toLowerCase()),
        ) ?? '';
    const hoursText = currentDescription.replace(/^[^:]+:\s*/, '').trim();

    if (!hoursText || /closed/i.test(hoursText)) {
        return '';
    }

    const segments = hoursText
        .split(/\s+[–-]\s+|\s+to\s+/i)
        .map((segment) => segment.trim())
        .filter(Boolean);
    const closeTime = segments[segments.length - 1];

    return closeTime ? `until ${closeTime}` : hoursText;
}
