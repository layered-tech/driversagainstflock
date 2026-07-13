export const FOLLOW_ZOOM_UPDATE_EPSILON = 0.05;

export function getFollowZoomUpdate({
    currentZoomLevel,
    deferUntilNextLocation = false,
    force = false,
    nextZoomLevel,
    userZoomOverrideIsActive = false,
}) {
    const shouldUpdate =
        (!userZoomOverrideIsActive || force) &&
        (force ||
            Math.abs(currentZoomLevel - nextZoomLevel) >=
                FOLLOW_ZOOM_UPDATE_EPSILON);

    return {
        deferUntilNextLocation:
            shouldUpdate && deferUntilNextLocation && !force,
        shouldUpdate,
    };
}
