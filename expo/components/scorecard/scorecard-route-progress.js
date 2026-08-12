export const SCORECARD_ROUTE_END_TOLERANCE_METERS = 30;
const DIRECTIONS_ROUTE_FASTEST = 'direct';
const DIRECTIONS_ROUTE_PRIVATE = 'ideal';

function nonNegativeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? Math.max(0, number) : 0;
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
        distanceMeters,
        durationSeconds,
        extraDistanceMeters: Math.max(0, distanceMeters - directDistanceMeters),
        extraDurationSeconds: Math.max(
            0,
            durationSeconds - directDurationSeconds,
        ),
        progressFraction: Math.min(
            1,
            Math.max(0, Number(progressFraction) || 0),
        ),
        routeOption,
    };
}

export function scorecardRouteHasReachedEnd(snapshot) {
    const distanceMeters = nonNegativeNumber(snapshot?.distanceMeters);
    const progressFraction = Math.min(
        1,
        Math.max(0, Number(snapshot?.progressFraction) || 0),
    );

    return (
        distanceMeters > 0 &&
        distanceMeters * (1 - progressFraction) <=
            SCORECARD_ROUTE_END_TOLERANCE_METERS
    );
}
