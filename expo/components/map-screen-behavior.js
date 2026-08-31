export function getDisplayedMapStyleURL({
    contributionMapStyleURL,
    contributePlacementIsActive,
    mapStyleURL,
}) {
    return contributePlacementIsActive ? contributionMapStyleURL : mapStyleURL;
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
