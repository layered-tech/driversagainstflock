import { AUTO_PLAY_DRIVING_LOCATION_FOLLOW_VISIBLE_Y_RATIO } from './map/current-road-pill-layout.js';

const AUTO_PLAY_ORNAMENT_INSET_MAX_VIEWPORT_FRACTION = 0.35;

export const AUTO_PLAY_DRIVING_CAMERA_FOLLOW_VISIBLE_Y_RATIO =
    AUTO_PLAY_DRIVING_LOCATION_FOLLOW_VISIBLE_Y_RATIO;

function getPositiveDimension(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function getSafeAreaInsetValue(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function getSafeAreaInsets(insets, leftScale = 1) {
    return {
        bottom: getSafeAreaInsetValue(insets?.bottom),
        left: getSafeAreaInsetValue(insets?.left) * leftScale,
        right: getSafeAreaInsetValue(insets?.right),
        top: getSafeAreaInsetValue(insets?.top),
    };
}

function getClampedOrnamentInset(value, viewportExtent) {
    if (!viewportExtent) {
        return value;
    }

    return Math.min(
        value,
        viewportExtent * AUTO_PLAY_ORNAMENT_INSET_MAX_VIEWPORT_FRACTION,
    );
}

/**
 * Resolves the Auto Play map canvas and the host-visible rectangle. Mapbox's
 * camera must use the host values exactly, while ornaments can retain a
 * platform-specific visual adjustment.
 */
export function getAutoPlayViewportMetrics({
    layoutSize,
    ornamentSafeAreaLeftScale = 1,
    safeAreaInsets,
    windowInfo,
}) {
    const cameraInsets = getSafeAreaInsets(safeAreaInsets);
    const ornamentInsets = getSafeAreaInsets(
        safeAreaInsets,
        ornamentSafeAreaLeftScale,
    );
    // Auto Play's initial window dimensions and its live safe-area callbacks
    // share the same car-display coordinate space. Prefer the native canvas;
    // React layout remains a fallback while the surface is mounting.
    const width =
        getPositiveDimension(windowInfo?.width) ||
        getPositiveDimension(layoutSize?.width);
    const height =
        getPositiveDimension(windowInfo?.height) ||
        getPositiveDimension(layoutSize?.height);
    const visibleLeft = Math.min(cameraInsets.left, width);
    const visibleTop = Math.min(cameraInsets.top, height);
    const visibleRight = Math.max(visibleLeft, width - cameraInsets.right);
    const visibleBottom = Math.max(visibleTop, height - cameraInsets.bottom);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    return {
        cameraPadding: {
            paddingBottom: cameraInsets.bottom,
            paddingLeft: cameraInsets.left,
            paddingRight: cameraInsets.right,
            paddingTop: cameraInsets.top,
        },
        center: {
            x: visibleLeft + visibleWidth / 2,
            y: visibleTop + visibleHeight / 2,
        },
        height,
        key: [
            width,
            height,
            cameraInsets.top,
            cameraInsets.right,
            cameraInsets.bottom,
            cameraInsets.left,
        ].join(':'),
        // Vertical car-host insets describe content which can fully cover the
        // map canvas (for example, the Android Auto launcher). Keep them raw
        // so Mapbox ornaments and React status overlays mount above that
        // content, just as the follow camera does. Only the horizontal inset
        // retains the Android-specific visual adjustment.
        safeAreaInsets: {
            bottom: ornamentInsets.bottom,
            left: getClampedOrnamentInset(ornamentInsets.left, width),
            right: ornamentInsets.right,
            top: ornamentInsets.top,
        },
        visibleHeight,
        visibleRect: {
            bottom: visibleBottom,
            left: visibleLeft,
            right: visibleRight,
            top: visibleTop,
        },
        visibleWidth,
        width,
    };
}

/**
 * Keeps the driving puck at the shared driving anchor within the host-visible
 * map, rather than relative to a full canvas obscured by host content.
 */
export function getAutoPlayFollowViewportAnchorY(
    viewportMetrics,
    visibleYRatio = AUTO_PLAY_DRIVING_CAMERA_FOLLOW_VISIBLE_Y_RATIO,
) {
    const height = getPositiveDimension(viewportMetrics?.height);
    const visibleTop = Number(viewportMetrics?.visibleRect?.top);
    const visibleBottom = Number(viewportMetrics?.visibleRect?.bottom);
    const resolvedVisibleYRatio = Number.isFinite(visibleYRatio)
        ? Math.min(1, Math.max(0, visibleYRatio))
        : AUTO_PLAY_DRIVING_CAMERA_FOLLOW_VISIBLE_Y_RATIO;

    if (
        !height ||
        !Number.isFinite(visibleTop) ||
        !Number.isFinite(visibleBottom) ||
        visibleBottom <= visibleTop
    ) {
        return undefined;
    }

    return visibleTop + (visibleBottom - visibleTop) * resolvedVisibleYRatio;
}
