export const NATIVE_LOCATION_PUCK_LAYER_IDS = Object.freeze([
    'mapbox-location-indicator-layer',
    'mapbox-location-model-layer',
    'puck',
    'puck-model-layer',
]);

function hasRenderedFeatures(featureCollection) {
    return (
        Array.isArray(featureCollection?.features) &&
        featureCollection.features.length > 0
    );
}

async function nativePuckIntersectsCoordinate(mapView, coordinate) {
    const point = await mapView.getPointInView(coordinate);
    const features = await mapView.queryRenderedFeaturesAtPoint(
        point,
        [],
        NATIVE_LOCATION_PUCK_LAYER_IDS,
    );

    return hasRenderedFeatures(features);
}

export async function queryRenderedNativePuckState({
    mapView,
    rawCoordinate,
    snappedCoordinate,
}) {
    if (
        !mapView ||
        !Array.isArray(rawCoordinate) ||
        !Array.isArray(snappedCoordinate)
    ) {
        return null;
    }

    const [renderedAtSnappedCoordinate, renderedAtRawCoordinate] =
        await Promise.all([
            nativePuckIntersectsCoordinate(mapView, snappedCoordinate),
            nativePuckIntersectsCoordinate(mapView, rawCoordinate),
        ]);

    return {
        proofSource: 'rendered-query',
        providerAtRawCoordinate: null,
        providerAtSnappedCoordinate: null,
        providerCoordinate: null,
        renderedAtRawCoordinate,
        renderedAtSnappedCoordinate,
    };
}
