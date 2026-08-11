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
