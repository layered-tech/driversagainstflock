const BASE_NAVIGATION_PUCK_SIZE = 50;
const AUTO_PLAY_NAVIGATION_PUCK_VIEWPORT_RATIO = 0.13;
const AUTO_PLAY_NAVIGATION_PUCK_MINIMUM_SIZE = 44;
const AUTO_PLAY_NAVIGATION_PUCK_MAXIMUM_SIZE = 80;
const NAVIGATION_PUCK_VIEWPORT_RATIO = 0.19;
const NAVIGATION_PUCK_MINIMUM_SIZE = 56;
const NAVIGATION_PUCK_MAXIMUM_SIZE = 88;

export const AUTO_PLAY_NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.25;
export const NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.5;
const NAVIGATION_PUCK_3D_DEFAULT_ZOOM_LEVEL = 17;

// Mapbox's 3D puck uses map coordinates, not React Native points. The scale
// doubles at each zoom level farther out until reaching the 640 maximum.
export const NAVIGATION_PUCK_3D_ZOOM_SCALES = [
    { mapScale: 480, zoomLevel: 10 }, // 1/3
    { mapScale: 360, zoomLevel: 11 }, // 1/3
    { mapScale: 270, zoomLevel: 12 }, // 1/3
    { mapScale: 202.5, zoomLevel: 13 }, // 1/2
    { mapScale: 135, zoomLevel: 14 }, // 1/2
    { mapScale: 90, zoomLevel: 15 }, // 1/2
    { mapScale: 60, zoomLevel: 16 }, // 1/2
    { mapScale: 40, zoomLevel: 17 }, // 1
    { mapScale: 20, zoomLevel: 18 }, // 1
    { mapScale: 10, zoomLevel: 19 }, // 1
    { mapScale: 5, zoomLevel: 20 },
];

export const AUTO_PLAY_NAVIGATION_PUCK_3D_ZOOM_SCALES =
    NAVIGATION_PUCK_3D_ZOOM_SCALES;

function getPositiveDimension(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0
        ? numericValue
        : null;
}

/**
 * Keeps only the 2D fallback puck and its related overlays proportional to the
 * visible map surface. The native 3D puck has its own map-relative scale.
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

export function getNavigationPuck3DMapScale({
    variant = 'default',
    zoomLevel,
} = {}) {
    const zoomScales =
        variant === 'auto-play'
            ? AUTO_PLAY_NAVIGATION_PUCK_3D_ZOOM_SCALES
            : NAVIGATION_PUCK_3D_ZOOM_SCALES;
    const firstZoomScale = zoomScales[0];
    const lastZoomScale = zoomScales[zoomScales.length - 1];
    const resolvedZoomLevel = Number.isFinite(zoomLevel)
        ? zoomLevel
        : NAVIGATION_PUCK_3D_DEFAULT_ZOOM_LEVEL;

    if (resolvedZoomLevel <= firstZoomScale.zoomLevel) {
        return firstZoomScale.mapScale;
    }

    for (let index = 1; index < zoomScales.length; index += 1) {
        const previousZoomScale = zoomScales[index - 1];
        const nextZoomScale = zoomScales[index];

        if (resolvedZoomLevel <= nextZoomScale.zoomLevel) {
            const zoomRange =
                nextZoomScale.zoomLevel - previousZoomScale.zoomLevel;
            const zoomRatio =
                (resolvedZoomLevel - previousZoomScale.zoomLevel) / zoomRange;
            const mapScaleRange =
                nextZoomScale.mapScale - previousZoomScale.mapScale;

            return previousZoomScale.mapScale + mapScaleRange * zoomRatio;
        }
    }

    return lastZoomScale.mapScale;
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
