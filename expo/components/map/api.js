import { addSentryBreadcrumb } from '../../lib/sentry';
import {
    getMockDirections,
    getMockPlaceDetails,
    getMockSpeedLimit,
    mapApiMocksAreEnabled,
    searchMockPlaces,
    searchMockTextPlaces,
} from './api-mocks';
import { buildApiURL } from './config';
import {
    normalizeDirectionsDebugFeatureCollection,
    normalizeDirectionsRouteResponse,
} from './directions';
import {
    getCoordinateDistanceMeters,
    getStoredNumber,
    normalizeLongitude,
} from './geo';
import {
    getCachedPlaceDetails,
    setCachedPlaceDetails,
} from './place-details-cache';
import { normalizePlaceDetails } from './place-formatters';

const GENERIC_ALPR_PROFILE = {
    id: 'generic-alpr',
    name: 'ALPR (any)',
    tags: {
        'surveillance:type': 'ALPR',
    },
};

export function getPlaceSearchLocationBias(location) {
    const latitude = getStoredNumber(location?.latitude);
    const longitude = getStoredNumber(location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return {
        circle: {
            center: {
                latitude,
                longitude: normalizeLongitude(longitude),
            },
        },
    };
}

export function getPlaceSearchLocationBiasKey(location) {
    const locationBias = getPlaceSearchLocationBias(location);
    const center = locationBias?.circle?.center;

    if (!center) {
        return '';
    }

    return [center.latitude.toFixed(3), center.longitude.toFixed(3)].join(',');
}

export function getPlaceSearchOrigin(location) {
    const center = getPlaceSearchLocationBias(location)?.circle?.center;

    if (!center) {
        return null;
    }

    return {
        latitude: center.latitude,
        longitude: center.longitude,
    };
}

async function readSearchResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Search is rate limited. Try again shortly.');
        }

        throw new Error(
            data?.message ||
                Object.values(data?.errors ?? {})?.flat()?.[0] ||
                'Places could not be loaded.',
        );
    }

    return data;
}

async function readDirectionsResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
        throw new Error(
            data?.error || data?.message || 'Directions could not be loaded.',
        );
    }

    const route = normalizeDirectionsRouteResponse(data?.result);
    const exclusionZone = data?.result?.exclusion_zone ?? null;

    return {
        route,
        debugGeometry: normalizeDirectionsDebugFeatureCollection(
            data?.result?.debug_geometry,
            exclusionZone,
        ),
        exclusionZone,
    };
}

async function readSpeedLimitResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
        throw new Error(
            data?.error || data?.message || 'Speed limit could not be loaded.',
        );
    }

    const result = data?.result;
    const speedLimitMph = getStoredNumber(result?.speed_limit_mph);

    if (!result || speedLimitMph === null) {
        return null;
    }

    return {
        maxspeed: typeof result.maxspeed === 'string' ? result.maxspeed : '',
        osmWayId: result.osm_way_id ?? null,
        speedLimitMph,
        unit: result.unit || 'mph',
    };
}

function throwIfAborted(signal) {
    if (!signal?.aborted) {
        return;
    }

    const error = new Error('Request aborted.');
    error.name = 'AbortError';
    throw error;
}

function normalizePlaceSearchSuggestions(suggestions) {
    if (!Array.isArray(suggestions)) {
        return [];
    }

    return suggestions
        .map((suggestion, index) => {
            const prediction = suggestion?.placePrediction;
            const primaryText =
                prediction?.structuredFormat?.mainText?.text ??
                prediction?.text?.text ??
                '';
            const secondaryText =
                prediction?.structuredFormat?.secondaryText?.text ?? '';
            const label = [primaryText, secondaryText]
                .filter(Boolean)
                .join(', ');
            const distanceMeters = getStoredNumber(prediction?.distanceMeters);

            if (!primaryText && !secondaryText) {
                return null;
            }

            return {
                id: prediction?.placeId ?? `${label}-${index}`,
                label,
                distanceMeters,
                placeId: prediction?.placeId ?? null,
                primaryText: primaryText || secondaryText,
                secondaryText,
            };
        })
        .filter(Boolean);
}

