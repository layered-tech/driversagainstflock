import { getResponsiveMapLayout } from './responsive-map-layout.js';

const CAMERA_FOCUS_TOP_VIEWPORT_RATIO = 0.4;
const CAMERA_FOCUS_MIN_VIEWPORT_HEIGHT = 120;
const CAMERA_FOCUS_MIN_VIEWPORT_WIDTH = 240;

function clampCoverageRatio(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(value, 1));
}

function getRoundedPositivePadding(value) {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function getSideFocusLeftPadding(
    windowWidth,
    horizontalPadding,
    sidePaneWidth,
) {
    const rightPadding = getRoundedPositivePadding(horizontalPadding);
    const preferredLeftPadding = sidePaneWidth + rightPadding;
    const maxLeftPadding = Math.max(
        rightPadding,
        windowWidth - rightPadding - CAMERA_FOCUS_MIN_VIEWPORT_WIDTH,
    );

    return Math.min(
        Math.max(preferredLeftPadding, rightPadding),
        maxLeftPadding,
    );
}

function getTopFocusBottomPadding({
    minBottomPadding,
    topPadding,
    windowHeight,
}) {
    const resolvedTopPadding = getRoundedPositivePadding(topPadding);
    const resolvedMinBottomPadding =
        getRoundedPositivePadding(minBottomPadding);
    const targetCenterY = windowHeight * CAMERA_FOCUS_TOP_VIEWPORT_RATIO;
    const preferredBottomPadding = Math.round(
        windowHeight + resolvedTopPadding - targetCenterY * 2,
    );
    const maxBottomPadding = Math.max(
        0,
        windowHeight - resolvedTopPadding - CAMERA_FOCUS_MIN_VIEWPORT_HEIGHT,
    );
    const lowerBound = Math.min(resolvedMinBottomPadding, maxBottomPadding);

    return Math.min(
        Math.max(preferredBottomPadding, lowerBound),
        maxBottomPadding,
    );
}

export function getBottomSheetCoverageRatio(index, position, windowHeight) {
    if (index < 0 || !Number.isFinite(position) || windowHeight <= 0) {
        return 0;
    }

    const sheetHeight = Math.min(
        Math.max(0, position),
        Math.max(0, windowHeight - position),
    );

    return clampCoverageRatio(sheetHeight / windowHeight);
}

export function roundCoverageRatio(value) {
    return Math.round(clampCoverageRatio(value) * 1000) / 1000;
}

export function getResponsiveCameraPadding({
    horizontalPadding,
    minBottomPadding,
    sideSheetLayoutIsActive,
    sidePaneWidth,
    topPadding,
    windowHeight,
    windowWidth,
}) {
    const resolvedTopPadding = getRoundedPositivePadding(topPadding);
    const resolvedHorizontalPadding =
        getRoundedPositivePadding(horizontalPadding);

    if (sideSheetLayoutIsActive) {
        return [
            resolvedTopPadding,
            resolvedHorizontalPadding,
            resolvedHorizontalPadding,
            getSideFocusLeftPadding(
                windowWidth,
                resolvedHorizontalPadding,
                sidePaneWidth ??
                    getResponsiveMapLayout(windowWidth).mapLeftInset,
            ),
        ];
    }

    return [
        resolvedTopPadding,
        resolvedHorizontalPadding,
        getTopFocusBottomPadding({
            minBottomPadding,
            topPadding: resolvedTopPadding,
            windowHeight,
        }),
        resolvedHorizontalPadding,
    ];
}
