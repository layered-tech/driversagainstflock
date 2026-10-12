export const MAP_SIDE_SHEET_BREAKPOINT = 600;
export const TABLET_LAYOUT_BREAKPOINT = 1024;
export const TABLET_NAVIGATION_RAIL_WIDTH = 84;
export const MAP_SIDE_SHEET_MAX_WIDTH = 376;
export const MAP_PANE_GUTTER = 12;

export function mapUsesSideSheetLayout(windowWidth) {
    return (
        Number.isFinite(windowWidth) && windowWidth >= MAP_SIDE_SHEET_BREAKPOINT
    );
}

export function getResponsiveMapLayout(
    windowWidth,
    navigationIsActive = false,
) {
    const isTablet =
        Number.isFinite(windowWidth) && windowWidth >= TABLET_LAYOUT_BREAKPOINT;
    const railWidth =
        isTablet && !navigationIsActive ? TABLET_NAVIGATION_RAIL_WIDTH : 0;
    const contentWidth = Math.max(
        0,
        (Number.isFinite(windowWidth) ? windowWidth : 0) - railWidth,
    );
    const isWide = mapUsesSideSheetLayout(windowWidth);
    const paneWidth = isWide
        ? Math.min(
              MAP_SIDE_SHEET_MAX_WIDTH,
              contentWidth / 2 - MAP_PANE_GUTTER * 2,
          )
        : contentWidth;

    return {
        isWide,
        isTablet,
        railWidth,
        contentWidth,
        paneWidth,
        mapLeftInset: isWide ? paneWidth + MAP_PANE_GUTTER * 2 : 0,
    };
}
