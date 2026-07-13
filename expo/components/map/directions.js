import { EMPTY_FEATURE_COLLECTION } from './constants';
import { getStoredNumber, normalizeLongitude } from './geo';
import {
    getPlaceAddress,
    getPlaceCoordinate,
    getPlaceDisplayName,
    getPlaceTypeLabel,
} from './place-formatters';

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const EARTH_RADIUS_METERS = 6371008.8;
const MANEUVER_COMPLETION_HOLD_DISTANCE_RATIO = 0.35;
const MAX_MANEUVER_COMPLETION_HOLD_DISTANCE_METERS = 120;
const MIN_MANEUVER_COMPLETION_HOLD_DISTANCE_METERS = 30;
const routeProgressDataCache = new WeakMap();
export const DIRECTIONS_FIELD_START = 'start';
export const DIRECTIONS_FIELD_STOP = 'stop';
export const DIRECTIONS_FIELD_DESTINATION = 'destination';
export const DIRECTIONS_MODE_SEARCH = 'search';
export const DIRECTIONS_MODE_DIRECTIONS = 'directions';
export const CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID = 'current-location';
export const DIRECTIONS_ROUTE_FASTEST = 'direct';
export const DIRECTIONS_ROUTE_PRIVATE = 'ideal';
export const DIRECTIONS_DEBUG_AVOID_POLYGONS = 'avoid_polygons';
export const DIRECTIONS_DEBUG_DESTINATION_LINE = 'destination_line';
export const DIRECTIONS_DEBUG_ENDPOINT_BUFFERS = 'endpoint_buffers';
export const DIRECTIONS_DEBUG_SEARCH_ZONE = 'search_zone';

const DIRECTIONS_DEBUG_ROLES = new Set([
    DIRECTIONS_DEBUG_AVOID_POLYGONS,
    DIRECTIONS_DEBUG_DESTINATION_LINE,
    DIRECTIONS_DEBUG_ENDPOINT_BUFFERS,
    DIRECTIONS_DEBUG_SEARCH_ZONE,
]);

const ROUTE_LABELS = {
    [DIRECTIONS_ROUTE_FASTEST]: 'Fastest',
    [DIRECTIONS_ROUTE_PRIVATE]: 'Private',
};

const MANEUVER_TYPE_LABELS = {
    0: 'Turn left',
    1: 'Turn right',
    2: 'Sharp left',
    3: 'Sharp right',
    4: 'Slight left',
    5: 'Slight right',
    6: 'Continue',
    7: 'Enter roundabout',
    8: 'Exit roundabout',
    9: 'Make a U-turn',
    10: 'Arrive',
    11: 'Depart',
    12: 'Keep left',
    13: 'Keep right',
};

function getLocationCoordinate(location) {
    const latitude = getStoredNumber(location?.latitude);
    const longitude = getStoredNumber(location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [normalizeLongitude(longitude), latitude];
}

export function createCurrentLocationDirectionsWaypoint(location) {
    const coordinate = getLocationCoordinate(location);

    if (!coordinate) {
        return null;
    }

    return {
        id: CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID,
        inputValue: 'Current location',
        kind: CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID,
        label: 'Current location',
        location: {
            latitude: coordinate[1],
            longitude: coordinate[0],
        },
        subtitle: '',
    };
}

export function createPlaceDirectionsWaypoint({
    address,
    name,
    place,
    result,
}) {
    const coordinate = getPlaceCoordinate(place);

    if (!coordinate) {
        return null;
    }

    const displayName = name || getPlaceDisplayName(place, result);
    const displayAddress = address || getPlaceAddress(place, result);
    const typeLabel = getPlaceTypeLabel(place);
    const subtitle = [typeLabel, displayAddress].filter(Boolean).join(' - ');

    return {
        id: result?.placeId || place?.id || result?.id || displayName,
        inputValue: displayAddress || displayName,
        kind: 'place',
        label: displayName,
        location: {
            latitude: coordinate[1],
            longitude: coordinate[0],
        },
        place,
        placeId: result?.placeId || place?.id || result?.id || null,
        result,
        subtitle,
    };
}

export function getDirectionsWaypointCoordinate(waypoint) {
    return getLocationCoordinate(waypoint?.location);
}

export function getDirectionsWaypointApiCoord(waypoint) {
    const coordinate = getDirectionsWaypointCoordinate(waypoint);

    if (!coordinate) {
        return null;
    }

    return {
        latitude: coordinate[1],
        longitude: coordinate[0],
    };
}

function normalizeRouteCoordinate(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
    }

    const firstValue = getStoredNumber(coordinate[0]);
    const secondValue = getStoredNumber(coordinate[1]);

    if (firstValue === null || secondValue === null) {
        return null;
    }

    const firstLooksLikeLatitude = firstValue >= -90 && firstValue <= 90;
    const secondLooksLikeLatitude = secondValue >= -90 && secondValue <= 90;
    const longitude =
        firstLooksLikeLatitude && !secondLooksLikeLatitude
            ? secondValue
            : firstValue;
    const latitude =
        firstLooksLikeLatitude && !secondLooksLikeLatitude
            ? firstValue
            : secondValue;

    if (latitude < -90 || latitude > 90) {
        return null;
    }

    return [normalizeLongitude(longitude), latitude];
}

