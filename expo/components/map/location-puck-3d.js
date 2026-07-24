import { requireOptionalNativeModule } from 'expo-modules-core';
import { findNodeHandle, Platform } from 'react-native';

const mapLocationPuckModule = ['android', 'ios'].includes(Platform.OS)
    ? requireOptionalNativeModule('MapLocationPuck')
    : null;

function getNativeMapViewTag(mapView) {
    const resolvedMapView =
        mapView && typeof mapView === 'object' && 'current' in mapView
            ? mapView.current
            : mapView;

    return findNodeHandle(resolvedMapView?._nativeRef ?? resolvedMapView);
}

function getSupportedMapViewTag(mapView) {
    const mapViewTag = getNativeMapViewTag(mapView);

    return Number.isInteger(mapViewTag) ? mapViewTag : null;
}

export function isLocationPuck3DSupported() {
    return Boolean(
        mapLocationPuckModule?.applyLocationPuck3D &&
        mapLocationPuckModule?.clearLocationPuck3D,
    );
}

export async function applyLocationPuck3DAsync(
    mapView,
    scale,
    slot,
    layerAbove,
) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !isLocationPuck3DSupported()) {
        return false;
    }

    return mapLocationPuckModule.applyLocationPuck3D(
        mapViewTag,
        scale,
        slot ?? null,
        layerAbove ?? null,
    );
}

export async function clearLocationPuck3DAsync(mapView) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !isLocationPuck3DSupported()) {
        return false;
    }

    return mapLocationPuckModule.clearLocationPuck3D(mapViewTag);
}

export async function getLocationPuck3DStateAsync(mapView) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !mapLocationPuckModule?.getLocationPuckState) {
        return null;
    }

    return mapLocationPuckModule.getLocationPuckState(mapViewTag);
}

export async function getLocationProviderCoordinateAsync(mapView) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (
        mapViewTag === null ||
        !mapLocationPuckModule?.getLocationProviderCoordinate
    ) {
        return null;
    }

    return mapLocationPuckModule.getLocationProviderCoordinate(mapViewTag);
}

export async function getLocationIndicatorCoordinateAsync(mapView) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !mapLocationPuckModule?.getIndicatorCoordinate) {
        return null;
    }

    return mapLocationPuckModule.getIndicatorCoordinate(mapViewTag);
}

export async function isLocationPuckRenderedAtCoordinateAsync(
    mapView,
    coordinate,
) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (
        mapViewTag === null ||
        !Array.isArray(coordinate) ||
        !mapLocationPuckModule?.isPuckRenderedAtCoordinate
    ) {
        return null;
    }

    return mapLocationPuckModule.isPuckRenderedAtCoordinate(
        mapViewTag,
        Number(coordinate[0]),
        Number(coordinate[1]),
    );
}
