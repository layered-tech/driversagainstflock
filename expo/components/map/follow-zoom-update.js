export const FOLLOW_ZOOM_UPDATE_EPSILON = 0.05;
export const FOLLOW_ZOOM_UPDATE_INTERVAL_MS = 4000;

export function getFollowZoomUpdate({
    currentZoomLevel,
    force = false,
    lastUpdateAt = null,
    nextZoomLevel,
    now = Date.now(),
    userZoomOverrideIsActive = false,
}) {
    const updateIntervalHasElapsed =
        force ||
        !Number.isFinite(lastUpdateAt) ||
        (Number.isFinite(now) &&
            now - lastUpdateAt >= FOLLOW_ZOOM_UPDATE_INTERVAL_MS);
    const shouldUpdate =
        (!userZoomOverrideIsActive || force) &&
        updateIntervalHasElapsed &&
        (force ||
            Math.abs(currentZoomLevel - nextZoomLevel) >=
                FOLLOW_ZOOM_UPDATE_EPSILON);

    return {
        shouldUpdate,
    };
}
