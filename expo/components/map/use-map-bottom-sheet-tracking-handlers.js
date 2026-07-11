import { useCallback, useMemo, useState } from 'react';
import {
    getBottomSheetCoverageRatio,
    roundCoverageRatio,
} from './camera-focus-padding';

function noop() {}

export function useMapBottomSheetTrackingHandlers({
    bottomSheetAnimatedPosition,
    directionsRouteSheetProgrammaticDismissRef,
    directionsRouteUserCloseRef,
    markerDetailsIsOpenRef,
    pendingMarkerSelectionRef,
    setSelectedMarker,
    windowHeight,
}) {
    const [
        activeDirectionsRouteSheetCoverageRatio,
        setActiveDirectionsRouteSheetCoverageRatio,
    ] = useState(0);
    const resetTrackedSheetPosition = useCallback(() => {
        bottomSheetAnimatedPosition.value = windowHeight;
    }, [bottomSheetAnimatedPosition, windowHeight]);
    const handleDirectionsRouteSheetPositionChange = useCallback(
        (index, position) => {
            const nextRatio = roundCoverageRatio(
                getBottomSheetCoverageRatio(index, position, windowHeight),
            );

            setActiveDirectionsRouteSheetCoverageRatio((currentRatio) => {
                if (currentRatio === nextRatio) {
                    return currentRatio;
                }

                return nextRatio;
            });
        },
        [windowHeight],
    );
    const directionsRouteSheetTrackingHandlers = useMemo(
        () => ({
            onAnimate: (_fromIndex, toIndex, _fromPosition, toPosition) => {
                // Clear any stale programmatic flag whenever the sheet opens, so a
                // defensive dismiss-while-closed can't be mistaken for the next drag.
                if (toIndex >= 0) {
                    directionsRouteSheetProgrammaticDismissRef.current = false;
                }
                handleDirectionsRouteSheetPositionChange(toIndex, toPosition);
            },
            onChange: (index, position) => {
                handleDirectionsRouteSheetPositionChange(index, position);
            },
            onDismiss: () => {
                resetTrackedSheetPosition();
                setActiveDirectionsRouteSheetCoverageRatio(0);
                // A user drag-to-close leaves the flag unset; mirror the back arrow and
                // exit the route-choice flow. Programmatic dismisses set the flag and
                // skip this so in-flight transitions keep their route state.
                const wasProgrammaticDismiss =
                    directionsRouteSheetProgrammaticDismissRef.current;
                if (!wasProgrammaticDismiss) {
                    directionsRouteUserCloseRef.current?.();
                }
                directionsRouteSheetProgrammaticDismissRef.current = false;
            },
        }),
        [
            directionsRouteSheetProgrammaticDismissRef,
            directionsRouteUserCloseRef,
            handleDirectionsRouteSheetPositionChange,
            resetTrackedSheetPosition,
        ],
    );
    const permissionSheetTrackingHandlers = useMemo(
        () => ({
            onAnimate: noop,
            onChange: noop,
            onDismiss: resetTrackedSheetPosition,
        }),
        [resetTrackedSheetPosition],
    );
    const markerDetailsSheetTrackingHandlers = useMemo(
        () => ({
            onAnimate: noop,
            onChange: noop,
            onDismiss: () => {
                resetTrackedSheetPosition();
                markerDetailsIsOpenRef.current = false;
                const pendingMarkerSelection =
                    pendingMarkerSelectionRef.current;
                pendingMarkerSelectionRef.current = null;

                if (pendingMarkerSelection) {
                    setSelectedMarker(pendingMarkerSelection);
                    return;
                }

                setSelectedMarker(null);
            },
        }),
        [
            markerDetailsIsOpenRef,
            pendingMarkerSelectionRef,
            resetTrackedSheetPosition,
            setSelectedMarker,
        ],
    );
    return {
        activeDirectionsRouteSheetCoverageRatio,
        directionsRouteSheetTrackingHandlers,
        markerDetailsSheetTrackingHandlers,
        permissionSheetTrackingHandlers,
    };
}

export function useMapSearchBottomSheetTrackingHandlers({
    bottomSheetAnimatedPosition,
    handleClearSelectedSearchResult,
    handlePlaceSheetDismiss,
    handleSubmittedSearchResultsSheetDismiss,
    placeSheetProgrammaticDismissRef,
    windowHeight,
}) {
    const resetTrackedSheetPosition = useCallback(() => {
        bottomSheetAnimatedPosition.value = windowHeight;
    }, [bottomSheetAnimatedPosition, windowHeight]);
    const submittedSearchResultsSheetTrackingHandlers = useMemo(
        () => ({
            onAnimate: noop,
            onChange: noop,
            onDismiss: () => {
                resetTrackedSheetPosition();
                handleSubmittedSearchResultsSheetDismiss();
            },
        }),
        [handleSubmittedSearchResultsSheetDismiss, resetTrackedSheetPosition],
    );
    const placeSheetTrackingHandlers = useMemo(
        () => ({
            onAnimate: (_fromIndex, toIndex) => {
                // Clear any stale programmatic flag whenever the sheet opens, so a
                // defensive dismiss-while-closed can't be mistaken for the next drag.
                if (toIndex >= 0) {
                    placeSheetProgrammaticDismissRef.current = false;
                }
            },
            onChange: noop,
            onDismiss: () => {
                resetTrackedSheetPosition();
                const wasProgrammaticDismiss =
                    placeSheetProgrammaticDismissRef.current;
                handlePlaceSheetDismiss();
                // A user drag-to-close leaves the flag unset; mirror the ✕ button and
                // clear the selected place. Programmatic dismisses set the flag and skip
                // this so flow transitions (e.g. opening directions) keep the selection.
                if (!wasProgrammaticDismiss) {
                    handleClearSelectedSearchResult();
                }
                placeSheetProgrammaticDismissRef.current = false;
            },
        }),
        [
            handleClearSelectedSearchResult,
            handlePlaceSheetDismiss,
            placeSheetProgrammaticDismissRef,
            resetTrackedSheetPosition,
        ],
    );

    return {
        placeSheetTrackingHandlers,
        submittedSearchResultsSheetTrackingHandlers,
    };
}
