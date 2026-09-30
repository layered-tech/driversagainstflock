import { makeScorecardCameraConeRing } from './exposure-detection.js';
import { getScorecardDestinationCoordinate } from './scorecard-geo.js';

const EXPOSURE_TRAVEL_LINE_HALF_LENGTH_METERS = 75;

function normalizeCoordinate(value) {
    const longitude = Number(value?.[0]);
    const latitude = Number(value?.[1]);

    return Number.isFinite(longitude) &&
        Number.isFinite(latitude) &&
        longitude >= -180 &&
        longitude <= 180 &&
        latitude >= -90 &&
        latitude <= 90
        ? [longitude, latitude]
        : null;
}

export function getScorecardMapExposures(exposures) {
    return (Array.isArray(exposures) ? exposures : [])
        .flatMap((exposure) => {
            const coordinate = normalizeCoordinate(exposure?.cameraCoordinate);

            return coordinate
                ? [
                      {
                          ...exposure,
                          cameraCoordinate: coordinate,
                      },
                  ]
                : [];
        })
        .sort(
            (first, second) =>
                Number(first.occurredAt) - Number(second.occurredAt),
        );
}

export function makeScorecardExposurePointCollection(exposures) {
    return makeExposurePointCollection(getScorecardMapExposures(exposures));
}

function makeExposurePointCollection(mappedExposures) {
    return {
        features: mappedExposures.map((exposure, index) => ({
            geometry: {
                coordinates: exposure.cameraCoordinate,
                type: 'Point',
            },
            properties: {
                certainty: exposure.certainty,
                eventId: exposure.id,
                sequenceLabel: String(index + 1),
            },
            type: 'Feature',
        })),
        type: 'FeatureCollection',
    };
}

export function makeScorecardExposureTravelLineCollection(exposures) {
    return makeExposureTravelLineCollection(
        getScorecardMapExposures(exposures),
    );
}

function makeExposureTravelLineCollection(mappedExposures) {
    return {
        features: mappedExposures.flatMap((exposure) => {
            const travelHeading = exposure.travelHeading;

            if (!Number.isFinite(travelHeading)) {
                return [];
            }

            const start = getScorecardDestinationCoordinate(
                exposure.cameraCoordinate,
                EXPOSURE_TRAVEL_LINE_HALF_LENGTH_METERS,
                travelHeading + 180,
            );
            const end = getScorecardDestinationCoordinate(
                exposure.cameraCoordinate,
                EXPOSURE_TRAVEL_LINE_HALF_LENGTH_METERS,
                travelHeading,
            );

            return start && end
                ? [
                      {
                          geometry: {
                              coordinates: [start, end],
                              type: 'LineString',
                          },
                          properties: { eventId: exposure.id },
                          type: 'Feature',
                      },
                  ]
                : [];
        }),
        type: 'FeatureCollection',
    };
}

export function makeScorecardExposureConeCollection(exposures) {
    return makeExposureConeCollection(getScorecardMapExposures(exposures));
}

function makeExposureConeCollection(mappedExposures) {
    return {
        features: mappedExposures.flatMap((exposure) =>
            (exposure.cameraDirections ?? []).map((direction, index) => ({
                geometry: {
                    coordinates: [
                        makeScorecardCameraConeRing(
                            exposure.cameraCoordinate,
                            direction,
                        ),
                    ],
                    type: 'Polygon',
                },
                properties: {
                    certainty: exposure.certainty,
                    eventId: exposure.id,
                    index,
                },
                type: 'Feature',
            })),
        ),
        type: 'FeatureCollection',
    };
}

function getLineCollectionCoordinates(lineCollection) {
    return (lineCollection?.features ?? []).flatMap((feature) => {
        const coordinates = feature?.geometry?.coordinates;

        return feature?.geometry?.type === 'LineString' &&
            Array.isArray(coordinates)
            ? coordinates.map(normalizeCoordinate).filter(Boolean)
            : [];
    });
}

export function getScorecardMapGeometryBounds(exposures, lineCollection) {
    return getMapGeometryBounds(
        getScorecardMapExposures(exposures),
        lineCollection,
    );
}

function getMapGeometryBounds(mappedExposures, lineCollection) {
    const coordinates = [
        ...mappedExposures.map((exposure) => exposure.cameraCoordinate),
        ...getLineCollectionCoordinates(lineCollection),
    ];

    if (coordinates.length < 2) {
        return null;
    }

    const longitudes = coordinates.map((coordinate) => coordinate[0]);
    const latitudes = coordinates.map((coordinate) => coordinate[1]);

    return {
        ne: [Math.max(...longitudes), Math.max(...latitudes)],
        sw: [Math.min(...longitudes), Math.min(...latitudes)],
    };
}

export function getScorecardMapBounds(exposures) {
    return getScorecardMapGeometryBounds(exposures, null);
}

export function getScorecardExposureMapData(
    exposures,
    { lineCollection = null, showCones = false } = {},
) {
    const mappedExposures = getScorecardMapExposures(exposures);
    const resolvedLineCollection =
        lineCollection ?? makeExposureTravelLineCollection(mappedExposures);

    return {
        bounds: getMapGeometryBounds(mappedExposures, resolvedLineCollection),
        coneCollection: showCones
            ? makeExposureConeCollection(mappedExposures)
            : { features: [], type: 'FeatureCollection' },
        lineCollection: resolvedLineCollection,
        mappedExposures,
        pointCollection: makeExposurePointCollection(mappedExposures),
    };
}
