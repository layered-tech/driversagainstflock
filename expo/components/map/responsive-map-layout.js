export const MAP_SIDE_SHEET_BREAKPOINT = 768;
export const MAP_SIDE_SHEET_MAX_WIDTH = 640;

export function mapUsesSideSheetLayout(windowWidth) {
  return (
    Number.isFinite(windowWidth) && windowWidth >= MAP_SIDE_SHEET_BREAKPOINT
  );
}
