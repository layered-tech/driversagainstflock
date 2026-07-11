import {
    getMarkerCoordinate,
    getStoredNumber,
    normalizeLongitude,
} from './geo';

export function getMarkerPointId(marker) {
    const markerId = marker?.properties?.id ?? marker?.id;

    return markerId === null || markerId === undefined ? '' : String(markerId);
}

export function coordinatesAreEquivalent(firstCoordinate, secondCoordinate) {
    if (!Array.isArray(firstCoordinate) || !Array.isArray(secondCoordinate)) {
        return false;
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
        return false;
    }

    return (
        Math.abs(
            normalizeLongitude(firstLongitude) -
                normalizeLongitude(secondLongitude),
        ) < 0.000001 && Math.abs(firstLatitude - secondLatitude) < 0.000001
    );
}

export function findMarkerPointForFeature(markerPoints, feature) {
    const markerId =
        feature?.properties?.markerId ??
        feature?.properties?.id ??
        feature?.id ??
        '';
    const normalizedMarkerId =
        markerId === null || markerId === undefined ? '' : String(markerId);

    if (normalizedMarkerId) {
        const matchingMarker = markerPoints.find(
            (marker) => getMarkerPointId(marker) === normalizedMarkerId,
        );

        if (matchingMarker) {
            return matchingMarker;
        }
    }

    const featureCoordinate = feature?.geometry?.coordinates;

    if (!Array.isArray(featureCoordinate)) {
        return null;
    }

    const featureProperties =
        feature?.properties &&
        typeof feature.properties === 'object' &&
        !Array.isArray(feature.properties)
            ? feature.properties
            : {};

    return (
        markerPoints.find((marker) =>
            coordinatesAreEquivalent(
                getMarkerCoordinate(marker),
                featureCoordinate,
            ),
        ) ?? {
            location: featureCoordinate,
            properties: {
                ...featureProperties,
                id: normalizedMarkerId || 'Unknown',
            },
        }
    );
}