function coordinatesAreEqual(firstCoordinate, secondCoordinate) {
    return (
        Array.isArray(firstCoordinate) &&
        Array.isArray(secondCoordinate) &&
        firstCoordinate.length >= 2 &&
        secondCoordinate.length >= 2 &&
        firstCoordinate[0] === secondCoordinate[0] &&
        firstCoordinate[1] === secondCoordinate[1]
    );
}

function normalizeDebugLineStringCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates.map(normalizeRouteCoordinate).filter(Boolean);
}

function normalizeDebugLinearRing(ring) {
    const coordinates = normalizeDebugLineStringCoordinates(ring);

    if (coordinates.length < 3) {
        return [];
    }

    const firstCoordinate = coordinates[0];
    const lastCoordinate = coordinates[coordinates.length - 1];

    return coordinatesAreEqual(firstCoordinate, lastCoordinate)
        ? coordinates
        : [...coordinates, firstCoordinate];
}

function normalizeDebugPolygonCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates.map(normalizeDebugLinearRing).filter((ring) => {
        return ring.length >= 4;
    });
}

function normalizeDebugMultiPolygonCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates
        .map(normalizeDebugPolygonCoordinates)
        .filter((polygon) => polygon.length > 0);
}

function normalizeDirectionsDebugGeometry(geometry) {
    switch (geometry?.type) {
        case 'LineString': {
            const coordinates = normalizeDebugLineStringCoordinates(
                geometry.coordinates,
            );

            return coordinates.length >= 2
                ? { type: 'LineString', coordinates }
                : null;
        }
        case 'Polygon': {
            const coordinates = normalizeDebugPolygonCoordinates(
                geometry.coordinates,
            );

            return coordinates.length > 0
                ? { type: 'Polygon', coordinates }
                : null;
        }
        case 'MultiPolygon': {
            const coordinates = normalizeDebugMultiPolygonCoordinates(
                geometry.coordinates,
            );

            return coordinates.length > 0
                ? { type: 'MultiPolygon', coordinates }
                : null;
        }
        default:
            return null;
    }
}

function getDirectionsDebugFeatureRole(feature, fallbackRole) {
    const role =
        typeof feature?.properties?.debugRole === 'string'
            ? feature.properties.debugRole
            : typeof feature?.properties?.debug_role === 'string'
              ? feature.properties.debug_role
              : fallbackRole;

    return DIRECTIONS_DEBUG_ROLES.has(role) ? role : fallbackRole;
}

function normalizeDirectionsDebugFeature(feature, fallbackRole = null) {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
        return null;
    }

    const geometry = normalizeDirectionsDebugGeometry(
        feature.type === 'Feature' ? feature.geometry : feature,
    );

    if (!geometry) {
        return null;
    }

    const properties =
        feature.properties &&
        typeof feature.properties === 'object' &&
        !Array.isArray(feature.properties)
            ? feature.properties
            : {};
    const debugRole = getDirectionsDebugFeatureRole(feature, fallbackRole);

    if (!debugRole) {
        return null;
    }

    return {
        type: 'Feature',
        geometry,
        properties: {
            ...properties,
            debugRole,
        },
    };
}

