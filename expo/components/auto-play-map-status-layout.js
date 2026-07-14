import { getSpeedLimitBadgeLayout } from './map/speed-limit-layout.js';

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
