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
    if (!Number.isFinite(followViewportAnchorY)) {
        return {
            ...cameraViewportPadding,
            paddingTop: viewportTopPadding,
            paddingBottom: viewportBottomPadding,
        };
    }
    const resolvedViewportHeight = getNonNegativeNumber(viewportHeight);
    const maximumAnchorY = Math.max(
        viewportTopPadding,
        resolvedViewportHeight - viewportBottomPadding,
    );
    const resolvedAnchorY = Math.min(
        Math.max(followViewportAnchorY, viewportTopPadding),
        maximumAnchorY,
    );
    const requestedTopPadding = Math.round(
        resolvedAnchorY * 2 - resolvedViewportHeight + viewportBottomPadding,
    );
    const requestedBottomPadding =
        resolvedViewportHeight + viewportTopPadding - resolvedAnchorY * 2;
    const maximumTopPadding = Math.min(
        Math.round(resolvedViewportHeight * maxTopPaddingRatio),
        Math.max(0, resolvedViewportHeight - viewportBottomPadding),
    );

    return {
        ...cameraViewportPadding,
        paddingBottom: Math.max(viewportBottomPadding, requestedBottomPadding),
        // Mapbox centers the followed coordinate inside the padded viewport.
        paddingTop: Math.max(
            viewportTopPadding,
            0,
            Math.min(requestedTopPadding, maximumTopPadding),
        ),
    };
}
