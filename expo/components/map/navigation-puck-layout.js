const BASE_NAVIGATION_PUCK_SIZE = 50;
const AUTO_PLAY_NAVIGATION_PUCK_VIEWPORT_RATIO = 0.13;
const AUTO_PLAY_NAVIGATION_PUCK_MINIMUM_SIZE = 44;
const AUTO_PLAY_NAVIGATION_PUCK_MAXIMUM_SIZE = 80;
const NAVIGATION_PUCK_VIEWPORT_RATIO = 0.19;
const NAVIGATION_PUCK_MINIMUM_SIZE = 56;
const NAVIGATION_PUCK_MAXIMUM_SIZE = 88;
const AUTO_PLAY_NAVIGATION_PUCK_3D_SCALE_FACTOR = 0.6;
const IOS_NAVIGATION_PUCK_3D_SCALE_FACTOR = 0.6;

export const AUTO_PLAY_NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.25;
export const NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.5;
// Mapbox's 3D puck uses map coordinates, not React Native points. Keep the
// tuned scale curve in one renderer-owned expression so a camera jump and its
// matching puck scale are committed in the same frame.
export const NAVIGATION_PUCK_3D_ZOOM_SCALES = [
    { mapScale: 683.43, zoomLevel: 10 }, // 1/3
    { mapScale: 455.62, zoomLevel: 11 }, // 1/3
    { mapScale: 303.75, zoomLevel: 12 }, // 1/3
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
    NAVIGATION_PUCK_3D_ZOOM_SCALES.map(({ mapScale, zoomLevel }) => ({
        mapScale: mapScale * AUTO_PLAY_NAVIGATION_PUCK_3D_SCALE_FACTOR,
        zoomLevel,
    }));

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

export function getNavigationPuck3DScaleExpression({
    platform,
    variant = 'default',
} = {}) {
    const zoomScales =
        variant === 'auto-play'
            ? AUTO_PLAY_NAVIGATION_PUCK_3D_ZOOM_SCALES
            : NAVIGATION_PUCK_3D_ZOOM_SCALES;
    const platformScaleFactor =
        platform === 'ios' && variant !== 'auto-play'
            ? IOS_NAVIGATION_PUCK_3D_SCALE_FACTOR
            : 1;

    return JSON.stringify([
        'interpolate',
        ['linear'],
        ['zoom'],
        ...zoomScales.flatMap(({ mapScale, zoomLevel }) => [
            zoomLevel,
            ['literal', Array(3).fill(mapScale * platformScaleFactor)],
        ]),
    ]);
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
