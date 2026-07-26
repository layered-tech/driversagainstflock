const BASE_NAVIGATION_PUCK_SIZE = 50;
const AUTO_PLAY_NAVIGATION_PUCK_VIEWPORT_RATIO = 0.13;
const AUTO_PLAY_NAVIGATION_PUCK_MINIMUM_SIZE = 44;
const AUTO_PLAY_NAVIGATION_PUCK_MAXIMUM_SIZE = 80;
const NAVIGATION_PUCK_VIEWPORT_RATIO = 0.19;
const NAVIGATION_PUCK_MINIMUM_SIZE = 56;
const NAVIGATION_PUCK_MAXIMUM_SIZE = 88;

export const AUTO_PLAY_NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.25;
export const NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.5;

function getPositiveDimension(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0
        ? numericValue
        : null;
}

/**
 * Keeps the navigation puck proportional to its visible map surface. Mapbox's
 * viewport scale mode then preserves this resolved screen size while zooming.
 */
export function getNavigationPuckSize({
    variant = 'default',
    viewportHeight,
    viewportWidth,
}) {
    const height = getPositiveDimension(viewportHeight);
    const width = getPositiveDimension(viewportWidth);
    const fallbackSize =
        variant === 'auto-play'
            ? AUTO_PLAY_NAVIGATION_PUCK_SIZE
            : NAVIGATION_PUCK_SIZE;

    if (height === null || width === null) {
        return fallbackSize;
    }

    const shortestViewportSide = Math.min(height, width);
    const isAutoPlay = variant === 'auto-play';
    const viewportRatio = isAutoPlay
        ? AUTO_PLAY_NAVIGATION_PUCK_VIEWPORT_RATIO
        : NAVIGATION_PUCK_VIEWPORT_RATIO;
    const minimumSize = isAutoPlay
        ? AUTO_PLAY_NAVIGATION_PUCK_MINIMUM_SIZE
        : NAVIGATION_PUCK_MINIMUM_SIZE;
    const maximumSize = isAutoPlay
        ? AUTO_PLAY_NAVIGATION_PUCK_MAXIMUM_SIZE
        : NAVIGATION_PUCK_MAXIMUM_SIZE;
    const proportionalSize = shortestViewportSide * viewportRatio;

    return (
        Math.round(
            Math.min(maximumSize, Math.max(minimumSize, proportionalSize)) * 2,
        ) / 2
    );
}

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
