const DEFAULT_CAMERA_ANIMATION_DURATION_MS = 450;

function getFiniteNumber(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

export function getImperativeFollowCameraStop({
    animationDuration = DEFAULT_CAMERA_ANIMATION_DURATION_MS,
    location,
    padding,
    pitch,
    zoomLevel,
}) {
    const latitude = getFiniteNumber(location?.latitude);
    const longitude = getFiniteNumber(location?.longitude);

    if (latitude === null || longitude === null) {
        return null;
    }

    const heading = getFiniteNumber(
        location?.courseHeading ?? location?.heading,
    );
    const resolvedPitch = getFiniteNumber(pitch);
    const resolvedZoomLevel = getFiniteNumber(zoomLevel);

    return {
        animationDuration,
        animationMode: 'easeTo',
        centerCoordinate: [longitude, latitude],
        ...(heading !== null ? { heading } : {}),
        ...(padding ? { padding } : {}),
        ...(resolvedPitch !== null ? { pitch: resolvedPitch } : {}),
        ...(resolvedZoomLevel !== null ? { zoomLevel: resolvedZoomLevel } : {}),
    };
}