function getExclusionZoneDebugFeature(exclusionZone) {
    if (!exclusionZone) {
        return null;
    }

    return normalizeDirectionsDebugFeature(
        exclusionZone.type === 'Feature'
            ? {
                  ...exclusionZone,
                  properties: {
                      ...(exclusionZone.properties ?? {}),
                      debugRole: DIRECTIONS_DEBUG_AVOID_POLYGONS,
                  },
              }
            : {
                  type: 'Feature',
                  geometry: exclusionZone,
                  properties: {
                      debugRole: DIRECTIONS_DEBUG_AVOID_POLYGONS,
                  },
              },
        DIRECTIONS_DEBUG_AVOID_POLYGONS,
    );
}

function normalizeDirectionsManeuver(maneuver, index) {
    if (!maneuver || typeof maneuver !== 'object' || Array.isArray(maneuver)) {
        return null;
    }

    const wayPoints = Array.isArray(maneuver.way_points)
        ? maneuver.way_points
              .map((waypoint) => {
                  const numericWaypoint = Number(waypoint);

                  return Number.isFinite(numericWaypoint)
                      ? numericWaypoint
                      : null;
              })
              .filter((waypoint) => waypoint !== null)
        : [];

    return {
        ...maneuver,
        distance: getStoredNumber(maneuver.distance),
        duration: getStoredNumber(maneuver.duration),
        instruction:
            typeof maneuver.instruction === 'string'
                ? maneuver.instruction
                : '',
        maneuver:
            maneuver.maneuver &&
            typeof maneuver.maneuver === 'object' &&
            !Array.isArray(maneuver.maneuver)
                ? maneuver.maneuver
                : null,
        name: typeof maneuver.name === 'string' ? maneuver.name : '',
        stepIndex: index,
        type: getStoredNumber(maneuver.type),
        way_points: wayPoints,
    };
}

export function normalizeDirectionsRoute(route, routeKey) {
    const coordinates = Array.isArray(route?.coordinates)
        ? route.coordinates.map(normalizeRouteCoordinate).filter(Boolean)
        : [];

    if (coordinates.length < 2) {
        throw new Error('Directions route did not include enough coordinates.');
    }

    const resolvedRouteKey =
        routeKey || route?.routeKey || route?.key || DIRECTIONS_ROUTE_PRIVATE;

    return {
        coordinates,
        distance: getStoredNumber(route?.distance),
        duration: getStoredNumber(route?.duration),
        maneuvers: Array.isArray(route?.maneuvers)
            ? route.maneuvers.map(normalizeDirectionsManeuver).filter(Boolean)
            : [],
        nodeCount: getStoredNumber(
            route?.node_count ?? route?.fastest_route_node_count,
        ),
        routeKey: resolvedRouteKey,
        routeLabel: ROUTE_LABELS[resolvedRouteKey] || 'Route',
    };
}

function getRouteBoundsFromCoordinates(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
    }

    const longitudes = coordinates.map((coordinate) => coordinate[0]);
    const latitudes = coordinates.map((coordinate) => coordinate[1]);
    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);

    if (
        !Number.isFinite(west) ||
        !Number.isFinite(east) ||
        !Number.isFinite(south) ||
        !Number.isFinite(north)
    ) {
        return null;
    }

    return {
        ne: [east, north],
        sw: [west, south],
    };
}

export function getDirectionsRouteOptions(route) {
    if (route?.routes && typeof route.routes === 'object') {
        return [DIRECTIONS_ROUTE_PRIVATE, DIRECTIONS_ROUTE_FASTEST]
            .map((routeKey) => route.routes[routeKey])
            .filter((routeOption) => routeOption?.coordinates?.length >= 2);
    }

    if (Array.isArray(route?.coordinates) && route.coordinates.length >= 2) {
        return [route];
    }

    return [];
}

