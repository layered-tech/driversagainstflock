import { logAnalyticsEvent } from '../../lib/analytics';
import {
    DIRECTIONS_ROUTE_FASTEST,
    DIRECTIONS_ROUTE_PRIVATE,
    getDirectionsRouteOptions,
    getSelectedDirectionsRouteKey,
    getSelectedDirectionsRouteOption,
} from './directions';

function getPlaceIdFromResult(result) {
    const placeId = result?.placeId ?? result?.id;

    return placeId === null || placeId === undefined
        ? undefined
        : String(placeId);
}

function getWaypointKind(waypoint) {
    return waypoint?.kind || (waypoint ? 'unknown' : undefined);
}

function getRouteOptionSummary(routeOption) {
    return {
        distance_meters: routeOption?.distance,
        duration_seconds: routeOption?.duration,
        monitored_node_count: routeOption?.nodeCount,
        route_key: routeOption?.routeKey,
    };
}

function getRouteCount(route) {
    const routeOptions = getDirectionsRouteOptions(route);

    return routeOptions.length || undefined;
}

export function logMapSearchSubmitted({ query, source }) {
    return logAnalyticsEvent('search', {
        search_source: source,
        search_term: query,
    });
}

export function logMapSearchResultsLoaded({ query, resultCount, source }) {
    return logAnalyticsEvent('search_results_loaded', {
        result_count: resultCount,
        search_source: source,
        search_term: query,
    });
}

export function logMapPlaceSelected({ result, source }) {
    return logAnalyticsEvent('select_content', {
        content_type: 'place',
        item_id: getPlaceIdFromResult(result),
        selection_source: source,
    });
}

export function logMapSelectedPlaceWebsiteOpened({ place, result }) {
    return logAnalyticsEvent('place_website_opened', {
        content_type: 'place',
        item_id: place?.id || getPlaceIdFromResult(result),
    });
}

export function logMapDirectionsRequested({
    destinationWaypoint,
    source,
    startWaypoint,
}) {
    return logAnalyticsEvent('directions_requested', {
        destination_kind: getWaypointKind(destinationWaypoint),
        request_source: source,
        start_kind: getWaypointKind(startWaypoint),
    });
}

export function logMapDirectionsRouteLoaded({ route }) {
    const selectedRoute = getSelectedDirectionsRouteOption(route);

    return logAnalyticsEvent('directions_route_loaded', {
        ...getRouteOptionSummary(selectedRoute),
        route_count: getRouteCount(route),
    });
}

export function logMapDirectionsRouteSelected({ routeKey }) {
    return logAnalyticsEvent('directions_route_selected', {
        is_fastest_route: routeKey === DIRECTIONS_ROUTE_FASTEST,
        is_private_route: routeKey === DIRECTIONS_ROUTE_PRIVATE,
        route_key: routeKey,
    });
}

export function logMapDrivingStarted({ route }) {
    const selectedRoute = getSelectedDirectionsRouteOption(route);

    return logAnalyticsEvent('navigation_started', {
        ...getRouteOptionSummary(selectedRoute),
        route_count: getRouteCount(route),
    });
}

export function logMapDrivingStopped({ route }) {
    return logAnalyticsEvent('navigation_stopped', {
        route_key: getSelectedDirectionsRouteKey(route),
    });
}

export function logMapLayerSelected({ layerKey }) {
    return logAnalyticsEvent('map_layer_selected', {
        layer_key: layerKey,
    });
}

export function logMapLightPresetSelected({ preset }) {
    return logAnalyticsEvent('map_light_preset_selected', {
        preset,
    });
}

export function logMapTrafficToggled({ enabled }) {
    return logAnalyticsEvent('map_traffic_toggled', {
        enabled,
    });
}

export function logMapPoliceAlertsToggled({ enabled }) {
    return logAnalyticsEvent('map_police_alerts_toggled', {
        enabled,
    });
}
