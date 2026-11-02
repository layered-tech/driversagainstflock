export function getDisplayedMapStyleURL({
    contributionMapStyleURL,
    contributePlacementIsActive,
    mapStyleURL,
}) {
    return contributePlacementIsActive ? contributionMapStyleURL : mapStyleURL;
}

export function refitDuoMapViewport({
    duoDevice,
    isDrivingMode,
    selectedPlace,
    selectedMarker,
    routeBounds,
    cameraPadding,
    locationController,
}) {
    if (!duoDevice || isDrivingMode) return;
    if (routeBounds) {
        locationController.fitCameraToBounds(routeBounds, {
            padding: cameraPadding,
        });
    } else if (selectedPlace?.location) {
        locationController.moveCameraToPlace(selectedPlace);
    } else if (selectedMarker?.geometry?.coordinates) {
        locationController.moveCameraToCoordinate(
            selectedMarker.geometry.coordinates,
        );
    }
}

export function fitRouteComparisonCamera({
    bounds,
    cameraPadding,
    fitCameraToBounds,
    previousFitKey,
}) {
    if (!Array.isArray(bounds?.sw) || !Array.isArray(bounds?.ne)) {
        return previousFitKey;
    }

    const fitKey = [
        bounds.sw.join(','),
        bounds.ne.join(','),
        cameraPadding.join(','),
    ].join('|');

    if (!fitKey || fitKey === previousFitKey) {
        return previousFitKey;
    }

    if (!fitCameraToBounds(bounds, { padding: cameraPadding })) {
        return previousFitKey;
    }

    return fitKey;
}
