import { normalizeDirectionDegrees } from '../map/direction-values.js';

const EARTH_RADIUS_METERS = 6371008.8;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
}

export function getScorecardStoredNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === '' ||
        (typeof value === 'string' && value.trim() === '')
    ) {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

export function getScorecardCoordinateDistanceMeters(
    fromCoordinate,
    toCoordinate,
) {
    const fromLongitude = Number(fromCoordinate?.[0]);
    const fromLatitude = Number(fromCoordinate?.[1]);
    const toLongitude = Number(toCoordinate?.[0]);
    const toLatitude = Number(toCoordinate?.[1]);

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

export function getScorecardDestinationCoordinate(
    coordinate,
    distanceMeters,
    bearingDegrees,
) {
    const longitude = Number(coordinate?.[0]);
    const latitude = Number(coordinate?.[1]);
    const distance = Number(distanceMeters);
    const bearing = Number(bearingDegrees);

    if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(distance) ||
        distance < 0 ||
        !Number.isFinite(bearing)
    ) {
        return null;
    }

    const angularDistance = distance / EARTH_RADIUS_METERS;
    const bearingRadians = degreesToRadians(bearing);
    const latitudeRadians = degreesToRadians(latitude);
    const longitudeRadians = degreesToRadians(longitude);
    const destinationLatitude = Math.asin(
        Math.sin(latitudeRadians) * Math.cos(angularDistance) +
            Math.cos(latitudeRadians) *
                Math.sin(angularDistance) *
                Math.cos(bearingRadians),
    );
    const destinationLongitude =
        longitudeRadians +
        Math.atan2(
            Math.sin(bearingRadians) *
                Math.sin(angularDistance) *
                Math.cos(latitudeRadians),
            Math.cos(angularDistance) -
                Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
        );
    const destinationLongitudeDegrees = radiansToDegrees(destinationLongitude);
    const normalizedLongitude =
        ((((destinationLongitudeDegrees + 180) % 360) + 360) % 360) - 180;

    return [normalizedLongitude, radiansToDegrees(destinationLatitude)];
}

export function getScorecardCoordinateBearingDegrees(
    fromCoordinate,
    toCoordinate,
) {
    const fromLongitude = Number(fromCoordinate?.[0]);
    const fromLatitude = Number(fromCoordinate?.[1]);
    const toLongitude = Number(toCoordinate?.[0]);
    const toLatitude = Number(toCoordinate?.[1]);

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
