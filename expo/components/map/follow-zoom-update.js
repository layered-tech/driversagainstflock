export const FOLLOW_ZOOM_UPDATE_EPSILON = 0.05;
// A long throttle makes normal acceleration look like a sequence of large
// camera jumps. This is short enough to track driving speed while still
// coalescing the high-frequency location stream.
export const FOLLOW_ZOOM_UPDATE_INTERVAL_MS = 750;

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
