export const ACTIVE_ROUTE_DEVIATION_THRESHOLD_METERS = 30;

export function getActiveRouteDeviationDistanceMeters({
    routeProgress,
    userLocation,
}) {
    const rawLocationDistanceValue =
        userLocation?.roadMatch?.distanceFromActiveRouteMeters;
    const rawLocationDistance =
        rawLocationDistanceValue === null ||
        rawLocationDistanceValue === undefined ||
        rawLocationDistanceValue === ''
            ? null
            : Number(rawLocationDistanceValue);

    if (
        rawLocationDistance !== null &&
        Number.isFinite(rawLocationDistance) &&
        rawLocationDistance >= 0
    ) {
        return rawLocationDistance;
    }

    const matchedLocationDistance = Number(routeProgress?.distanceFromRoute);

    return Number.isFinite(matchedLocationDistance) &&
        matchedLocationDistance >= 0
        ? matchedLocationDistance
        : null;
}
