import {
    ALPR_SYMBOL_VISIBLE_PROPERTY_NAME,
    DRIVING_COURSE_HEADING_DEADBAND_DEGREES,
    DRIVING_COURSE_HEADING_FILTER_FACTOR,
    DRIVING_COURSE_HEADING_SHARP_TURN_DEGREES,
    DRIVING_COURSE_HEADING_SHARP_TURN_FILTER_FACTOR,
    EMPTY_FEATURE_COLLECTION,
    MARKER_CONE_DIRECTION_PROPERTY_NAMES,
    MAX_MARKER_CONE_DIRECTIONS,
    MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES,
    MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES,
    MAX_WEB_MERCATOR_LATITUDE,
    MAX_ZOOM_LEVEL,
    MIN_ZOOM_LEVEL,
    MINIMUM_DRIVING_COURSE_SPEED_MPS,
} from './constants';
import {
    getMarkerDirectionValues,
    normalizeDirectionDegrees,
} from './direction-values';

export {
    getMarkerDirectionValue,
    getMarkerDirectionValues,
    normalizeDirectionDegrees,
    parseDirectionValues,
} from './direction-values';
export {
    expandBoundsForMarkerRequest,
    getLongitudeIntervals,
    longitudeIntervalsContain,
    markerRequestBoundsContainCameraBounds,
} from './marker-load-bounds';

const FLOCK_ALPR_WIKIDATA_ID = 'Q108485435';
const FLOCK_ALPR_WIKIDATA_TAG_NAMES = [
    'brand:wikidata',
    'manufacturer:wikidata',
];
const EARTH_RADIUS_METERS = 6371008.8;

export function hasPreciseLocation(permission) {
    if (!permission?.granted) {
        return false;
    }

    if (permission.ios?.accuracy) {
        return permission.ios.accuracy === 'full';
    }

    if (permission.android?.accuracy) {
        return permission.android.accuracy === 'fine';
    }

    return true;
}

export function waitForNextPaint() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            setTimeout(resolve, 0);
        });
    });
}

export function clampZoomLevel(zoomLevel) {
    return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, zoomLevel));
}

export function getStoredNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

export function normalizeLongitude(longitude) {
    if (!Number.isFinite(longitude)) {
        return longitude;
    }

    let normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;

    if (normalized === -180 && longitude > 0) {
        normalized = 180;
    }

    return normalized;
}

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
}

export function getCoordinateDistanceMeters(fromCoordinate, toCoordinate) {
    if (
        !Array.isArray(fromCoordinate) ||
        !Array.isArray(toCoordinate) ||
        fromCoordinate.length < 2 ||
        toCoordinate.length < 2
    ) {
        return null;
    }

    const fromLongitude = Number(fromCoordinate[0]);
    const fromLatitude = Number(fromCoordinate[1]);
    const toLongitude = Number(toCoordinate[0]);
    const toLatitude = Number(toCoordinate[1]);

    if (
        !Number.isFinite(fromLongitude) ||
        !Number.isFinite(fromLatitude) ||
        !Number.isFinite(toLongitude) ||
        !Number.isFinite(toLatitude)
    ) {
        return null;
    }

    const fromLatitudeRadians = degreesToRadians(fromLatitude);
    const toLatitudeRadians = degreesToRadians(toLatitude);
    const latitudeDelta = degreesToRadians(toLatitude - fromLatitude);
    const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.sin(longitudeDelta / 2) ** 2;
    const clampedHaversine = Math.min(1, Math.max(0, haversine));

    return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(clampedHaversine), Math.sqrt(1 - clampedHaversine))
    );
}

export function getCoordinateBearingDegrees(fromCoordinate, toCoordinate) {
    if (
        !Array.isArray(fromCoordinate) ||
        !Array.isArray(toCoordinate) ||
        fromCoordinate.length < 2 ||
        toCoordinate.length < 2
    ) {
        return null;
    }

    const fromLongitude = Number(fromCoordinate[0]);
    const fromLatitude = Number(fromCoordinate[1]);
    const toLongitude = Number(toCoordinate[0]);
    const toLatitude = Number(toCoordinate[1]);

    if (
        !Number.isFinite(fromLongitude) ||
        !Number.isFinite(fromLatitude) ||
        !Number.isFinite(toLongitude) ||
        !Number.isFinite(toLatitude)
    ) {
        return null;
    }

    const fromLatitudeRadians = degreesToRadians(fromLatitude);
    const toLatitudeRadians = degreesToRadians(toLatitude);
    const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
    const y = Math.sin(longitudeDelta) * Math.cos(toLatitudeRadians);
    const x =
        Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians) -
        Math.sin(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.cos(longitudeDelta);

    return normalizeDirectionDegrees(radiansToDegrees(Math.atan2(y, x)));
}

export function getLocationCompassHeading(heading) {
    const trueHeading = getStoredNumber(heading?.trueHeading);

    if (trueHeading !== null && trueHeading >= 0) {
        return normalizeDirectionDegrees(trueHeading);
    }

    const magneticHeading = getStoredNumber(heading?.magHeading);

    return magneticHeading !== null && magneticHeading >= 0
        ? normalizeDirectionDegrees(magneticHeading)
        : null;
}

export function getLocationUpdate(location) {
    const latitude = Number(location?.coords?.latitude);
    const longitude = Number(location?.coords?.longitude);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    const accuracy = getStoredNumber(location?.coords?.accuracy);
    const recordedAt = getStoredNumber(location?.timestamp) ?? Date.now();
    const speed = getStoredNumber(location?.coords?.speed);
    const roadMatch =
        location?.roadMatch && typeof location.roadMatch === 'object'
            ? location.roadMatch
            : null;
    const locationProvider =
        typeof location?.locationProvider === 'string'
            ? location.locationProvider
            : roadMatch
              ? 'in-house-road-matcher'
              : 'expo-location';

    return {
        accuracy: accuracy ?? undefined,
        latitude,
        locationProvider,
        longitude: normalizeLongitude(longitude),
        ...(roadMatch ? { roadMatch } : {}),
        recordedAt,
        speed: speed !== null && speed >= 0 ? speed : undefined,
    };
}

