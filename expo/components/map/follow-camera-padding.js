import { getCameraPadding } from '../map-location-mode-shared.js';

export const FOLLOW_CAMERA_MAX_TOP_PADDING_RATIO = 0.95;

function getNonNegativeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/**
 * Returns the screen-space location of a followed coordinate after Mapbox
 * applies the supplied camera padding.
 */
export function getFollowCameraAnchorY({ viewportHeight, viewportInsets }) {
    const cameraViewportPadding = getCameraPadding(viewportInsets);
    const resolvedViewportHeight = getNonNegativeNumber(viewportHeight);
    const viewportTopPadding = getNonNegativeNumber(
        cameraViewportPadding.paddingTop,
    );
    const viewportBottomPadding = getNonNegativeNumber(
        cameraViewportPadding.paddingBottom,
    );

    return (
        (resolvedViewportHeight + viewportTopPadding - viewportBottomPadding) /
        2
    );
}

/**
 * Derive Mapbox follow padding that places the location at an explicit Y
 * coordinate in the full map canvas. Without a measured layout anchor, the
 * location stays centered within the safe viewport.
 */
export function getFollowCameraPadding({
    followViewportAnchorY,
    maxTopPaddingRatio = FOLLOW_CAMERA_MAX_TOP_PADDING_RATIO,
    viewportHeight,
    viewportInsets,
}) {
    const cameraViewportPadding = getCameraPadding(viewportInsets);
    const viewportTopPadding = getNonNegativeNumber(
        cameraViewportPadding.paddingTop,
    );
    const viewportBottomPadding = getNonNegativeNumber(
        cameraViewportPadding.paddingBottom,
    );
    const resolvedViewportHeight = getNonNegativeNumber(viewportHeight);
    const maximumAnchorY = Math.max(
        viewportTopPadding,
        resolvedViewportHeight - viewportBottomPadding,
    );
    const requestedAnchorY = Number.isFinite(followViewportAnchorY)
        ? followViewportAnchorY
        : getFollowCameraAnchorY({
              viewportHeight: resolvedViewportHeight,
              viewportInsets: cameraViewportPadding,
          });
    const resolvedAnchorY = Math.min(
        Math.max(requestedAnchorY, viewportTopPadding),
        maximumAnchorY,
    );
    const requestedTopPadding = Math.round(
        resolvedAnchorY * 2 - resolvedViewportHeight + viewportBottomPadding,
    );
    const maximumTopPadding = Math.min(
        Math.round(resolvedViewportHeight * maxTopPaddingRatio),
        Math.max(0, resolvedViewportHeight - viewportBottomPadding),
    );

    return {
        ...cameraViewportPadding,
        paddingBottom: viewportBottomPadding,
        // Mapbox centers the followed coordinate inside the padded viewport.
        paddingTop: Math.max(
            viewportTopPadding,
            0,
            Math.min(requestedTopPadding, maximumTopPadding),
        ),
    };
}
