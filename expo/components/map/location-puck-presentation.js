const EARTH_RADIUS_METERS = 6371008.8;
export const LOCATION_PUCK_PREDICTION_HORIZON_MS = 500;
export const LOCATION_PUCK_PREDICTION_MAXIMUM_AGE_MS = 2000;
export const LOCATION_PUCK_PREDICTION_MAXIMUM_DISTANCE_METERS = 20;
export const LOCATION_PUCK_PREDICTION_MINIMUM_SPEED_MPS = 1.5;
export const LOCATION_PUCK_PRESENTATION_UPDATE_INTERVAL_MS = 100;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
}

function getStoredNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeLongitude(longitude) {
    let normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;

    if (normalized === -180 && longitude > 0) {
        normalized = 180;
    }

    return normalized;
}

function getLocationCoordinate(location) {
    const longitude = getStoredNumber(location?.longitude);
    const latitude = getStoredNumber(location?.latitude);

    if (
        longitude === null ||
        latitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [normalizeLongitude(longitude), latitude];
}

function getLocationPredictionHeading(location) {
    const heading = getStoredNumber(
        location?.courseHeading ?? location?.heading,
    );

    return heading !== null && heading >= 0 ? heading : null;
}

function getCoordinateAhead({ coordinate, distanceMeters, heading }) {
    const [longitude, latitude] = coordinate;
    const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
    const latitudeRadians = degreesToRadians(latitude);
    const longitudeRadians = degreesToRadians(longitude);
    const headingRadians = degreesToRadians(heading);
    const predictedLatitudeRadians = Math.asin(
        Math.sin(latitudeRadians) * Math.cos(angularDistance) +
            Math.cos(latitudeRadians) *
                Math.sin(angularDistance) *
                Math.cos(headingRadians),
    );
    const predictedLongitudeRadians =
        longitudeRadians +
        Math.atan2(
            Math.sin(headingRadians) *
                Math.sin(angularDistance) *
                Math.cos(latitudeRadians),
            Math.cos(angularDistance) -
                Math.sin(latitudeRadians) * Math.sin(predictedLatitudeRadians),
        );

    return [
        normalizeLongitude(radiansToDegrees(predictedLongitudeRadians)),
        radiansToDegrees(predictedLatitudeRadians),
    ];
}

export function getLocationPuckPresentationLocation(
    location,
    now = Date.now(),
    { predictionEnabled = true } = {},
) {
    const coordinate = getLocationCoordinate(location);
    const speed = getStoredNumber(location?.speed);
    const heading = getLocationPredictionHeading(location);
    const recordedAt = getStoredNumber(location?.recordedAt);
    const locationAgeMs =
        recordedAt === null || !Number.isFinite(now) ? null : now - recordedAt;

    if (
        !predictionEnabled ||
        !coordinate ||
        location?.isMoving !== true ||
        location?.roadMatch?.isOffRoad !== false ||
        speed === null ||
        speed < LOCATION_PUCK_PREDICTION_MINIMUM_SPEED_MPS ||
        heading === null ||
        locationAgeMs === null ||
        locationAgeMs < 0 ||
        locationAgeMs > LOCATION_PUCK_PREDICTION_MAXIMUM_AGE_MS
    ) {
        return location;
    }

    const distanceMeters =
        speed * (locationAgeMs / 1000) +
        Math.min(
            LOCATION_PUCK_PREDICTION_MAXIMUM_DISTANCE_METERS,
            speed * (LOCATION_PUCK_PREDICTION_HORIZON_MS / 1000),
        );
    const predictedCoordinate = getCoordinateAhead({
        coordinate,
        distanceMeters,
        heading,
    });

    return {
        ...location,
        latitude: predictedCoordinate[1],
        longitude: predictedCoordinate[0],
    };
}

export function startLocationPuckPresentationUpdates(
    location,
    {
        onLocation,
        predictionEnabled = true,
        now = Date.now,
        schedule = setTimeout,
        cancel = clearTimeout,
    },
) {
    const recordedAt = getStoredNumber(location?.recordedAt);
    const predictionDeadline =
        recordedAt === null
            ? null
            : recordedAt + LOCATION_PUCK_PREDICTION_MAXIMUM_AGE_MS;
    let timeout = null;
    let stopped = false;

    function publish(isInitialUpdate = false) {
        if (stopped) {
            return;
        }

        const currentTime = now();
        // Finish at the prediction limit instead of jumping back to the old fix.
        const presentationTime = isInitialUpdate
            ? currentTime
            : Math.min(currentTime, predictionDeadline);
        const presentationLocation = getLocationPuckPresentationLocation(
            location,
            presentationTime,
            { predictionEnabled },
        );

        onLocation(presentationLocation);

        if (
            presentationLocation === location ||
            currentTime >= predictionDeadline
        ) {
            return;
        }

        timeout = schedule(
            publish,
            Math.min(
                LOCATION_PUCK_PRESENTATION_UPDATE_INTERVAL_MS,
                predictionDeadline - currentTime,
            ),
        );
    }

    publish(true);

    return () => {
        stopped = true;
        cancel(timeout);
    };
}
