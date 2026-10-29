import {
    getDuoMapCenterPoint,
    getDuoPaneLayout,
} from '../map/duo-bottom-sheet-layout.js';
import { getTabletPaneLayout } from '../map/responsive-map-layout.js';

export function getContributeMapLayout({
    width,
    height,
    insets = {},
    duoDevice = false,
    tabletDevice = false,
}) {
    const pane = tabletDevice
        ? getTabletPaneLayout(width, insets)
        : duoDevice
          ? getDuoPaneLayout(width, insets)
          : null;
    const mapCenter = tabletDevice
        ? pane
            ? [
                  (pane.left + pane.width + 12 + width - (insets.right ?? 0)) /
                      2,
                  height / 2,
              ]
            : null
        : duoDevice
          ? getDuoMapCenterPoint(width, height, insets)
          : null;
    return { pane, mapCenter };
}
