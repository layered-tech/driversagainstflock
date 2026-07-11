import { MIN_BOUNDS_SPAN_DEGREES } from './constants';
import { clampLatitude, getStoredNumber, normalizeLongitude } from './geo';

const SEARCH_RESULTS_MIN_BOUNDS_SPAN_DEGREES = MIN_BOUNDS_SPAN_DEGREES * 32;

function getSubmittedSearchResultCoordinate(result) {
    const coordinate = result?.coordinate;

    if (Array.isArray(coordinate) && coordinate.length >= 2) {
        const longitude = getStoredNumber(coordinate[0]);
        const latitude = getStoredNumber(coordinate[1]);

        if (
            longitude !== null &&
            latitude !== null &&
            latitude >= -90 &&
            latitude <= 90
        ) {
            return [normalizeLongitude(longitude), latitude];
        }
    }

    const latitude = getStoredNumber(result?.place?.location?.latitude);
    const longitude = getStoredNumber(result?.place?.location?.longitude);

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

export function getSubmittedSearchResultsBounds(results) {
    const coordinates = (results ?? [])
        .map(getSubmittedSearchResultCoordinate)
        .filter(Boolean);

    if (!coordinates.length) {
        return null;
    }

    const longitudes = coordinates.map((coordinate) => coordinate[0]);
    const latitudes = coordinates.map((coordinate) => coordinate[1]);
    const centerLongitude =
        (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
    const centerLatitude =
        (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
    const longitudeSpan = Math.max(
        SEARCH_RESULTS_MIN_BOUNDS_SPAN_DEGREES,
        Math.max(...longitudes) - Math.min(...longitudes),
    );
    const latitudeSpan = Math.max(
        SEARCH_RESULTS_MIN_BOUNDS_SPAN_DEGREES,
        Math.max(...latitudes) - Math.min(...latitudes),
    );

    return {
        sw: [
            normalizeLongitude(centerLongitude - longitudeSpan / 2),
            clampLatitude(centerLatitude - latitudeSpan / 2),
        ],
        ne: [
            normalizeLongitude(centerLongitude + longitudeSpan / 2),
            clampLatitude(centerLatitude + latitudeSpan / 2),
        ],
    };
}
