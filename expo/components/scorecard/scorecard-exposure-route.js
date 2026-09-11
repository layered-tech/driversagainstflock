import { getScorecardCoordinateDistanceMeters } from './scorecard-geo.js';

const EXPOSURE_ROUTE_RADIUS_METERS = 250;
const MAX_EXPOSURE_ROUTE_COORDINATES = 100;

function normalizeCoordinate(value) {
    const longitude = Number(value?.[0]);
    const latitude = Number(value?.[1]);

    return Number.isFinite(longitude) &&
        Number.isFinite(latitude) &&
        longitude >= -180 &&
        longitude <= 180 &&
        latitude >= -90 &&
        latitude <= 90
        ? [longitude, latitude]
        : null;
}

export function normalizeScorecardExposureRouteSegment(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .slice(0, MAX_EXPOSURE_ROUTE_COORDINATES)
        .map(normalizeCoordinate)
        .filter(Boolean);
}

export function getScorecardExposureRouteSegment(
    routeCoordinates,
    cameraCoordinate,
) {
    const coordinates = (
        Array.isArray(routeCoordinates) ? routeCoordinates : []
    )
        .map(normalizeCoordinate)
        .filter(Boolean);
    const normalizedCameraCoordinate = normalizeCoordinate(cameraCoordinate);

    if (coordinates.length < 2 || !normalizedCameraCoordinate) {
        return [];
    }

    let closestIndex = 0;
    let closestDistance = Infinity;

    coordinates.forEach((coordinate, index) => {
        const distance = getScorecardCoordinateDistanceMeters(
            coordinate,
            normalizedCameraCoordinate,
        );

        if (distance !== null && distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    let startIndex = closestIndex;
    let startDistance = 0;

    while (startIndex > 0 && startDistance < EXPOSURE_ROUTE_RADIUS_METERS) {
        startDistance +=
            getScorecardCoordinateDistanceMeters(
                coordinates[startIndex],
                coordinates[startIndex - 1],
            ) ?? 0;
        startIndex -= 1;
    }

    let endIndex = closestIndex;
    let endDistance = 0;

    while (
        endIndex < coordinates.length - 1 &&
        endDistance < EXPOSURE_ROUTE_RADIUS_METERS
    ) {
        endDistance +=
            getScorecardCoordinateDistanceMeters(
                coordinates[endIndex],
                coordinates[endIndex + 1],
            ) ?? 0;
        endIndex += 1;
    }

    const segment = coordinates.slice(startIndex, endIndex + 1);

    return segment.length >= 2
        ? normalizeScorecardExposureRouteSegment(segment)
        : [];
}