function getTextSearchPlaceId(place, fallbackId) {
    if (typeof place?.id === 'string' && place.id.trim()) {
        return place.id.trim();
    }

    if (typeof place?.name === 'string' && place.name.trim()) {
        return place.name.replace(/^places\//, '').trim();
    }

    return fallbackId;
}

function getTextSearchResultDistanceMeters(place, origin) {
    const originLatitude = getStoredNumber(origin?.latitude);
    const originLongitude = getStoredNumber(origin?.longitude);
    const latitude = getStoredNumber(place?.location?.latitude);
    const longitude = getStoredNumber(place?.location?.longitude);

    if (
        originLatitude === null ||
        originLongitude === null ||
        latitude === null ||
        longitude === null
    ) {
        return null;
    }

    return getCoordinateDistanceMeters(
        [originLongitude, originLatitude],
        [normalizeLongitude(longitude), latitude],
    );
}

function normalizePlaceTextSearchResults(places, origin) {
    if (!Array.isArray(places)) {
        return [];
    }

    return places
        .map((place, index) => {
            const normalizedPlace = normalizePlaceDetails(place);
            const latitude = getStoredNumber(
                normalizedPlace?.location?.latitude,
            );
            const longitude = getStoredNumber(
                normalizedPlace?.location?.longitude,
            );
            const primaryText =
                typeof normalizedPlace?.displayName?.text === 'string'
                    ? normalizedPlace.displayName.text
                    : '';
            const secondaryText =
                typeof normalizedPlace?.formattedAddress === 'string'
                    ? normalizedPlace.formattedAddress
                    : '';
            const label = [primaryText, secondaryText]
                .filter(Boolean)
                .join(', ');

            if (
                latitude === null ||
                longitude === null ||
                latitude < -90 ||
                latitude > 90 ||
                (!primaryText && !secondaryText)
            ) {
                return null;
            }

            const fallbackId = `${label}-${longitude.toFixed(6)}-${latitude.toFixed(
                6,
            )}-${index}`;
            const placeId = getTextSearchPlaceId(normalizedPlace, fallbackId);

            return {
                id: placeId,
                label,
                coordinate: [normalizeLongitude(longitude), latitude],
                distanceMeters: getTextSearchResultDistanceMeters(
                    normalizedPlace,
                    origin,
                ),
                place: normalizedPlace,
                placeId,
                primaryText: primaryText || secondaryText,
                secondaryText,
            };
        })
        .filter(Boolean);
}

function addApiErrorBreadcrumb({ error, operation }) {
    if (error?.name === 'AbortError') {
        return;
    }

    addSentryBreadcrumb({
        category: 'api',
        data: {
            errorMessage: error?.message,
            operation,
        },
        level: 'error',
        message: `${operation} failed`,
    });
}

function normalizeZipCode(value) {
    const zip = typeof value === 'string' ? value.trim() : '';
    const match = zip.match(/^\d{5}(?:-\d{4})?$/);

    return match ? zip.slice(0, 5) : '';
}

function normalizeLocalityBounds(bounds) {
    const sw = Array.isArray(bounds?.sw)
        ? bounds.sw.map((value) => getStoredNumber(value))
        : [];
    const ne = Array.isArray(bounds?.ne)
        ? bounds.ne.map((value) => getStoredNumber(value))
        : [];

    if (
        sw.length < 2 ||
        ne.length < 2 ||
        sw.some((value) => value === null) ||
        ne.some((value) => value === null)
    ) {
        return null;
    }

    return {
        sw: [normalizeLongitude(sw[0]), sw[1]],
        ne: [normalizeLongitude(ne[0]), ne[1]],
    };
}

function normalizeLocalityBoundary(data) {
    const bounds = normalizeLocalityBounds(data?.bounds);
    const boundary =
        data?.boundary?.type === 'FeatureCollection' &&
        Array.isArray(data.boundary.features)
            ? data.boundary
            : null;

    if (!bounds) {
        return null;
    }

    return {
        boundary,
        bounds,
        name: typeof data?.name === 'string' ? data.name : '',
        source: typeof data?.source === 'string' ? data.source : '',
        state: typeof data?.state === 'string' ? data.state : '',
        zip: typeof data?.zip === 'string' ? data.zip : '',
    };
}

export async function searchPlaces({
    input,
    location,
    locationBias,
    origin,
    signal,
}) {
    const resolvedLocationBias =
        locationBias === undefined
            ? getPlaceSearchLocationBias(location)
            : locationBias;
    const resolvedOrigin =
        origin === undefined ? getPlaceSearchOrigin(location) : origin;

    if (mapApiMocksAreEnabled()) {
        return searchMockPlaces({ input, origin: resolvedOrigin, signal });
    }

    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };
    const body = {
        input,
    };

    if (resolvedLocationBias) {
        body.locationBias = resolvedLocationBias;
    }

    if (resolvedOrigin) {
        body.origin = resolvedOrigin;
    }

    addSentryBreadcrumb({
        category: 'map.search',
        data: {
            hasLocationBias: Boolean(resolvedLocationBias),
            hasOrigin: Boolean(resolvedOrigin),
            inputLength: typeof input === 'string' ? input.length : 0,
        },
        message: 'Place autocomplete requested',
    });

    let data;

    try {
        const response = await fetch(buildApiURL('search/autocomplete'), {
            body: JSON.stringify(body),
            headers,
            method: 'POST',
            signal,
        });

        data = await readSearchResponse(response);
    } catch (error) {
        addApiErrorBreadcrumb({
            error,
            operation: 'Place autocomplete',
        });
        throw error;
    }

    const suggestions = normalizePlaceSearchSuggestions(data?.suggestions);

    addSentryBreadcrumb({
        category: 'map.search',
        data: {
            resultCount: suggestions.length,
        },
        message: 'Place autocomplete loaded',
    });

    return suggestions;
}

