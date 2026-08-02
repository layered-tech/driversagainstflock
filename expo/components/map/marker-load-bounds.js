const EARTH_RADIUS_METERS = 6371008.8;
const MARKER_BOUNDS_BUFFER_RATIO = 0.25;
const MARKER_BOUNDS_CONTAINMENT_EPSILON = 0.000001;
const MAX_WEB_MERCATOR_LATITUDE = 85.05112878;
const METERS_PER_MILE = 1609.344;
const MIN_BOUNDS_SPAN_DEGREES = 0.0005;

export const DRIVING_MARKER_REQUIRED_RADIUS_METERS = 10 * METERS_PER_MILE;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
}

function normalizeLongitude(longitude) {
    const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;

    return normalized === -180 && longitude > 0 ? 180 : normalized;
}

function clampLatitude(latitude) {
    return Math.min(
        MAX_WEB_MERCATOR_LATITUDE,
        Math.max(-MAX_WEB_MERCATOR_LATITUDE, latitude),
    );
}

function roundCoordinate(coordinate) {
    return Number(coordinate.toFixed(6));
}

function getFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function getLocationCoordinate(location) {
    const longitude = getFiniteNumber(
        location?.longitude ?? location?.coords?.longitude,
    );
    const latitude = getFiniteNumber(
        location?.latitude ?? location?.coords?.latitude,
    );

    if (
        longitude === null ||
        latitude === null ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [normalizeLongitude(longitude), clampLatitude(latitude)];
}

function getCameraBoundsCoordinates(bounds) {
    if (!Array.isArray(bounds?.sw) || !Array.isArray(bounds?.ne)) {
        return null;
    }

    const westLongitude = getFiniteNumber(bounds.sw[0]);
    const eastLongitude = getFiniteNumber(bounds.ne[0]);
    const firstLatitude = getFiniteNumber(bounds.sw[1]);
    const secondLatitude = getFiniteNumber(bounds.ne[1]);

    if (
        westLongitude === null ||
        eastLongitude === null ||
        firstLatitude === null ||
        secondLatitude === null
    ) {
        return null;
    }

    return {
        eastLongitude: normalizeLongitude(eastLongitude),
        northLatitude: clampLatitude(Math.max(firstLatitude, secondLatitude)),
        southLatitude: clampLatitude(Math.min(firstLatitude, secondLatitude)),
        westLongitude: normalizeLongitude(westLongitude),
    };
}

function getCoordinateDistanceMeters(fromCoordinate, toCoordinate) {
    const fromLatitudeRadians = degreesToRadians(fromCoordinate[1]);
    const toLatitudeRadians = degreesToRadians(toCoordinate[1]);
    const latitudeDelta = degreesToRadians(toCoordinate[1] - fromCoordinate[1]);
    const longitudeDelta = degreesToRadians(
        toCoordinate[0] - fromCoordinate[0],
    );
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

export function getDrivingMarkerRequiredRadiusMeters(location, cameraBounds) {
    const coordinate = getLocationCoordinate(location);
    const bounds = getCameraBoundsCoordinates(cameraBounds);

    if (!coordinate || !bounds) {
        return DRIVING_MARKER_REQUIRED_RADIUS_METERS;
    }

    const corners = [
        [bounds.westLongitude, bounds.southLatitude],
        [bounds.westLongitude, bounds.northLatitude],
        [bounds.eastLongitude, bounds.southLatitude],
        [bounds.eastLongitude, bounds.northLatitude],
    ];

    return Math.max(
        DRIVING_MARKER_REQUIRED_RADIUS_METERS,
        ...corners.map((corner) =>
            getCoordinateDistanceMeters(coordinate, corner),
        ),
    );
}

export function getDrivingMarkerRequiredBounds(location, cameraBounds) {
    const coordinate = getLocationCoordinate(location);

    if (!coordinate) {
        return null;
    }

    const radius = getDrivingMarkerRequiredRadiusMeters(location, cameraBounds);
    const [longitude, latitude] = coordinate;
    const angularDistanceRadians = radius / EARTH_RADIUS_METERS;
    const latitudeRadians = degreesToRadians(latitude);
    const latitudeDistanceDegrees = radiansToDegrees(angularDistanceRadians);
    const southLatitude = clampLatitude(latitude - latitudeDistanceDegrees);
    const northLatitude = clampLatitude(latitude + latitudeDistanceDegrees);
    const longitudeDistanceRadians = Math.asin(
        Math.min(
            1,
            Math.sin(angularDistanceRadians) / Math.cos(latitudeRadians),
        ),
    );
    const longitudeDistanceDegrees = radiansToDegrees(longitudeDistanceRadians);

    return {
        sw: [
            roundCoordinate(
                normalizeLongitude(longitude - longitudeDistanceDegrees),
            ),
            roundCoordinate(southLatitude),
        ],
        ne: [
            roundCoordinate(
                normalizeLongitude(longitude + longitudeDistanceDegrees),
            ),
            roundCoordinate(northLatitude),
        ],
    };
}

export function expandBoundsForMarkerRequest(bounds) {
    const coordinates = getCameraBoundsCoordinates(bounds);

    if (!coordinates) {
        return null;
    }

    const { eastLongitude, northLatitude, southLatitude, westLongitude } =
        coordinates;
    const latitudeSpan = Math.max(
        MIN_BOUNDS_SPAN_DEGREES,
        northLatitude - southLatitude,
    );
    const latitudeBuffer = latitudeSpan * MARKER_BOUNDS_BUFFER_RATIO;
    const crossesAntimeridian = westLongitude > eastLongitude;
    const longitudeSpan = crossesAntimeridian
        ? 360 - westLongitude + eastLongitude
        : eastLongitude - westLongitude;
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
            normalizeLongitude(westLongitude - longitudeBuffer),
        ),
        sw_lat: roundCoordinate(expandedSouthLatitude),
        ne_lng: roundCoordinate(
            normalizeLongitude(eastLongitude + longitudeBuffer),
        ),
        ne_lat: roundCoordinate(expandedNorthLatitude),
    };
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
    const bounds = getCameraBoundsCoordinates(cameraBounds);
    const requestSouthLatitude = getFiniteNumber(requestBounds?.sw_lat);
    const requestNorthLatitude = getFiniteNumber(requestBounds?.ne_lat);
    const requestWestLongitude = getFiniteNumber(requestBounds?.sw_lng);
    const requestEastLongitude = getFiniteNumber(requestBounds?.ne_lng);

    if (
        !bounds ||
        requestSouthLatitude === null ||
        requestNorthLatitude === null ||
        requestWestLongitude === null ||
        requestEastLongitude === null ||
        bounds.southLatitude <
            requestSouthLatitude - MARKER_BOUNDS_CONTAINMENT_EPSILON ||
        bounds.northLatitude >
            requestNorthLatitude + MARKER_BOUNDS_CONTAINMENT_EPSILON
    ) {
        return false;
    }

    return longitudeIntervalsContain(
        getLongitudeIntervals(
            normalizeLongitude(requestWestLongitude),
            normalizeLongitude(requestEastLongitude),
        ),
        getLongitudeIntervals(bounds.westLongitude, bounds.eastLongitude),
    );
}

export function resolveMarkerLoadBounds({
    cameraBounds,
    drivingFollowIsActive,
    userLocation,
}) {
    if (!drivingFollowIsActive) {
        return cameraBounds;
    }

    return (
        getDrivingMarkerRequiredBounds(userLocation, cameraBounds) ??
        cameraBounds
    );
}