export function getSelectedDirectionsRouteKey(route) {
    const options = getDirectionsRouteOptions(route);
    const requestedRouteKey = route?.selectedRouteKey;

    if (
        requestedRouteKey &&
        options.some(
            (routeOption) => routeOption.routeKey === requestedRouteKey,
        )
    ) {
        return requestedRouteKey;
    }

    if (
        options.some(
            (routeOption) => routeOption.routeKey === DIRECTIONS_ROUTE_PRIVATE,
        )
    ) {
        return DIRECTIONS_ROUTE_PRIVATE;
    }

    return options[0]?.routeKey || DIRECTIONS_ROUTE_FASTEST;
}

export function getSelectedDirectionsRouteOption(route) {
    const selectedRouteKey = getSelectedDirectionsRouteKey(route);

    return (
        getDirectionsRouteOptions(route).find(
            (routeOption) => routeOption.routeKey === selectedRouteKey,
        ) ?? null
    );
}

export function selectDirectionsRoute(route, routeKey) {
    const options = getDirectionsRouteOptions(route);
    const selectedRoute =
        options.find((routeOption) => routeOption.routeKey === routeKey) ??
        getSelectedDirectionsRouteOption(route);

    if (!selectedRoute) {
        return route;
    }

    return {
        ...route,
        bounds: getRouteBoundsFromCoordinates(selectedRoute.coordinates),
        coordinates: selectedRoute.coordinates,
        distance: selectedRoute.distance,
        duration: selectedRoute.duration,
        maneuvers: selectedRoute.maneuvers,
        nodeCount: selectedRoute.nodeCount,
        routeKey: selectedRoute.routeKey,
        routeLabel: selectedRoute.routeLabel,
        selectedRouteKey: selectedRoute.routeKey,
    };
}

export function normalizeDirectionsRouteResponse(result) {
    const directSource = result?.routes?.direct ?? result?.direct ?? null;
    const idealSource =
        result?.routes?.ideal ?? result?.ideal ?? result?.route ?? null;
    const fastestRouteNodeCount = getStoredNumber(
        result?.fastest_route_node_count ??
            directSource?.node_count ??
            directSource?.fastest_route_node_count,
    );
    const direct = directSource
        ? normalizeDirectionsRoute(
              {
                  ...directSource,
                  node_count: directSource.node_count ?? fastestRouteNodeCount,
                  fastest_route_node_count:
                      directSource.fastest_route_node_count ??
                      fastestRouteNodeCount,
              },
              DIRECTIONS_ROUTE_FASTEST,
          )
        : null;
    const ideal = idealSource
        ? normalizeDirectionsRoute(idealSource, DIRECTIONS_ROUTE_PRIVATE)
        : null;

    if (!direct && !ideal) {
        throw new Error('Directions response did not include a route.');
    }

    return selectDirectionsRoute(
        {
            fastestRouteNodeCount:
                fastestRouteNodeCount ?? direct?.nodeCount ?? 0,
            routes: {
                ...(direct ? { [DIRECTIONS_ROUTE_FASTEST]: direct } : {}),
                ...(ideal ? { [DIRECTIONS_ROUTE_PRIVATE]: ideal } : {}),
            },
        },
        ideal ? DIRECTIONS_ROUTE_PRIVATE : DIRECTIONS_ROUTE_FASTEST,
    );
}

export function normalizeDirectionsDebugFeatureCollection(
    debugGeometry,
    exclusionZone = null,
) {
    let features = [];

    if (debugGeometry?.type === 'FeatureCollection') {
        features = Array.isArray(debugGeometry.features)
            ? debugGeometry.features
                  .map((feature) => normalizeDirectionsDebugFeature(feature))
                  .filter(Boolean)
            : [];
    } else {
        const feature = normalizeDirectionsDebugFeature(debugGeometry);

        features = feature ? [feature] : [];
    }

    if (features.length === 0) {
        const exclusionZoneFeature =
            getExclusionZoneDebugFeature(exclusionZone);

        if (exclusionZoneFeature) {
            features = [exclusionZoneFeature];
        }
    }

    return features.length > 0
        ? {
              type: 'FeatureCollection',
              features,
          }
        : EMPTY_FEATURE_COLLECTION;
}

