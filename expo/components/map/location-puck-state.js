export function shouldShowNavigationPuck({
    isDrivingMode,
    navigationPuckVariant,
}) {
    return isDrivingMode || navigationPuckVariant === 'auto-play';
}

export function shouldUseAutoPlayNavigationPuckImages(navigationPuckVariant) {
    return navigationPuckVariant === 'auto-play';
}

export function getLocationPuckCameraOwnershipKey(followUserLocation) {
    return followUserLocation === true
        ? 'follow-camera'
        : 'external-or-idle-camera';
}

export function shouldSuppressLocationPuck2DFallback({
    locationPuck3DStatus,
    locationPuckRequests3D,
}) {
    if (locationPuckRequests3D) {
        return locationPuck3DStatus !== 'failed';
    }

    return (
        locationPuck3DStatus === 'preparing' ||
        locationPuck3DStatus === 'active' ||
        locationPuck3DStatus === 'clearing'
    );
}
