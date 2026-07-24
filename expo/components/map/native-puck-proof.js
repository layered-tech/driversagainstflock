import { Platform } from 'react-native';
import {
    getLocationIndicatorCoordinateAsync,
    getLocationProviderCoordinateAsync,
    getLocationPuck3DStateAsync,
    isLocationPuckRenderedAtCoordinateAsync,
} from './location-puck-3d';
import { queryRenderedNativePuckState } from './native-puck-render-query';
import { nativePuckCoordinatesMatch } from './native-puck-state';

function toCoordinate(location) {
    const longitude = Number(location?.longitude);
    const latitude = Number(location?.latitude);

    return Number.isFinite(longitude) && Number.isFinite(latitude)
        ? [longitude, latitude]
        : null;
}

async function queryAndroidNativePuckState({
    mapView,
    rawCoordinate,
    snappedCoordinate,
}) {
    const [
        providerLocation,
        indicatorLocation,
        puckConfiguration,
        renderedAtSnappedCoordinate,
    ] = await Promise.all([
        getLocationProviderCoordinateAsync(mapView),
        getLocationIndicatorCoordinateAsync(mapView),
        getLocationPuck3DStateAsync(mapView),
        isLocationPuckRenderedAtCoordinateAsync(mapView, snappedCoordinate),
    ]);
    const providerCoordinate = toCoordinate(providerLocation);
    const indicatorCoordinate = toCoordinate(indicatorLocation);

    return {
        ...puckConfiguration,
        indicatorAtRawCoordinate: nativePuckCoordinatesMatch(
            indicatorCoordinate,
            rawCoordinate,
        ),
        indicatorAtSnappedCoordinate: nativePuckCoordinatesMatch(
            indicatorCoordinate,
            snappedCoordinate,
        ),
        indicatorCoordinate,
        proofSource: 'native-3d-puck',
        providerAtRawCoordinate: nativePuckCoordinatesMatch(
            providerCoordinate,
            rawCoordinate,
        ),
        providerAtSnappedCoordinate: nativePuckCoordinatesMatch(
            providerCoordinate,
            snappedCoordinate,
        ),
        providerCoordinate,
        renderedAtSnappedCoordinate,
    };
}

async function queryIOSNativePuckState({
    mapView,
    rawCoordinate,
    snappedCoordinate,
}) {
    const [renderedState, puckConfiguration] = await Promise.all([
        queryRenderedNativePuckState({
            mapView,
            rawCoordinate,
            snappedCoordinate,
        }),
        getLocationPuck3DStateAsync(mapView),
    ]);

    return {
        ...renderedState,
        ...puckConfiguration,
        proofSource: 'rendered-query-3d',
    };
}

export async function queryNativePuckState({
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

    if (Platform.OS === 'android') {
        return queryAndroidNativePuckState({
            mapView,
            rawCoordinate,
            snappedCoordinate,
        });
    }

    return queryIOSNativePuckState({
        mapView,
        rawCoordinate,
        snappedCoordinate,
    });
}
