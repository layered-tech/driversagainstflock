export const ELECTRONIC_HORIZON_ALPR_ALERT_PATH_BUFFER_METERS = 85;
export const ELECTRONIC_HORIZON_ALERT_MAXIMUM_DISTANCE_METERS = 1609.344;
export const ELECTRONIC_HORIZON_ALERT_PATH_LENGTH_METERS = 16093.44;
export const ELECTRONIC_HORIZON_POLICE_ALERT_PATH_BUFFER_METERS = 120;

const EARTH_RADIUS_METERS = 6371008.8;

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

function getStoredNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function getCoordinateDistanceMeters(fromCoordinate, toCoordinate) {
    const fromLongitude = getStoredNumber(fromCoordinate?.[0]);
    const fromLatitude = getStoredNumber(fromCoordinate?.[1]);
    const toLongitude = getStoredNumber(toCoordinate?.[0]);
    const toLatitude = getStoredNumber(toCoordinate?.[1]);

    if (
        fromLongitude === null ||
        fromLatitude === null ||
        toLongitude === null ||
        toLatitude === null
    ) {
        return null;
    }

    const latitudeDelta = degreesToRadians(toLatitude - fromLatitude);
    const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(degreesToRadians(fromLatitude)) *
            Math.cos(degreesToRadians(toLatitude)) *
            Math.sin(longitudeDelta / 2) ** 2;

    return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

export function normalizeElectronicHorizonCoordinate(coordinate) {
    const longitude = getStoredNumber(
        Array.isArray(coordinate) ? coordinate[0] : coordinate?.longitude,
    );
    const latitude = getStoredNumber(
        Array.isArray(coordinate) ? coordinate[1] : coordinate?.latitude,
    );

    if (
        longitude === null ||
        latitude === null ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

export function normalizeElectronicHorizonCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates
        .map(normalizeElectronicHorizonCoordinate)
        .filter(Boolean);
}

function normalizeElectronicHorizonSegment(segment, index) {
    const coordinates = normalizeElectronicHorizonCoordinates(
        segment?.coordinates,
    );

    if (coordinates.length < 2) {
        return null;
    }

    return {
        coordinates,
        edgeId: String(segment?.edgeId ?? `edge-${index}`),
        level: Math.max(0, Math.round(getStoredNumber(segment?.level) ?? 0)),
        probability: getStoredNumber(segment?.probability),
    };
}

export function normalizeElectronicHorizon(horizon) {
    const primaryPathCoordinates = normalizeElectronicHorizonCoordinates(
        horizon?.primaryPath?.coordinates,
    );

    if (primaryPathCoordinates.length < 2) {
        return null;
    }

    const primaryPathSegments = Array.isArray(horizon?.primaryPath?.segments)
        ? horizon.primaryPath.segments
              .map(normalizeElectronicHorizonSegment)
              .filter(Boolean)
        : [];
    const branches = Array.isArray(horizon?.branches)
        ? horizon.branches
              .map(normalizeElectronicHorizonSegment)
              .filter(Boolean)
        : [];

    return {
        branches,
        primaryPath: {
            coordinates: primaryPathCoordinates,
            probability: getStoredNumber(horizon?.primaryPath?.probability),
            segments: primaryPathSegments,
        },
        updatedAt: getStoredNumber(horizon?.updatedAt) ?? Date.now(),
    };
}

export function getElectronicHorizonPrimaryCoordinates(horizon) {
    return normalizeElectronicHorizon(horizon)?.primaryPath.coordinates ?? [];
}

function coordinateToRelativeMeters(coordinate, origin) {
    const latitudeRadians = degreesToRadians((coordinate[1] + origin[1]) / 2);

    return {
        x:
            EARTH_RADIUS_METERS *
            degreesToRadians(coordinate[0] - origin[0]) *
            Math.cos(latitudeRadians),
        y: EARTH_RADIUS_METERS * degreesToRadians(coordinate[1] - origin[1]),
    };
}

function interpolateCoordinate(start, end, progress) {
    const longitudeDelta = ((end[0] - start[0] + 540) % 360) - 180;
    const longitude = start[0] + longitudeDelta * progress;

    return [
        longitude > 180
            ? longitude - 360
            : longitude < -180
              ? longitude + 360
              : longitude,
        start[1] + (end[1] - start[1]) * progress,
    ];
}

function getClosestPathProjection(path, target) {
    if (path.length < 2 || !target) {
        return null;
    }

    let closestPosition = null;
    let distanceBeforeSegmentMeters = 0;

    for (let index = 1; index < path.length; index += 1) {
        const start = path[index - 1];
        const end = path[index];
        const segmentDistanceMeters = getCoordinateDistanceMeters(start, end);

        if (!Number.isFinite(segmentDistanceMeters) || !segmentDistanceMeters) {
            continue;
        }

        const endOffset = coordinateToRelativeMeters(end, start);
        const targetOffset = coordinateToRelativeMeters(target, start);
        const squaredSegmentLength = endOffset.x ** 2 + endOffset.y ** 2;
        const progress = Math.min(
            1,
            Math.max(
                0,
                (targetOffset.x * endOffset.x + targetOffset.y * endOffset.y) /
                    squaredSegmentLength,
            ),
        );
        const closestOffset = {
            x: endOffset.x * progress,
            y: endOffset.y * progress,
        };
        const distanceFromPathMeters = Math.hypot(
            targetOffset.x - closestOffset.x,
            targetOffset.y - closestOffset.y,
        );
        const nextPosition = {
            coordinate: interpolateCoordinate(start, end, progress),
            distanceAheadMeters:
                distanceBeforeSegmentMeters + segmentDistanceMeters * progress,
            distanceFromPathMeters,
            segmentIndex: index - 1,
        };

        if (
            !closestPosition ||
            nextPosition.distanceFromPathMeters <
                closestPosition.distanceFromPathMeters - 0.5 ||
            (Math.abs(
                nextPosition.distanceFromPathMeters -
                    closestPosition.distanceFromPathMeters,
            ) <= 0.5 &&
                nextPosition.distanceAheadMeters >
                    closestPosition.distanceAheadMeters)
        ) {
            closestPosition = nextPosition;
        }

        distanceBeforeSegmentMeters += segmentDistanceMeters;
    }

    return closestPosition;
}

function trimPathCoordinatesToDistance(coordinates, maximumDistanceMeters) {
    if (coordinates.length < 2) {
        return coordinates;
    }

    const maximumDistance = getStoredNumber(maximumDistanceMeters);

    if (maximumDistance === null || maximumDistance <= 0) {
        return coordinates;
    }

    const trimmedCoordinates = [coordinates[0]];
    let distanceBeforeSegmentMeters = 0;

    for (let index = 1; index < coordinates.length; index += 1) {
        const start = coordinates[index - 1];
        const end = coordinates[index];
        const segmentDistanceMeters = getCoordinateDistanceMeters(start, end);

        if (!Number.isFinite(segmentDistanceMeters) || !segmentDistanceMeters) {
            continue;
        }

        if (
            distanceBeforeSegmentMeters + segmentDistanceMeters <=
            maximumDistance
        ) {
            trimmedCoordinates.push(end);
            distanceBeforeSegmentMeters += segmentDistanceMeters;
            continue;
        }

        const endpoint = interpolateCoordinate(
            start,
            end,
            Math.max(0, maximumDistance - distanceBeforeSegmentMeters) /
                segmentDistanceMeters,
        );

        if (
            endpoint[0] !== trimmedCoordinates.at(-1)?.[0] ||
            endpoint[1] !== trimmedCoordinates.at(-1)?.[1]
        ) {
            trimmedCoordinates.push(endpoint);
        }

        break;
    }

    return trimmedCoordinates;
}

export function getDirectionsRouteCoordinatesAhead(
    routeCoordinates,
    userLocation,
    maximumDistanceMeters = ELECTRONIC_HORIZON_ALERT_PATH_LENGTH_METERS,
) {
    const route = normalizeElectronicHorizonCoordinates(routeCoordinates);
    const userCoordinate = normalizeElectronicHorizonCoordinate(userLocation);

    if (route.length < 2) {
        return [];
    }

    const projection = getClosestPathProjection(route, userCoordinate);
    const coordinatesAhead = projection
        ? [projection.coordinate, ...route.slice(projection.segmentIndex + 1)]
        : route;
    const uniqueCoordinatesAhead = coordinatesAhead.filter(
        (coordinate, index) =>
            index === 0 ||
            coordinate[0] !== coordinatesAhead[index - 1][0] ||
            coordinate[1] !== coordinatesAhead[index - 1][1],
    );

    return trimPathCoordinatesToDistance(
        uniqueCoordinatesAhead,
        maximumDistanceMeters,
    );
}

export function getElectronicHorizonPathPosition(coordinates, coordinate) {
    const path = normalizeElectronicHorizonCoordinates(coordinates);
    const target = normalizeElectronicHorizonCoordinate(coordinate);

    return getClosestPathProjection(path, target);
}

function getAlprSubtitle(node) {
    const tags = node?.tags ?? {};
    const values = [
        tags.name,
        tags.operator,
        tags.brand,
        tags.manufacturer,
    ].filter((value) => typeof value === 'string' && value.trim());

    return values[0] ?? 'OpenStreetMap ALPR reader';
}

function getPoliceSubtitle(alert) {
    const location = [alert?.street, alert?.city]
        .filter((value) => typeof value === 'string' && value.trim())
        .join(', ');

    if (alert?.subtype === 'POLICE_HIDING') {
        return location ? `Hidden police · ${location}` : 'Hidden police';
    }

    return location ? `Reported on Waze · ${location}` : 'Reported on Waze';
}

function makeUpcomingAlert({
    coordinate,
    id,
    pathCoordinates,
    pathBufferMeters,
    type,
    title,
    subtitle,
    source,
}) {
    const position = getElectronicHorizonPathPosition(
        pathCoordinates,
        coordinate,
    );

    if (
        !position ||
        position.distanceFromPathMeters > pathBufferMeters ||
        position.distanceAheadMeters < 0 ||
        position.distanceAheadMeters >
            ELECTRONIC_HORIZON_ALERT_MAXIMUM_DISTANCE_METERS
    ) {
        return null;
    }

    return {
        coordinate,
        distanceFromPathMeters: position.distanceFromPathMeters,
        distanceMeters: position.distanceAheadMeters,
        id,
        source,
        subtitle,
        title,
        type,
    };
}

export function getUpcomingElectronicHorizonAlerts({
    alprNodes = [],
    electronicHorizon,
    pathCoordinates,
    policeAlerts = [],
} = {}) {
    const explicitPathCoordinates =
        normalizeElectronicHorizonCoordinates(pathCoordinates);
    const resolvedPathCoordinates =
        explicitPathCoordinates.length >= 2
            ? explicitPathCoordinates
            : getElectronicHorizonPrimaryCoordinates(electronicHorizon);

    if (resolvedPathCoordinates.length < 2) {
        return [];
    }

    const alprAlerts = Array.isArray(alprNodes)
        ? alprNodes
              .map((node, index) =>
                  makeUpcomingAlert({
                      coordinate: node?.coordinate,
                      id: String(
                          node?.id ??
                              node?.osmId ??
                              node?.osm_id ??
                              `alpr-${index}`,
                      ),
                      pathBufferMeters:
                          ELECTRONIC_HORIZON_ALPR_ALERT_PATH_BUFFER_METERS,
                      pathCoordinates: resolvedPathCoordinates,
                      source: node,
                      subtitle: getAlprSubtitle(node),
                      title: 'ALPR ahead',
                      type: 'alpr',
                  }),
              )
              .filter(Boolean)
        : [];
    const wazeAlerts = Array.isArray(policeAlerts)
        ? policeAlerts
              .map((alert, index) =>
                  makeUpcomingAlert({
                      coordinate: alert?.coordinate,
                      id: String(alert?.id ?? `police-${index}`),
                      pathBufferMeters:
                          ELECTRONIC_HORIZON_POLICE_ALERT_PATH_BUFFER_METERS,
                      pathCoordinates: resolvedPathCoordinates,
                      source: alert,
                      subtitle: getPoliceSubtitle(alert),
                      title: 'Police reported ahead',
                      type: 'police',
                  }),
              )
              .filter(Boolean)
        : [];

    return [...alprAlerts, ...wazeAlerts].sort(
        (firstAlert, secondAlert) =>
            firstAlert.distanceMeters - secondAlert.distanceMeters,
    );
}
