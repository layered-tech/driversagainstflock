export const NAVIGATION_PUCK_SIZE = 50;

/**
 * Converts a puck slot measured within the usable map layout into the same
 * vertical coordinate space used by the Mapbox camera.
 */
export function getNavigationPuckAnchorY({ layoutY, viewportTop = 0 }) {
    if (layoutY === null || layoutY === undefined) {
        return null;
    }

    const resolvedLayoutY = Number(layoutY);
    const resolvedViewportTop = Number(viewportTop);

    if (
        !Number.isFinite(resolvedLayoutY) ||
        !Number.isFinite(resolvedViewportTop)
    ) {
        return null;
    }

    return resolvedViewportTop + resolvedLayoutY + NAVIGATION_PUCK_SIZE / 2;
}