export function getLocationCourseHeading(location) {
    const speed = getStoredNumber(location?.coords?.speed);

    if (speed !== null && speed < MINIMUM_DRIVING_COURSE_SPEED_MPS) {
        return null;
    }

    const heading = getStoredNumber(
        location?.coords?.heading ?? location?.coords?.course,
    );

    return heading !== null && heading >= 0
        ? normalizeDirectionDegrees(heading)
        : null;
}

export function getDirectionDeltaDegrees(fromHeading, toHeading) {
    return ((toHeading - fromHeading + 540) % 360) - 180;
}

export function getSmoothedCourseHeading(previousHeading, nextHeading) {
    if (previousHeading === null) {
        return nextHeading;
    }

    const headingDelta = getDirectionDeltaDegrees(previousHeading, nextHeading);
    const absoluteHeadingDelta = Math.abs(headingDelta);

    if (absoluteHeadingDelta < DRIVING_COURSE_HEADING_DEADBAND_DEGREES) {
        return previousHeading;
    }

    const smoothingFactor =
        absoluteHeadingDelta >= DRIVING_COURSE_HEADING_SHARP_TURN_DEGREES
            ? DRIVING_COURSE_HEADING_SHARP_TURN_FILTER_FACTOR
            : DRIVING_COURSE_HEADING_FILTER_FACTOR;

    return normalizeDirectionDegrees(
        previousHeading + headingDelta * smoothingFactor,
    );
}

export function clampLatitude(latitude) {
    return Math.min(
        MAX_WEB_MERCATOR_LATITUDE,
        Math.max(-MAX_WEB_MERCATOR_LATITUDE, latitude),
    );
}

export function roundCoordinate(coordinate) {
    return Number(coordinate.toFixed(6));
}

export function getBoundsFromCameraState(state) {
    const bounds = state?.properties?.bounds;

    if (!Array.isArray(bounds?.ne) || !Array.isArray(bounds?.sw)) {
        return null;
    }

    return {
        ne: bounds.ne,
        sw: bounds.sw,
    };
}

export function getMarkerBoundsKey(bounds) {
    return [bounds.sw_lng, bounds.sw_lat, bounds.ne_lng, bounds.ne_lat].join(
        ',',
    );
}

function getLongitudeSpanDegrees(westLongitude, eastLongitude) {
    return westLongitude > eastLongitude
        ? 360 - westLongitude + eastLongitude
        : eastLongitude - westLongitude;
}

export function getMarkerRequestBoundsSpan(bounds) {
    const southLatitude = Number(bounds?.sw_lat);
    const northLatitude = Number(bounds?.ne_lat);
    const westLongitude = normalizeLongitude(Number(bounds?.sw_lng));
    const eastLongitude = normalizeLongitude(Number(bounds?.ne_lng));

    if (
        !Number.isFinite(southLatitude) ||
        !Number.isFinite(northLatitude) ||
        !Number.isFinite(westLongitude) ||
        !Number.isFinite(eastLongitude)
    ) {
        return null;
    }

    return {
        latitudeSpan: Math.abs(northLatitude - southLatitude),
        longitudeSpan: getLongitudeSpanDegrees(westLongitude, eastLongitude),
    };
}

export function markerRequestBoundsAreLoadable(bounds) {
    const span = getMarkerRequestBoundsSpan(bounds);

    if (!span) {
        return false;
    }

    return (
        span.latitudeSpan <= MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES &&
        span.longitudeSpan <= MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES
    );
}

export function getMarkerCoordinate(marker) {
    const coordinate = marker?.location ?? marker?.geometry?.coordinates;

    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return null;
    }

    return [longitude, latitude];
}

export function nodeShowsAlprSymbol(node) {
    return FLOCK_ALPR_WIKIDATA_TAG_NAMES.some(
        (tagName) => node?.tags?.[tagName] === FLOCK_ALPR_WIKIDATA_ID,
    );
}

export function markerShowsAlprSymbol(marker) {
    const osmNodes = marker?.properties?.osm_nodes;

    if (!Array.isArray(osmNodes)) {
        return false;
    }

    return osmNodes.some(nodeShowsAlprSymbol);
}

export function makeMarkerFeatureCollection(markers) {
    const features = markers
        .map((marker, index) => {
            const coordinate = getMarkerCoordinate(marker);

            if (!coordinate) {
                return null;
            }

            const markerId = marker?.properties?.id ?? `marker-${index}`;
            const properties = {
                markerId: String(markerId),
                [ALPR_SYMBOL_VISIBLE_PROPERTY_NAME]:
                    markerShowsAlprSymbol(marker),
            };

            getMarkerDirectionValues(marker)
                .slice(0, MAX_MARKER_CONE_DIRECTIONS)
                .forEach((direction, directionIndex) => {
                    properties[
                        MARKER_CONE_DIRECTION_PROPERTY_NAMES[directionIndex]
                    ] = direction;
                });

            return {
                type: 'Feature',
                id: markerId,
                geometry: {
                    type: 'Point',
                    coordinates: coordinate,
                },
                properties,
            };
        })
        .filter(Boolean);

    return features.length
        ? {
              type: 'FeatureCollection',
              features,
          }
        : EMPTY_FEATURE_COLLECTION;
}
