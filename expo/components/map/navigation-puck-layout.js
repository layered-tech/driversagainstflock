const BASE_NAVIGATION_PUCK_SIZE = 50;

export const AUTO_PLAY_NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.25;
export const NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.5;

/**
 * Converts a puck slot measured within the usable map layout into the same
 * vertical coordinate space used by the Mapbox camera.
 */
export function getNavigationPuckAnchorY({
    layoutY,
    puckSize = NAVIGATION_PUCK_SIZE,
    viewportTop = 0,
}) {
    if (layoutY === null || layoutY === undefined) {
        return null;
    }

    const resolvedLayoutY = Number(layoutY);
    const resolvedPuckSize = Number(puckSize);
    const resolvedViewportTop = Number(viewportTop);

    if (
        !Number.isFinite(resolvedLayoutY) ||
        !Number.isFinite(resolvedPuckSize) ||
        !Number.isFinite(resolvedViewportTop)
    ) {
        return null;
    }

    return resolvedViewportTop + resolvedLayoutY + resolvedPuckSize / 2;
}
