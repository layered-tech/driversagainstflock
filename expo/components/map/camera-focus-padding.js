import { useMemo } from 'react';
import {
    DIRECTIONS_ROUTE_CAMERA_BOTTOM_GAP,
    DIRECTIONS_ROUTE_CAMERA_HORIZONTAL_PADDING,
    DIRECTIONS_ROUTE_CAMERA_TOP_GAP,
    DIRECTIONS_ROUTE_SHEET_INITIAL_COVERAGE_RATIO,
    MAP_CONTROL_BUTTON_SIZE,
    MAP_SEARCH_BAR_HEIGHT,
    MAP_SEARCH_TOP_OFFSET,
    SEARCH_RESULTS_CAMERA_BOTTOM_GAP,
    SEARCH_RESULTS_CAMERA_HORIZONTAL_PADDING,
    SEARCH_RESULTS_CAMERA_TOP_GAP,
    SEARCH_RESULTS_SHEET_EXPANDED_COVERAGE_RATIO,
} from './constants';
import {
    getResponsiveMapLayout,
    mapUsesSideSheetLayout,
} from './responsive-map-layout';
import { getResponsiveCameraPadding } from './camera-padding-geometry';

export {
    getBottomSheetCoverageRatio,
    roundCoverageRatio,
    getResponsiveCameraPadding,
} from './camera-padding-geometry';

export function useMapCameraPadding({
    activeDirectionsRouteSheetCoverageRatio,
    safeAreaInsets,
    windowHeight,
    windowWidth,
}) {
    const layout = getResponsiveMapLayout(windowWidth);
    const sideSheetLayoutIsActive = mapUsesSideSheetLayout(windowWidth);
    const searchBarTopPadding =
        safeAreaInsets.top +
        MAP_SEARCH_TOP_OFFSET +
        MAP_SEARCH_BAR_HEIGHT +
        SEARCH_RESULTS_CAMERA_TOP_GAP;
    const directionsRouteSheetCoverageRatio = Math.max(
        activeDirectionsRouteSheetCoverageRatio,
        DIRECTIONS_ROUTE_SHEET_INITIAL_COVERAGE_RATIO,
    );
    const directionsRouteTopPadding =
        safeAreaInsets.top +
        MAP_SEARCH_TOP_OFFSET +
        MAP_CONTROL_BUTTON_SIZE +
        DIRECTIONS_ROUTE_CAMERA_TOP_GAP;
    const cameraFocusPadding = useMemo(
        () =>
            getResponsiveCameraPadding({
                horizontalPadding: SEARCH_RESULTS_CAMERA_HORIZONTAL_PADDING,
                minBottomPadding: SEARCH_RESULTS_CAMERA_HORIZONTAL_PADDING,
                sideSheetLayoutIsActive,
                topPadding: searchBarTopPadding,
                windowHeight,
                windowWidth: layout.contentWidth,
                sidePaneWidth: layout.mapLeftInset,
            }),
        [
            searchBarTopPadding,
            sideSheetLayoutIsActive,
            windowHeight,
            windowWidth,
        ],
    );
    const directionsRouteCameraPadding = useMemo(
        () =>
            getResponsiveCameraPadding({
                horizontalPadding: DIRECTIONS_ROUTE_CAMERA_HORIZONTAL_PADDING,
                minBottomPadding:
                    windowHeight * directionsRouteSheetCoverageRatio +
                    DIRECTIONS_ROUTE_CAMERA_BOTTOM_GAP,
                sideSheetLayoutIsActive,
                topPadding: directionsRouteTopPadding,
                windowHeight,
                windowWidth: layout.contentWidth,
                sidePaneWidth: layout.mapLeftInset,
            }),
        [
            directionsRouteSheetCoverageRatio,
            directionsRouteTopPadding,
            sideSheetLayoutIsActive,
            windowHeight,
            windowWidth,
        ],
    );
    const searchResultsCameraPadding = useMemo(
        () =>
            getResponsiveCameraPadding({
                horizontalPadding: SEARCH_RESULTS_CAMERA_HORIZONTAL_PADDING,
                minBottomPadding:
                    windowHeight *
                        SEARCH_RESULTS_SHEET_EXPANDED_COVERAGE_RATIO +
                    SEARCH_RESULTS_CAMERA_BOTTOM_GAP,
                sideSheetLayoutIsActive,
                topPadding: searchBarTopPadding,
                windowHeight,
                windowWidth: layout.contentWidth,
                sidePaneWidth: layout.mapLeftInset,
            }),
        [
            searchBarTopPadding,
            sideSheetLayoutIsActive,
            windowHeight,
            windowWidth,
        ],
    );

    return {
        cameraFocusPadding,
        directionsRouteCameraPadding,
        searchResultsCameraPadding,
        sideSheetLayoutIsActive,
    };
}