export function makeDirectionsRouteFeatureCollection(route) {
    const routeOptions = getDirectionsRouteOptions(route);

    if (routeOptions.length === 0) {
        return EMPTY_FEATURE_COLLECTION;
    }

    const selectedRouteKey = getSelectedDirectionsRouteKey(route);

    return {
        type: 'FeatureCollection',
        features: routeOptions.map((routeOption) => {
            const selected = routeOption.routeKey === selectedRouteKey;

            return {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: routeOption.coordinates,
                },
                properties: {
                    routeKey: routeOption.routeKey,
                    routeLabel: routeOption.routeLabel,
                    selected,
                },
            };
        }),
    };
}

export function makeDirectionsDebugFeatureCollection(
    route,
    debugOverlayIsVisible,
) {
    if (!debugOverlayIsVisible) {
        return EMPTY_FEATURE_COLLECTION;
    }

    return normalizeDirectionsDebugFeatureCollection(
        route?.debugGeometry,
        route?.exclusionZone,
    );
}

export function getDirectionsRouteBounds(route) {
    return getRouteBoundsFromCoordinates(
        getSelectedDirectionsRouteOption(route)?.coordinates ??
            route?.coordinates,
    );
}

export function getDirectionsRouteOptionsBounds(route) {
    return getRouteBoundsFromCoordinates(
        getDirectionsRouteOptions(route).flatMap(
            (routeOption) => routeOption.coordinates ?? [],
        ),
    );
}

export function getDirectionsDistanceEstimate(meters) {
    const distance = getStoredNumber(meters);

    if (distance === null) {
        return null;
    }

    const clampedDistance = Math.max(0, distance);

    if (clampedDistance < 161) {
        const feet =
            clampedDistance <= 0
                ? 0
                : Math.max(
                      50,
                      Math.round((clampedDistance * FEET_PER_METER) / 50) * 50,
                  );

        return { unit: 'feet', value: feet };
    }

    return { unit: 'miles', value: clampedDistance / METERS_PER_MILE };
}

export function formatDirectionsDistance(meters) {
    const estimate = getDirectionsDistanceEstimate(meters);

    if (!estimate) {
        return '';
    }

    if (estimate.unit === 'feet') {
        return `${estimate.value} ft`;
    }

    const miles = estimate.value;

    return `${miles >= 10 ? miles.toFixed(0) : miles.toFixed(1)} mi`;
}

export function formatDirectionsDistanceDelta(meters) {
    const distance = getStoredNumber(meters);

    if (distance === null || Math.abs(distance) < 16) {
        return 'same distance';
    }

    return `${distance > 0 ? '+' : '-'}${formatDirectionsDistance(Math.abs(distance))}`;
}

export function formatDirectionsDuration(seconds) {
    const duration = getStoredNumber(seconds);

    if (duration === null) {
        return '';
    }

    const minutes = Math.max(1, Math.round(duration / 60));

    if (minutes < 60) {
        return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes
        ? `${hours} hr ${remainingMinutes} min`
        : `${hours} hr`;
}

export function formatDirectionsArrivalTime(seconds, date = new Date()) {
    const duration = getStoredNumber(seconds);

    if (duration === null) {
        return '';
    }

    const arrivalDate = new Date(date.getTime() + Math.max(0, duration) * 1000);

    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    }).format(arrivalDate);
}

export function formatDirectionsDurationDelta(seconds) {
    const duration = getStoredNumber(seconds);

    if (duration === null || Math.abs(duration) < 30) {
        return 'same time';
    }

    return `${duration > 0 ? '+' : '-'}${formatDirectionsDuration(Math.abs(duration))}`;
}

export function formatDirectionsManeuverDistance(meters) {
    const distance = getStoredNumber(meters);

    if (distance === null) {
        return '';
    }

    if (distance < 15) {
        return 'now';
    }

    if (distance < 152) {
        const feet = Math.max(
            50,
            Math.round((distance * FEET_PER_METER) / 50) * 50,
        );

        return `${feet} ft`;
    }

    return formatDirectionsDistance(distance);
}

export function getDirectionsManeuverTypeLabel(maneuver) {
    const maneuverType = getStoredNumber(maneuver?.type);

    return MANEUVER_TYPE_LABELS[maneuverType] || 'Next maneuver';
}

function getStepWaypointIndex(step, fallbackIndex = 0) {
    const waypoint = Array.isArray(step?.way_points)
        ? getStoredNumber(step.way_points[fallbackIndex])
        : null;

    return waypoint === null ? null : Math.max(0, Math.round(waypoint));
}

