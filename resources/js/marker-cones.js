import {
    findMarkerDirectionValue,
    MAX_MARKER_CONE_DIRECTIONS,
    parseDirectionValues,
} from './direction-values.js';

const EARTH_RADIUS_METERS = 6371008.8;
const MARKER_CONE_DISTANCE_METERS = 125;
const MARKER_CONE_SPREAD_DEGREES = 28;

export function makeMarkerConeFeatureCollection(markerFeatures) {
    return {
        type: 'FeatureCollection',
        features: markerFeatures.flatMap(makeMarkerConeFeatures),
    };
}

export function makeMarkerConeFeatures(feature) {
    const origin = feature.geometry.coordinates;
    const directions = parseDirectionValues(
        findMarkerDirectionValue(feature),
    ).slice(0, MAX_MARKER_CONE_DIRECTIONS);

    return directions.map((direction, directionIndex) => {
        const left = destinationCoordinate(
            origin,
            direction - MARKER_CONE_SPREAD_DEGREES,
            MARKER_CONE_DISTANCE_METERS,
        );
        const center = destinationCoordinate(
            origin,
            direction,
            MARKER_CONE_DISTANCE_METERS * 1.15,
        );
        const right = destinationCoordinate(
            origin,
            direction + MARKER_CONE_SPREAD_DEGREES,
            MARKER_CONE_DISTANCE_METERS,
        );

        return {
            geometry: {
                coordinates: [[origin, left, center, right, origin]],
                type: 'Polygon',
            },
            properties: {
                directionIndex,
                markerId: feature.properties?.id,
            },
            type: 'Feature',
        };
    });
}

function destinationCoordinate(origin, bearingDegrees, distanceMeters) {
    const [longitude, latitude] = origin;
    const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
    const bearing = degreesToRadians(bearingDegrees);
    const lat1 = degreesToRadians(latitude);
    const lon1 = degreesToRadians(longitude);
    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
            Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const lon2 =
        lon1 +
        Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
            Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
        );

    return [normalizeLongitude(radiansToDegrees(lon2)), radiansToDegrees(lat2)];
}

function normalizeLongitude(longitude) {
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function degreesToRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians) {
    return (radians * 180) / Math.PI;
}
