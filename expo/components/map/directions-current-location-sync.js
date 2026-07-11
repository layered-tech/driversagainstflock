import { CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID } from './directions';

function waypointIsCurrentLocation(waypoint) {
    return waypoint?.kind === CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID;
}

function currentLocationAlreadyApplied({
    currentLocationWaypoint,
    value,
    waypoint,
}) {
    return (
        waypointIsCurrentLocation(waypoint) &&
        waypoint?.location?.latitude ===
            currentLocationWaypoint.location.latitude &&
        waypoint?.location?.longitude ===
            currentLocationWaypoint.location.longitude &&
        value === currentLocationWaypoint.inputValue
    );
}

export function currentLocationWaypointNeedsRefresh({
    currentLocationWaypoint,
    value,
    waypoint,
}) {
    return (
        waypointIsCurrentLocation(waypoint) &&
        !currentLocationAlreadyApplied({
            currentLocationWaypoint,
            value,
            waypoint,
        })
    );
}
