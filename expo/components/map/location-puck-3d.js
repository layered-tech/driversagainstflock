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

function getFiniteNumber(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function getCameraPaddingValue(padding, key) {
    return getFiniteNumber(padding?.[key]) ?? 0;
}

export function isLocationPuck3DSupported() {
    return Boolean(
        mapLocationPuckModule?.applyLocationPuck3D &&
            mapLocationPuckModule?.clearLocationPuck3D,
    );
}

export function isLocationPuckCameraFollowSupported() {
    return Boolean(
        mapLocationPuckModule?.setLocationPuckCameraFollow &&
            mapLocationPuckModule?.isLocationPuckCameraFollowActive,
    );
}

export function isLocationPuckLocationProviderSupported() {
    return Boolean(
        mapLocationPuckModule?.setLocationPuckLocation &&
            mapLocationPuckModule?.clearLocationPuckLocationProvider,
    );
}

export async function setLocationPuckLocationAsync(mapView, location) {
    const mapViewTag = getSupportedMapViewTag(mapView);
    const coordinate = location?.coordinate;
    const longitude = getFiniteNumber(coordinate?.[0]);
    const latitude = getFiniteNumber(coordinate?.[1]);

    if (
        mapViewTag === null ||
        longitude === null ||
        latitude === null ||
        !isLocationPuckLocationProviderSupported()
    ) {
        return false;
    }

    return mapLocationPuckModule.setLocationPuckLocation(
        mapViewTag,
        longitude,
        latitude,
        getFiniteNumber(location?.heading) ?? 0,
        getFiniteNumber(location?.recordedAt),
    );
}

export async function clearLocationPuckLocationProviderAsync(mapView) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !isLocationPuckLocationProviderSupported()) {
        return false;
    }

    return mapLocationPuckModule.clearLocationPuckLocationProvider(mapViewTag);
}

export async function setLocationPuckCameraFollowAsync(mapView, followProps) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !isLocationPuckCameraFollowSupported()) {
        return false;
    }

    const padding = followProps?.padding;

    return mapLocationPuckModule.setLocationPuckCameraFollow(
        mapViewTag,
        followProps?.enabled === true,
        getFiniteNumber(followProps?.zoomLevel),
        getFiniteNumber(followProps?.pitch),
        getCameraPaddingValue(padding, 'paddingTop'),
        getCameraPaddingValue(padding, 'paddingLeft'),
        getCameraPaddingValue(padding, 'paddingBottom'),
        getCameraPaddingValue(padding, 'paddingRight'),
    );
}

export async function isLocationPuckCameraFollowActiveAsync(mapView) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !isLocationPuckCameraFollowSupported()) {
        return false;
    }

    return mapLocationPuckModule.isLocationPuckCameraFollowActive(mapViewTag);
}

export async function applyLocationPuck3DAsync(
    mapView,
    scaleExpression,
    slot,
    layerAbove,
) {
    const mapViewTag = getSupportedMapViewTag(mapView);

    if (mapViewTag === null || !isLocationPuck3DSupported()) {
        return false;
    }

    return mapLocationPuckModule.applyLocationPuck3D(
        mapViewTag,
        scaleExpression,
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
