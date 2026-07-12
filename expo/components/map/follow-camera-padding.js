import { getCameraPadding } from '../map-location-mode-shared.js';

function getNonNegativeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/**
 * Derive Mapbox follow padding that places the location at an explicit Y
 * coordinate in the full map canvas. The optional anchor lets car surfaces
 * follow the host-reported visible rectangle instead of an obscured canvas.
 */
export function getFollowCameraPadding({
    followViewportAnchorY,
    followViewportBottomOffset,
    followViewportYRatio,
    maxTopPaddingRatio,
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
    const resolvedBottomOffset = getNonNegativeNumber(
        followViewportBottomOffset,
    );
    const requestedAnchorY = Number.isFinite(followViewportAnchorY)
        ? followViewportAnchorY
        : resolvedViewportHeight * followViewportYRatio;
    const maximumAnchorY = Math.max(
        viewportTopPadding,
        resolvedViewportHeight - viewportBottomPadding - resolvedBottomOffset,
    );
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
