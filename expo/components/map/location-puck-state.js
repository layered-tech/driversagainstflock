export function shouldShowNavigationPuck({
    isDrivingMode,
    navigationPuckVariant,
}) {
    return isDrivingMode || navigationPuckVariant === 'auto-play';
}

export function shouldUseAutoPlayNavigationPuckImages(navigationPuckVariant) {
    return navigationPuckVariant === 'auto-play';
}

export function getNavigationPuckCameraOwnershipKey(followUserLocation) {
    return followUserLocation === true
        ? 'rnmapbox-follow-camera'
        : 'external-or-idle-camera';
}

export function shouldSuppressNavigationPuckFallback({
    navigationPuck3DStatus,
    navigationPuckRequestsNative3D,
}) {
    if (navigationPuckRequestsNative3D) {
        return navigationPuck3DStatus !== 'failed';
    }

    return (
        navigationPuck3DStatus === 'preparing' ||
        navigationPuck3DStatus === 'active' ||
        navigationPuck3DStatus === 'clearing'
    );
}
