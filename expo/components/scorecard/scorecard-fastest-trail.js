import { getScorecardMapExposures } from './scorecard-map-data.js';

const MAX_DIRECTIONS_LOCATIONS = 12;
const fastestRouteCache = new Map();

function getSessionExposureGroups(exposures) {
    const groups = new Map();

    for (const exposure of getScorecardMapExposures(exposures)) {
        const sessionId = String(exposure.sessionId ?? 'unknown');
        const sessionExposures = groups.get(sessionId) ?? [];

        sessionExposures.push(exposure);
        groups.set(sessionId, sessionExposures);
    }

    return [...groups.entries()].filter(([, events]) => events.length >= 2);
}

function makeRouteCacheKey(sessionId, exposures) {
    return [
        sessionId,
        ...exposures.map((exposure) =>
            exposure.cameraCoordinate
                .map((value) => Number(value).toFixed(6))
                .join(','),
        ),
    ].join('|');
}

function getFastestCoordinates(response) {
    const coordinates =
        response?.route?.routes?.direct?.coordinates ??
        response?.route?.direct?.coordinates ??
        null;

    return Array.isArray(coordinates) && coordinates.length >= 2
        ? coordinates
        : null;
}

function getLocationChunks(locations) {
    const chunks = [];

    for (
        let startIndex = 0;
        startIndex < locations.length - 1;
        startIndex += MAX_DIRECTIONS_LOCATIONS - 1
    ) {
        chunks.push(
            locations.slice(startIndex, startIndex + MAX_DIRECTIONS_LOCATIONS),
        );
    }

    return chunks;
}

function areCoordinatesEqual(first, second) {
    return (
        Array.isArray(first) &&
        Array.isArray(second) &&
        first.length === second.length &&
        first.every((value, index) => value === second[index])
    );
}

async function requestSessionRoute({
    exposures,
    requestDirections,
    sessionId,
    signal,
}) {
    const cacheKey = makeRouteCacheKey(sessionId, exposures);
    const cachedCoordinates = fastestRouteCache.get(cacheKey);

    if (cachedCoordinates) {
        return cachedCoordinates;
    }

    try {
        const locations = exposures.map(({ cameraCoordinate }) => ({
            latitude: cameraCoordinate[1],
            longitude: cameraCoordinate[0],
        }));
        const coordinates = [];

        for (const locationChunk of getLocationChunks(locations)) {
            const response = await requestDirections({
                end: locationChunk.at(-1),
                signal,
                start: locationChunk[0],
                waypoints: locationChunk.slice(1, -1),
            });
            const chunkCoordinates = getFastestCoordinates(response);

            if (!chunkCoordinates) {
                return null;
            }

            const hasDuplicateSeam = areCoordinatesEqual(
                coordinates.at(-1),
                chunkCoordinates[0],
            );

            coordinates.push(
                ...chunkCoordinates.slice(hasDuplicateSeam ? 1 : 0),
            );
        }

        if (coordinates.length >= 2) {
            fastestRouteCache.set(cacheKey, coordinates);

            return coordinates;
        }

        return null;
    } catch {
        return null;
    }
}

export async function getScorecardFastestTrailLineCollection({
    exposures,
    requestDirections,
    signal,
}) {
    const routes = await Promise.all(
        getSessionExposureGroups(exposures).map(
            async ([sessionId, sessionExposures]) => ({
                coordinates: await requestSessionRoute({
                    exposures: sessionExposures,
                    requestDirections,
                    sessionId,
                    signal,
                }),
                sessionId,
            }),
        ),
    );

    return {
        features: routes.flatMap(({ coordinates, sessionId }) =>
            coordinates
                ? [
                      {
                          geometry: { coordinates, type: 'LineString' },
                          properties: { sessionId },
                          type: 'Feature',
                      },
                  ]
                : [],
        ),
        type: 'FeatureCollection',
    };
}