export async function searchTextPlaces({
    location,
    locationBias,
    signal,
    textQuery,
}) {
    const input = typeof textQuery === 'string' ? textQuery.trim() : '';
    const resolvedLocationBias =
        locationBias === undefined
            ? getPlaceSearchLocationBias(location)
            : locationBias;
    const resolvedOrigin = getPlaceSearchOrigin(location);

    if (!input) {
        return [];
    }

    throwIfAborted(signal);

    if (mapApiMocksAreEnabled()) {
        return searchMockTextPlaces({
            input,
            origin: resolvedOrigin,
            signal,
        });
    }

    const body = {
        textQuery: input,
    };

    if (resolvedLocationBias) {
        body.locationBias = resolvedLocationBias;
    }

    addSentryBreadcrumb({
        category: 'map.search',
        data: {
            hasLocationBias: Boolean(resolvedLocationBias),
            inputLength: input.length,
        },
        message: 'Place text search requested',
    });

    let data;

    try {
        const response = await fetch(buildApiURL('search'), {
            body: JSON.stringify(body),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            method: 'POST',
            signal,
        });

        data = await readSearchResponse(response);
    } catch (error) {
        addApiErrorBreadcrumb({
            error,
            operation: 'Place text search',
        });
        throw error;
    }

    const results = normalizePlaceTextSearchResults(
        data?.places,
        resolvedOrigin,
    );

    addSentryBreadcrumb({
        category: 'map.search',
        data: {
            resultCount: results.length,
        },
        message: 'Place text search loaded',
    });

    return results;
}

export async function getPlaceDetails({ placeId, signal }) {
    const safePlaceId = typeof placeId === 'string' ? placeId.trim() : '';

    if (!safePlaceId) {
        throw new Error('Place location could not be loaded.');
    }

    throwIfAborted(signal);

    if (mapApiMocksAreEnabled()) {
        return getMockPlaceDetails({ placeId: safePlaceId, signal });
    }

    const cachedPlace = await getCachedPlaceDetails(safePlaceId).catch(
        () => null,
    );

    throwIfAborted(signal);

    if (cachedPlace) {
        addSentryBreadcrumb({
            category: 'map.place',
            data: {
                cacheHit: true,
            },
            message: 'Place details loaded from cache',
        });
        return cachedPlace;
    }

    addSentryBreadcrumb({
        category: 'map.place',
        data: {
            cacheHit: false,
        },
        message: 'Place details requested',
    });

    let data;

    try {
        const response = await fetch(
            buildApiURL(`place/${encodeURIComponent(safePlaceId)}`),
            {
                headers: {
                    Accept: 'application/json',
                },
                signal,
            },
        );

        data = await readSearchResponse(response);
    } catch (error) {
        addApiErrorBreadcrumb({
            error,
            operation: 'Place details',
        });
        throw error;
    }

    const place = normalizePlaceDetails(data);

    if (!place.location) {
        throw new Error('Place location could not be loaded.');
    }

    setCachedPlaceDetails(safePlaceId, place).catch(() => {});
    addSentryBreadcrumb({
        category: 'map.place',
        data: {
            hasLocation: Boolean(place.location),
            placeType: place.primaryType || place.type || 'unknown',
        },
        message: 'Place details loaded',
    });

    return place;
}

