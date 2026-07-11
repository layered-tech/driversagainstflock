import {
    DIRECTIONS_FIELD_DESTINATION,
    DIRECTIONS_FIELD_START,
    DIRECTIONS_FIELD_STOP,
    DIRECTIONS_MODE_DIRECTIONS,
    getDirectionsWaypointCoordinate,
} from './directions';

function createDirectionsWaypointMarker(role, waypoint) {
    const coordinate = getDirectionsWaypointCoordinate(waypoint);

    if (!coordinate) {
        return null;
    }

    const fallbackTitle =
        role === DIRECTIONS_FIELD_START
            ? 'Start'
            : role.startsWith(DIRECTIONS_FIELD_STOP)
              ? 'Stop'
              : 'Destination';
    const waypointId =
        waypoint?.id ??
        waypoint?.placeId ??
        waypoint?.label ??
        waypoint?.inputValue ??
        coordinate.join(',');

    return {
        coordinate,
        id: `${role}:${waypointId}`,
        role,
        subtitle: waypoint?.subtitle || '',
        title: waypoint?.label || waypoint?.inputValue || fallbackTitle,
    };
}

function createDirectionsPlaceWaypointMarker(role, waypoint) {
    if (waypoint?.kind !== 'place') {
        return null;
    }

    return createDirectionsWaypointMarker(role, waypoint);
}

export function makeDirectionsWaypointMarkers({
    directionsDestinationWaypoint,
    directionsRoute,
    directionsStartWaypoint,
    directionsStopWaypoints,
    searchMode,
}) {
    if (directionsRoute) {
        return [
            createDirectionsWaypointMarker(
                DIRECTIONS_FIELD_START,
                directionsRoute.start,
            ),
            ...(directionsRoute.stopWaypoints ?? []).map((waypoint, index) =>
                createDirectionsWaypointMarker(
                    `${DIRECTIONS_FIELD_STOP}-${index + 1}`,
                    waypoint,
                ),
            ),
            createDirectionsWaypointMarker(
                DIRECTIONS_FIELD_DESTINATION,
                directionsRoute.destination,
            ),
        ].filter(Boolean);
    }

    if (searchMode !== DIRECTIONS_MODE_DIRECTIONS) {
        return [];
    }

    return [
        createDirectionsPlaceWaypointMarker(
            DIRECTIONS_FIELD_START,
            directionsStartWaypoint,
        ),
        ...(directionsStopWaypoints ?? []).map((waypoint, index) =>
            createDirectionsPlaceWaypointMarker(
                `${DIRECTIONS_FIELD_STOP}-${index + 1}`,
                waypoint,
            ),
        ),
        createDirectionsPlaceWaypointMarker(
            DIRECTIONS_FIELD_DESTINATION,
            directionsDestinationWaypoint,
        ),
    ].filter(Boolean);
}
