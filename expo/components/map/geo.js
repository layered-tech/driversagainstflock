import {
    ALPR_SYMBOL_VISIBLE_PROPERTY_NAME,
    DRIVING_COURSE_HEADING_DEADBAND_DEGREES,
    DRIVING_COURSE_HEADING_FILTER_FACTOR,
    DRIVING_COURSE_HEADING_SHARP_TURN_DEGREES,
    DRIVING_COURSE_HEADING_SHARP_TURN_FILTER_FACTOR,
    EMPTY_FEATURE_COLLECTION,
    MARKER_BOUNDS_BUFFER_RATIO,
    MARKER_BOUNDS_CONTAINMENT_EPSILON,
    MARKER_CONE_DIRECTION_PROPERTY_NAMES,
    MAX_MARKER_CONE_DIRECTIONS,
    MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES,
    MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES,
    MAX_WEB_MERCATOR_LATITUDE,
    MAX_ZOOM_LEVEL,
    MIN_BOUNDS_SPAN_DEGREES,
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

export function expandBoundsForMarkerRequest(bounds) {
    const swLongitude = normalizeLongitude(Number(bounds.sw[0]));
    const neLongitude = normalizeLongitude(Number(bounds.ne[0]));
    const southLatitude = clampLatitude(
        Math.min(Number(bounds.sw[1]), Number(bounds.ne[1])),
    );
    const northLatitude = clampLatitude(
        Math.max(Number(bounds.sw[1]), Number(bounds.ne[1])),
    );

    if (
        !Number.isFinite(swLongitude) ||
        !Number.isFinite(neLongitude) ||
        !Number.isFinite(southLatitude) ||
        !Number.isFinite(northLatitude)
    ) {
        return null;
    }

    const latitudeSpan = Math.max(
        MIN_BOUNDS_SPAN_DEGREES,
        northLatitude - southLatitude,
    );
    const latitudeBuffer = latitudeSpan * MARKER_BOUNDS_BUFFER_RATIO;
    const crossesAntimeridian = swLongitude > neLongitude;
    const longitudeSpan = crossesAntimeridian
        ? 360 - swLongitude + neLongitude
        : neLongitude - swLongitude;
    const longitudeBuffer =
        Math.max(MIN_BOUNDS_SPAN_DEGREES, longitudeSpan) *
        MARKER_BOUNDS_BUFFER_RATIO;
    const expandedSouthLatitude = clampLatitude(southLatitude - latitudeBuffer);
    const expandedNorthLatitude = clampLatitude(northLatitude + latitudeBuffer);

    if (longitudeSpan + longitudeBuffer * 2 >= 360) {
        return {
            sw_lng: -180,
            sw_lat: roundCoordinate(expandedSouthLatitude),
            ne_lng: 180,
            ne_lat: roundCoordinate(expandedNorthLatitude),
        };
    }

    return {
        sw_lng: roundCoordinate(
            normalizeLongitude(swLongitude - longitudeBuffer),
        ),
        sw_lat: roundCoordinate(expandedSouthLatitude),
        ne_lng: roundCoordinate(
            normalizeLongitude(neLongitude + longitudeBuffer),
        ),
        ne_lat: roundCoordinate(expandedNorthLatitude),
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

export function getLongitudeIntervals(westLongitude, eastLongitude) {
    if (westLongitude <= eastLongitude) {
        return [[westLongitude, eastLongitude]];
    }

    return [
        [westLongitude, 180],
        [-180, eastLongitude],
    ];
}

export function longitudeIntervalsContain(outerIntervals, innerIntervals) {
    return innerIntervals.every(([innerWest, innerEast]) =>
        outerIntervals.some(
            ([outerWest, outerEast]) =>
                innerWest >= outerWest - MARKER_BOUNDS_CONTAINMENT_EPSILON &&
                innerEast <= outerEast + MARKER_BOUNDS_CONTAINMENT_EPSILON,
        ),
    );
}

export function markerRequestBoundsContainCameraBounds(
    requestBounds,
    cameraBounds,
) {
    if (!requestBounds || !cameraBounds) {
        return false;
    }

    const southLatitude = Math.min(
        Number(cameraBounds.sw?.[1]),
        Number(cameraBounds.ne?.[1]),
    );
    const northLatitude = Math.max(
        Number(cameraBounds.sw?.[1]),
        Number(cameraBounds.ne?.[1]),
    );
    const requestSouthLatitude = Number(requestBounds.sw_lat);
    const requestNorthLatitude = Number(requestBounds.ne_lat);

    if (
        !Number.isFinite(southLatitude) ||
        !Number.isFinite(northLatitude) ||
        !Number.isFinite(requestSouthLatitude) ||
        !Number.isFinite(requestNorthLatitude) ||
        southLatitude <
            requestSouthLatitude - MARKER_BOUNDS_CONTAINMENT_EPSILON ||
        northLatitude > requestNorthLatitude + MARKER_BOUNDS_CONTAINMENT_EPSILON
    ) {
        return false;
    }

    const westLongitude = normalizeLongitude(Number(cameraBounds.sw?.[0]));
    const eastLongitude = normalizeLongitude(Number(cameraBounds.ne?.[0]));
    const requestWestLongitude = normalizeLongitude(
        Number(requestBounds.sw_lng),
    );
    const requestEastLongitude = normalizeLongitude(
        Number(requestBounds.ne_lng),
    );

    if (
        !Number.isFinite(westLongitude) ||
        !Number.isFinite(eastLongitude) ||
        !Number.isFinite(requestWestLongitude) ||
        !Number.isFinite(requestEastLongitude)
    ) {
        return false;
    }

    return longitudeIntervalsContain(
        getLongitudeIntervals(requestWestLongitude, requestEastLongitude),
        getLongitudeIntervals(westLongitude, eastLongitude),
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
