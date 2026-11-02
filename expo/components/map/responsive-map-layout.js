export const MAP_SIDE_SHEET_BREAKPOINT = 768;
export const MAP_SIDE_SHEET_MAX_WIDTH = 640;

export function mapUsesSideSheetLayout(windowWidth) {
    return (
        Number.isFinite(windowWidth) && windowWidth >= MAP_SIDE_SHEET_BREAKPOINT
    );
}

export function getTabletPaneLayout(width, insets = {}) {
    if (!mapUsesSideSheetLayout(width)) return null;
    const contentWidth = width - (insets.left ?? 0) - (insets.right ?? 0);
    const paneWidth = Math.min(406, Math.floor(contentWidth / 2) - 24);
    const left = (insets.left ?? 0) + 12;
    return { left, right: width - left - paneWidth, width: paneWidth };
}
