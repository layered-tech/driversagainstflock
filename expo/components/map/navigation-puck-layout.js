import { getPuckZoomStops } from './navigation-tuning.js';
import { getMapPresentationScale } from './map-presentation-scale.js';

const BASE_NAVIGATION_PUCK_SIZE = 50;
const AUTO_PLAY_NAVIGATION_PUCK_VIEWPORT_RATIO = 0.13;
const AUTO_PLAY_NAVIGATION_PUCK_MINIMUM_SIZE = 44;
const AUTO_PLAY_NAVIGATION_PUCK_MAXIMUM_SIZE = 80;
const NAVIGATION_PUCK_VIEWPORT_RATIO = 0.19;
const NAVIGATION_PUCK_MINIMUM_SIZE = 56;
const NAVIGATION_PUCK_MAXIMUM_SIZE = 88;
export const AUTO_PLAY_NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.25;
export const NAVIGATION_PUCK_SIZE = BASE_NAVIGATION_PUCK_SIZE * 1.5;
// Compatibility exports; all editable values live in navigation-tuning.js.
export const NAVIGATION_PUCK_3D_ZOOM_SCALES = getPuckZoomStops();
export const NAVIGATION_PUCK_3D_OVERVIEW_ZOOM_SCALES = getPuckZoomStops({
    mode: 'route-overview',
});
export const AUTO_PLAY_NAVIGATION_PUCK_3D_ZOOM_SCALES = getPuckZoomStops({
    surface: 'automotive',
});

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
    platform,
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
        return fallbackSize * getMapPresentationScale(platform);
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
        (Math.round(
            Math.min(maximumSize, Math.max(minimumSize, proportionalSize)) * 2,
        ) /
            2) *
        getMapPresentationScale(platform)
    );
}

export function getNavigationPuck3DScaleExpression({
    isRouteOverview = false,
    platform,
    variant = 'default',
    surface = variant === 'auto-play' ? 'automotive' : 'phone',
    mode = isRouteOverview ? 'route-overview' : 'perspective',
} = {}) {
    const zoomScales = getPuckZoomStops({ platform, surface, mode });

    return JSON.stringify([
        'interpolate',
        ['linear'],
        ['zoom'],
        ...zoomScales.flatMap(({ mapScale, zoomLevel }) => [
            zoomLevel,
            ['literal', [mapScale, mapScale, mapScale]],
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