export async function getLocalityBoundary({ signal, zip }) {
    const safeZip = normalizeZipCode(zip);

    if (!safeZip) {
        throw new Error('Enter a valid ZIP code.');
    }

    throwIfAborted(signal);

    addSentryBreadcrumb({
        category: 'map.search',
        data: {
            zip: safeZip,
        },
        message: 'Locality boundary requested',
    });

    let data;

    try {
        const response = await fetch(
            buildApiURL('locality-boundary', {
                zip: safeZip,
            }),
            {
                headers: {
                    Accept: 'application/json',
                },
                signal,
            },
        );

        data = await readSearchResponse(response);
    } catch (error) {
        addApiErrorBreadcrumb({
            error,
            operation: 'Locality boundary',
        });
        throw error;
    }

    const localityBoundary = normalizeLocalityBoundary(data);

    if (!localityBoundary) {
        throw new Error('ZIP boundary could not be loaded.');
    }

    addSentryBreadcrumb({
        category: 'map.search',
        data: {
            hasBoundary: Boolean(localityBoundary.boundary),
            zip: localityBoundary.zip,
        },
        message: 'Locality boundary loaded',
    });

    return localityBoundary;
}

export async function getDirections({
    end,
    showZone = false,
    signal,
    start,
    waypoints = [],
}) {
    if (mapApiMocksAreEnabled()) {
        return getMockDirections({ end, showZone, signal, start, waypoints });
    }

    addSentryBreadcrumb({
        category: 'map.directions',
        data: {
            hasEnd: Boolean(end),
            hasStart: Boolean(start),
            waypointCount: Array.isArray(waypoints) ? waypoints.length : 0,
            profileCount: 1,
        },
        message: 'Directions requested',
    });

    try {
        const response = await fetch(buildApiURL('v1/directions'), {
            body: JSON.stringify({
                continue_straight: true,
                end,
                profile: [GENERIC_ALPR_PROFILE],
                show_zone: showZone === true,
                start,
                waypoints: Array.isArray(waypoints) ? waypoints : [],
            }),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            method: 'POST',
            signal,
        });
        const result = await readDirectionsResponse(response);

        addSentryBreadcrumb({
            category: 'map.directions',
            data: {
                hasExclusionZone: Boolean(result.exclusionZone),
                hasRoute: Boolean(result.route),
            },
            message: 'Directions loaded',
        });

        return result;
    } catch (error) {
        addApiErrorBreadcrumb({
            error,
            operation: 'Directions',
        });
        throw error;
    }
}

export async function getSpeedLimit({ location, signal }) {
    if (mapApiMocksAreEnabled()) {
        return getMockSpeedLimit({ signal });
    }

    const latitude = getStoredNumber(location?.latitude);
    const longitude = getStoredNumber(location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    try {
        const response = await fetch(
            buildApiURL('v1/speed-limit', {
                latitude,
                longitude: normalizeLongitude(longitude),
            }),
            {
                headers: {
                    Accept: 'application/json',
                },
                signal,
            },
        );
        const speedLimit = await readSpeedLimitResponse(response);

        addSentryBreadcrumb({
            category: 'map.speed_limit',
            data: {
                hasSpeedLimit: Boolean(speedLimit),
                unit: speedLimit?.unit,
            },
            message: 'Speed limit loaded',
        });

        return speedLimit;
    } catch (error) {
        addApiErrorBreadcrumb({
            error,
            operation: 'Speed limit',
        });
        throw error;
    }
}
