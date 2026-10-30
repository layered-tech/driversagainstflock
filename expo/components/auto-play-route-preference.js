import {
    DIRECTIONS_ROUTE_FASTEST,
    DIRECTIONS_ROUTE_PRIVATE,
} from './map/directions';

export function getAutoPlayInitialRouteKey(routeOptions, preferPrivateRoutes) {
    const options = Array.isArray(routeOptions) ? routeOptions : [];
    const preferredRouteKey = preferPrivateRoutes
        ? DIRECTIONS_ROUTE_PRIVATE
        : DIRECTIONS_ROUTE_FASTEST;

    return (
        options.find(
            (routeOption) => routeOption?.routeKey === preferredRouteKey,
        )?.routeKey ??
        options[0]?.routeKey ??
        null
    );
}
