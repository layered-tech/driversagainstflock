import { getTabletPaneLayout } from './responsive-map-layout.js';

export function getDuoPaneLayout(width, insets = {}) {
    if (!(width >= 768)) return null;
    const contentWidth = width - (insets.left ?? 0) - (insets.right ?? 0);
    const paneWidth = Math.floor(contentWidth / 2) - 24;
    const left = (insets.left ?? 0) + 12;
    return { left, right: width - left - paneWidth, width: paneWidth };
}

export function getDuoContentPaneHeight(size, availableHeight) {
    const parts = [size.header, size.content, size.footer];
    return parts.every(Number.isFinite)
        ? Math.min(
              availableHeight,
              Math.ceil(parts.reduce((sum, value) => sum + value, 0)) + 2,
          )
        : null;
}

export function getDuoMapCenterPoint(width, height, insets) {
    const pane = getDuoPaneLayout(width, insets);
    return pane
        ? [
              (pane.left + pane.width + 12 + width - (insets.right ?? 0)) / 2,
              height / 2,
          ]
        : null;
}

export function getDuoBottomSheetLayout({
    railEdge,
    duoDevice = Boolean(railEdge),
    tabletDevice = false,
    tabletPresentation = 'pane',
    width = 0,
    insets,
    height,
    maxDynamicContentSize,
    fullScreen = false,
}) {
    if (!duoDevice && !tabletDevice) return {};

    const tabletConfirmation =
        tabletDevice && tabletPresentation === 'confirmation' && width >= 768;
    if ((fullScreen && width >= 768) || tabletConfirmation) {
        const availableWidth = width - (insets.left ?? 0) - (insets.right ?? 0);
        const cardWidth = tabletConfirmation ? 420 : 480;
        const margin = Math.max(24, (availableWidth - cardWidth) / 2);
        const availableHeight =
            height - insets.top - Math.max(insets.bottom, 24) - 24;
        return {
            style: {
                marginLeft: (insets.left ?? 0) + margin,
                marginRight: (insets.right ?? 0) + margin,
            },
            detached: true,
            bottomInset: 12,
            enableDynamicSizing: true,
            snapPoints: undefined,
            maxDynamicContentSize: tabletConfirmation
                ? Math.min(
                      maxDynamicContentSize ?? availableHeight,
                      availableHeight,
                  )
                : availableHeight,
            enableContentPanningGesture: false,
            enableHandlePanningGesture: false,
        };
    }

    const pane =
        !fullScreen &&
        (tabletDevice
            ? getTabletPaneLayout(width, insets)
            : getDuoPaneLayout(width, insets));
    const maxHeight = pane
        ? height - insets.top - 14 - Math.max(insets.bottom ?? 0, 14)
        : Math.round(height * 0.66);
    return {
        style: {
            marginLeft: pane ? pane.left : insets.left,
            marginRight: pane ? pane.right : insets.right,
        },
        ...(pane
            ? {
                  detached: true,
                  bottomInset: 12,
                  enableContentPanningGesture: false,
                  enableHandlePanningGesture: false,
              }
            : { bottomInset: 0 }),
        ...(fullScreen
            ? {}
            : {
                  enableDynamicSizing: true,
                  snapPoints: undefined,
                  maxDynamicContentSize: pane
                      ? maxHeight
                      : Math.min(maxDynamicContentSize ?? maxHeight, maxHeight),
              }),
    };
}
