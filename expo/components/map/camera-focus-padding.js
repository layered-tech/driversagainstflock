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
import { mapUsesSideSheetLayout } from './responsive-map-layout';

const CAMERA_FOCUS_SIDE_VISIBLE_WIDTH_RATIO = 0.5;
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

function getSideFocusLeftPadding(windowWidth, horizontalPadding) {
    const rightPadding = getRoundedPositivePadding(horizontalPadding);
    const targetCenterX =
        windowWidth * (1 - CAMERA_FOCUS_SIDE_VISIBLE_WIDTH_RATIO / 2);
    const preferredLeftPadding = Math.round(
        targetCenterX * 2 - windowWidth + rightPadding,
    );
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
            getSideFocusLeftPadding(windowWidth, resolvedHorizontalPadding),
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

export function useMapCameraPadding({
    activeDirectionsRouteSheetCoverageRatio,
    safeAreaInsets,
    windowHeight,
    windowWidth,
}) {
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
                windowWidth,
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
                windowWidth,
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
                windowWidth,
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
