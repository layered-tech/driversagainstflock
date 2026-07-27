import { getSpeedLimitBadgeLayout } from './map/speed-limit-layout.js';

const AUTO_PLAY_CURRENT_ROAD_PILL_MAX_WIDTH = 320;
const AUTO_PLAY_CURRENT_ROAD_PILL_SPEED_LIMIT_GAP = 16;

function getFiniteViewportValue(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

export function getAutoPlayTopRightStatusOverlayLayout({
    mapControlLayoutInsets,
}) {
    return {
        positionStyle: {
            right: mapControlLayoutInsets.right,
            top: mapControlLayoutInsets.top,
        },
    };
}

export function getAutoPlaySpeedLimitOverlayLayout({
    mapControlLayoutInsets,
    size,
}) {
    const badgeLayout = getSpeedLimitBadgeLayout(size);

    return {
        alignmentFrameStyle: {
            height: Math.max(
                badgeLayout.containerHeight,
                badgeLayout.signOuterHeight,
            ),
            width: Math.max(
                badgeLayout.signOuterWidth,
                badgeLayout.containerWidth +
                    badgeLayout.currentSpeedCornerOverhang,
            ),
        },
        positionStyle: {
            bottom: mapControlLayoutInsets.bottom,
            right: mapControlLayoutInsets.right,
        },
    };
}

export function getAutoPlayCurrentRoadPillLayout({
    mapControlLayoutInsets,
    size,
    viewportMetrics,
}) {
    const viewportWidth = getFiniteViewportValue(viewportMetrics?.width);
    const visibleLeft = getFiniteViewportValue(
        viewportMetrics?.visibleRect?.left,
    );
    const visibleRight = getFiniteViewportValue(
        viewportMetrics?.visibleRect?.right,
    );

    if (
        viewportWidth === null ||
        viewportWidth <= 0 ||
        visibleLeft === null ||
        visibleRight === null ||
        visibleRight <= visibleLeft
    ) {
        return { maximumWidth: undefined };
    }

    const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
        mapControlLayoutInsets,
        size,
    });
    const roadPillCenterX = (visibleLeft + visibleRight) / 2;
    const speedLimitLeft =
        viewportWidth -
        speedLimitOverlayLayout.positionStyle.right -
        speedLimitOverlayLayout.alignmentFrameStyle.width;
    const maximumWidth = Math.max(
        0,
        Math.min(
            AUTO_PLAY_CURRENT_ROAD_PILL_MAX_WIDTH,
            (speedLimitLeft -
                AUTO_PLAY_CURRENT_ROAD_PILL_SPEED_LIMIT_GAP -
                roadPillCenterX) *
                2,
        ),
    );

    return { maximumWidth };
}
