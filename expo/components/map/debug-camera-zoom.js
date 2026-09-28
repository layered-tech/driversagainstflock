const debugCameraZoomListeners = new Set();

export function addDebugCameraZoomListener(listener) {
    debugCameraZoomListeners.add(listener);

    return () => debugCameraZoomListeners.delete(listener);
}

export function setDebugCameraZoomLevel(zoomLevel) {
    if (!Number.isFinite(zoomLevel)) {
        return false;
    }

    debugCameraZoomListeners.forEach((listener) => listener(zoomLevel));

    return true;
}

export function applyDebugCameraZoomLevel({
    cameraRef,
    cameraUpdatesAreAllowed,
    currentZoomRef,
    followLocationMode,
    isMapReadyRef,
    locationTrackingModeRef,
    zoomLevel,
}) {
    if (
        !isMapReadyRef.current ||
        !cameraRef.current ||
        cameraUpdatesAreAllowed?.() === false
    ) {
        return false;
    }

    currentZoomRef.current = zoomLevel;
    followLocationMode.handleZoomLevelChange(
        locationTrackingModeRef.current,
        zoomLevel,
    );
    cameraRef.current.setCamera({
        animationDuration: 0,
        zoomLevel,
    });

    return true;
}
