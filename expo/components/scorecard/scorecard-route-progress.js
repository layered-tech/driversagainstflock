import { getScorecardCoordinateDistanceMeters } from './scorecard-geo.js';

export const SCORECARD_ROUTE_END_TOLERANCE_METERS = 30;
export const SCORECARD_MANUAL_ROUTE_END_RADIUS_METERS = 75;
const DIRECTIONS_ROUTE_FASTEST = 'direct';
const DIRECTIONS_ROUTE_PRIVATE = 'ideal';

function nonNegativeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function getRouteGeometryDistanceMeters(coordinates) {
    if (!Array.isArray(coordinates)) {
        return 0;
    }

    return coordinates
        .slice(1)
        .reduce(
            (distanceMeters, coordinate, index) =>
                distanceMeters +
                (getScorecardCoordinateDistanceMeters(
                    coordinates[index],
                    coordinate,
                ) ?? 0),
            0,
        );
}

function getRouteDestinationCoordinate(route) {
    const latitude = Number(route?.destination?.location?.latitude);
    const longitude = Number(route?.destination?.location?.longitude);

    return Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
        ? [longitude, latitude]
        : null;
}

export function getScorecardRouteDistanceSnapshot(route, progressFraction = 0) {
    const routeOptions = route?.routes
        ? [
              route.routes[DIRECTIONS_ROUTE_PRIVATE],
              route.routes[DIRECTIONS_ROUTE_FASTEST],
          ].filter(Boolean)
        : Array.isArray(route?.coordinates)
          ? [route]
          : [];
    const selectedRouteKey =
        route?.selectedRouteKey ?? route?.routeKey ?? DIRECTIONS_ROUTE_PRIVATE;
    const routeOption =
        routeOptions.find((option) => option.routeKey === selectedRouteKey) ??
        routeOptions[0];
    const directRoute =
        routeOptions.find(
            (option) => option.routeKey === DIRECTIONS_ROUTE_FASTEST,
        ) ?? route?.routes?.[DIRECTIONS_ROUTE_FASTEST];
    const distanceMeters = nonNegativeNumber(routeOption?.distance);
    const directDistanceMeters = nonNegativeNumber(
        directRoute?.distance ?? distanceMeters,
    );
    const durationSeconds = nonNegativeNumber(routeOption?.duration);
    const directDurationSeconds = nonNegativeNumber(
        directRoute?.duration ?? durationSeconds,
    );

    return {
        destinationCoordinate: getRouteDestinationCoordinate(route),
        distanceMeters,
        durationSeconds,
        extraDistanceMeters: Math.max(0, distanceMeters - directDistanceMeters),
        extraDurationSeconds: Math.max(
            0,
            durationSeconds - directDurationSeconds,
        ),
        geometryDistanceMeters: getRouteGeometryDistanceMeters(
            routeOption?.coordinates,
        ),
        progressFraction: Math.min(
            1,
            Math.max(0, Number(progressFraction) || 0),
        ),
        routeOption,
    };
}

export function getScorecardRouteProgressFraction(snapshot, routeProgress) {
    const routeDistanceMeters =
        nonNegativeNumber(snapshot?.geometryDistanceMeters) ||
        nonNegativeNumber(snapshot?.distanceMeters);
    const alongRouteDistance = nonNegativeNumber(
        routeProgress?.alongRouteDistance,
    );

    return routeDistanceMeters > 0
        ? Math.min(1, Math.max(0, alongRouteDistance / routeDistanceMeters))
        : 0;
}

export function scorecardRouteEndedAtDestination(snapshot, locationCoordinate) {
    const routeCoordinates = snapshot?.routeOption?.coordinates;
    const routeEndCoordinate = Array.isArray(routeCoordinates)
        ? routeCoordinates.at(-1)
        : null;
    const destinationCoordinates = [
        snapshot?.destinationCoordinate,
        routeEndCoordinate,
    ].filter(Array.isArray);

    return (
        Array.isArray(locationCoordinate) &&
        destinationCoordinates.some((destinationCoordinate) => {
            const distanceToDestination = getScorecardCoordinateDistanceMeters(
                locationCoordinate,
                destinationCoordinate,
            );

            return (
                distanceToDestination !== null &&
                distanceToDestination <=
                    SCORECARD_MANUAL_ROUTE_END_RADIUS_METERS
            );
        })
    );
}