function getCoordinateDistanceMeters(firstCoordinate, secondCoordinate) {
    if (!Array.isArray(firstCoordinate) || !Array.isArray(secondCoordinate)) {
        return 0;
    }

    const firstLongitude = getStoredNumber(firstCoordinate[0]);
    const firstLatitude = getStoredNumber(firstCoordinate[1]);
    const secondLongitude = getStoredNumber(secondCoordinate[0]);
    const secondLatitude = getStoredNumber(secondCoordinate[1]);

    if (
        firstLongitude === null ||
        firstLatitude === null ||
        secondLongitude === null ||
        secondLatitude === null
    ) {
        return 0;
    }

    const firstLatitudeRadians = (firstLatitude * Math.PI) / 180;
    const secondLatitudeRadians = (secondLatitude * Math.PI) / 180;
    const latitudeDelta = ((secondLatitude - firstLatitude) * Math.PI) / 180;
    const longitudeDelta = ((secondLongitude - firstLongitude) * Math.PI) / 180;
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(firstLatitudeRadians) *
            Math.cos(secondLatitudeRadians) *
            Math.sin(longitudeDelta / 2) ** 2;

    return (
        2 *
        EARTH_RADIUS_METERS *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function getCumulativeRouteDistances(coordinates) {
    const distances = [0];

    for (let index = 1; index < coordinates.length; index += 1) {
        distances[index] =
            distances[index - 1] +
            getCoordinateDistanceMeters(
                coordinates[index - 1],
                coordinates[index],
            );
    }

    return distances;
}

function getLongitudeDeltaDegrees(fromLongitude, toLongitude) {
    let delta =
        normalizeLongitude(toLongitude) - normalizeLongitude(fromLongitude);

    if (delta > 180) {
        delta -= 360;
    } else if (delta < -180) {
        delta += 360;
    }

    return delta;
}

function projectCoordinateOntoSegment(
    startCoordinate,
    endCoordinate,
    userCoordinate,
) {
    if (
        !Array.isArray(startCoordinate) ||
        !Array.isArray(endCoordinate) ||
        !Array.isArray(userCoordinate)
    ) {
        return null;
    }

    const startLongitude = getStoredNumber(startCoordinate[0]);
    const startLatitude = getStoredNumber(startCoordinate[1]);
    const endLongitude = getStoredNumber(endCoordinate[0]);
    const endLatitude = getStoredNumber(endCoordinate[1]);
    const userLongitude = getStoredNumber(userCoordinate[0]);
    const userLatitude = getStoredNumber(userCoordinate[1]);

    if (
        startLongitude === null ||
        startLatitude === null ||
        endLongitude === null ||
        endLatitude === null ||
        userLongitude === null ||
        userLatitude === null
    ) {
        return null;
    }

    const originLatitudeRadians =
        (((startLatitude + endLatitude + userLatitude) / 3) * Math.PI) / 180;
    const metersPerDegreeLatitude = (EARTH_RADIUS_METERS * Math.PI) / 180;
    const metersPerDegreeLongitude =
        metersPerDegreeLatitude * Math.cos(originLatitudeRadians);
    const segmentX =
        getLongitudeDeltaDegrees(startLongitude, endLongitude) *
        metersPerDegreeLongitude;
    const segmentY = (endLatitude - startLatitude) * metersPerDegreeLatitude;
    const pointX =
        getLongitudeDeltaDegrees(startLongitude, userLongitude) *
        metersPerDegreeLongitude;
    const pointY = (userLatitude - startLatitude) * metersPerDegreeLatitude;
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;

    if (segmentLengthSquared < 0.000001) {
        return {
            alongSegmentDistance: 0,
            distanceFromRoute: Math.hypot(pointX, pointY),
            segmentFraction: 0,
        };
    }

    const segmentFraction = Math.max(
        0,
        Math.min(
            1,
            (pointX * segmentX + pointY * segmentY) / segmentLengthSquared,
        ),
    );
    const projectedX = segmentX * segmentFraction;
    const projectedY = segmentY * segmentFraction;

    return {
        alongSegmentDistance: Math.sqrt(segmentLengthSquared) * segmentFraction,
        distanceFromRoute: Math.hypot(pointX - projectedX, pointY - projectedY),
        segmentFraction,
    };
}

function getClosestRoutePosition(
    coordinates,
    cumulativeDistances,
    userCoordinate,
) {
    let closestPosition = null;

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const projection = projectCoordinateOntoSegment(
            coordinates[index],
            coordinates[index + 1],
            userCoordinate,
        );

        if (!projection) {
            continue;
        }

        const alongRouteDistance =
            (cumulativeDistances[index] ?? 0) + projection.alongSegmentDistance;

        if (
            !closestPosition ||
            projection.distanceFromRoute <
                closestPosition.distanceFromRoute - 0.5 ||
            (Math.abs(
                projection.distanceFromRoute -
                    closestPosition.distanceFromRoute,
            ) <= 0.5 &&
                alongRouteDistance > closestPosition.alongRouteDistance)
        ) {
            closestPosition = {
                alongRouteDistance,
                coordinateIndex: index,
                distanceFromRoute: projection.distanceFromRoute,
                segmentFraction: projection.segmentFraction,
            };
        }
    }

    if (closestPosition) {
        return closestPosition;
    }

    return {
        alongRouteDistance: 0,
        coordinateIndex: 0,
        distanceFromRoute: getCoordinateDistanceMeters(
            coordinates[0],
            userCoordinate,
        ),
        segmentFraction: 0,
    };
}

function clampRouteCoordinateIndex(index, coordinatesLength) {
    if (coordinatesLength <= 0 || index === null) {
        return 0;
    }

    return Math.min(coordinatesLength - 1, Math.max(0, Math.round(index)));
}

function getRouteManeuversWithProgress(
    maneuvers,
    coordinates,
    cumulativeDistances,
) {
    return maneuvers.map((maneuver) => {
        const startWaypointIndex = clampRouteCoordinateIndex(
            getStepWaypointIndex(maneuver, 0),
            coordinates.length,
        );
        const endWaypointIndex = clampRouteCoordinateIndex(
            getStepWaypointIndex(maneuver, 1) ?? startWaypointIndex,
            coordinates.length,
        );
        const normalizedStartWaypointIndex = Math.min(
            startWaypointIndex,
            endWaypointIndex,
        );
        const normalizedEndWaypointIndex = Math.max(
            startWaypointIndex,
            endWaypointIndex,
        );
        const startDistance =
            cumulativeDistances[normalizedStartWaypointIndex] ?? 0;
        const endDistance =
            cumulativeDistances[normalizedEndWaypointIndex] ?? startDistance;

        return {
            ...maneuver,
            endDistance,
            endWaypointIndex: normalizedEndWaypointIndex,
            startDistance,
            startWaypointIndex: normalizedStartWaypointIndex,
        };
    });
}

function getRouteProgressData(route) {
    const selectedRoute = getSelectedDirectionsRouteOption(route);
    const coordinates = selectedRoute?.coordinates ?? [];
    const maneuvers = selectedRoute?.maneuvers ?? [];
    const cachedData =
        selectedRoute && typeof selectedRoute === 'object'
            ? routeProgressDataCache.get(selectedRoute)
            : null;

    if (
        cachedData?.coordinates === coordinates &&
        cachedData?.maneuvers === maneuvers
    ) {
        return cachedData;
    }

    const cumulativeDistances = getCumulativeRouteDistances(coordinates);
    const progressData = {
        coordinates,
        cumulativeDistances,
        maneuvers,
        maneuversWithProgress: getRouteManeuversWithProgress(
            maneuvers,
            coordinates,
            cumulativeDistances,
        ),
    };

    if (selectedRoute && typeof selectedRoute === 'object') {
        routeProgressDataCache.set(selectedRoute, progressData);
    }

    return progressData;
}

function getManeuverCompletionHoldDistance(maneuver) {
    const stepDistance = Math.max(
        0,
        (maneuver?.endDistance ?? 0) - (maneuver?.startDistance ?? 0),
    );

    return Math.min(
        MAX_MANEUVER_COMPLETION_HOLD_DISTANCE_METERS,
        Math.max(
            MIN_MANEUVER_COMPLETION_HOLD_DISTANCE_METERS,
            stepDistance * MANEUVER_COMPLETION_HOLD_DISTANCE_RATIO,
        ),
    );
}

function decorateActiveManeuver(maneuver, distanceToManeuver) {
    if (!maneuver) {
        return null;
    }

    return {
        ...maneuver,
        distanceToManeuver,
        typeLabel: getDirectionsManeuverTypeLabel(maneuver),
    };
}

function getUpcomingManeuver(maneuvers, progressDistance) {
    return (
        maneuvers.find(
            (maneuver) => maneuver.startDistance > progressDistance,
        ) ?? null
    );
}

export function getDirectionsRouteProgress(route, userLocation) {
    const { coordinates, cumulativeDistances } = getRouteProgressData(route);

    if (coordinates.length < 2) {
        return null;
    }

    const userCoordinate = getLocationCoordinate(userLocation);

    if (!userCoordinate) {
        return null;
    }

    return getClosestRoutePosition(
        coordinates,
        cumulativeDistances,
        userCoordinate,
    );
}

function getCurrentManeuver(maneuvers, progressDistance) {
    return (
        maneuvers.find((maneuver, index) => {
            const isLastManeuver = index === maneuvers.length - 1;

            return (
                progressDistance >= maneuver.startDistance &&
                (progressDistance < maneuver.endDistance || isLastManeuver)
            );
        }) ?? null
    );
}

export function getActiveDirectionsManeuver(
    route,
    userLocation,
    routeProgress = getDirectionsRouteProgress(route, userLocation),
) {
    const { coordinates, maneuvers, maneuversWithProgress } =
        getRouteProgressData(route);

    if (coordinates.length < 2 || maneuvers.length === 0) {
        return null;
    }

    if (!routeProgress) {
        const firstManeuver =
            maneuvers.find((maneuver) => maneuver.type !== 11) ?? maneuvers[0];

        return decorateActiveManeuver(
            firstManeuver,
            getStoredNumber(firstManeuver?.distance),
        );
    }

    const progressDistance = routeProgress.alongRouteDistance;
    const currentManeuver = getCurrentManeuver(
        maneuversWithProgress,
        progressDistance,
    );
    const upcomingManeuver = getUpcomingManeuver(
        maneuversWithProgress,
        progressDistance,
    );

    if (currentManeuver) {
        if (currentManeuver.type === 11 && upcomingManeuver) {
            return decorateActiveManeuver(
                upcomingManeuver,
                Math.max(0, upcomingManeuver.startDistance - progressDistance),
            );
        }

        const distanceIntoCurrentManeuver = Math.max(
            0,
            progressDistance - currentManeuver.startDistance,
        );

        if (
            !upcomingManeuver ||
            currentManeuver.type === 10 ||
            distanceIntoCurrentManeuver <=
                getManeuverCompletionHoldDistance(currentManeuver)
        ) {
            return decorateActiveManeuver(currentManeuver, 0);
        }
    }

    if (upcomingManeuver) {
        return decorateActiveManeuver(
            upcomingManeuver,
            Math.max(0, upcomingManeuver.startDistance - progressDistance),
        );
    }

    return decorateActiveManeuver(
        maneuversWithProgress[maneuversWithProgress.length - 1],
        0,
    );
}

export function getNextDirectionsManeuver(
    route,
    userLocation,
    routeProgress = getDirectionsRouteProgress(route, userLocation),
) {
    const { coordinates, maneuvers, maneuversWithProgress } =
        getRouteProgressData(route);

    if (coordinates.length < 2 || maneuvers.length < 2) {
        return null;
    }

    const progressDistance = routeProgress?.alongRouteDistance ?? 0;
    const activeManeuver = getActiveDirectionsManeuver(
        route,
        userLocation,
        routeProgress,
    );

    return (
        maneuversWithProgress.find((maneuver) => {
            if (maneuver.type === 11) {
                return false;
            }

            if (
                activeManeuver?.stepIndex !== undefined &&
                maneuver.stepIndex <= activeManeuver.stepIndex
            ) {
                return false;
            }

            return maneuver.startDistance >= progressDistance;
        }) ?? null
    );
}
