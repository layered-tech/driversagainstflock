import { getDuoPaneLayout } from './duo-bottom-sheet-layout.js';
import { getTabletPaneLayout } from './responsive-map-layout.js';

export function getDuoTrailCameraPadding(
    insets,
    headerHeight = 76,
    footerHeight = 110,
    width = 0,
    tabletDevice = false,
) {
    const pane = tabletDevice && getTabletPaneLayout(width, insets);
    if (pane)
        return [
            insets.top + 24,
            insets.right + 64,
            insets.bottom + 24,
            pane.left + pane.width + 64,
        ];
    return [
        insets.top + headerHeight + 24,
        insets.right + 24,
        insets.bottom + footerHeight + 56,
        insets.left + 24,
    ];
}

export function getDuoMapSheetLayout(
    height,
    insets,
    width = 0,
    tabletDevice = false,
) {
    const pane = tabletDevice
        ? getTabletPaneLayout(width, insets)
        : getDuoPaneLayout(width, insets);
    if (pane)
        return {
            sheetHeight:
                height -
                insets.top -
                (tabletDevice ? Math.max(insets.bottom, 14) + 14 : 28),
            cameraPadding: [
                insets.top + 24,
                insets.right + 24,
                24,
                pane.left + pane.width + 24,
            ],
        };
    const sheetHeight = Math.min(
        height * 0.52,
        Math.max(120, height - insets.top - 150),
    );
    return {
        sheetHeight,
        cameraPadding: [
            insets.top + 32,
            insets.right + 24,
            sheetHeight + 24,
            insets.left + 24,
        ],
    };
}
