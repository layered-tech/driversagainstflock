import { useCallback, useEffect, useRef } from 'react';

export function useMapSearchSheetPresentation({ selectedSearchResult }) {
    const placeSheetIsOpenRef = useRef(false);
    const placeSheetRef = useRef(null);
    const placeSheetPresentationFrameRef = useRef(null);
    const placeSheetPresentationRetryRef = useRef(null);
    const placeSheetSnapFrameRef = useRef(null);
    const submittedSearchResultsSheetIsOpenRef = useRef(false);
    const submittedSearchResultsSheetRef = useRef(null);
    const submittedSearchResultsSheetSnapFrameRef = useRef(null);

    const presentPlaceSheet = useCallback(() => {
        const placeSheet = placeSheetRef.current;

        if (!placeSheet) {
            return false;
        }

        placeSheetIsOpenRef.current = true;
        placeSheet.present();

        if (placeSheetSnapFrameRef.current !== null) {
            cancelAnimationFrame(placeSheetSnapFrameRef.current);
        }

        placeSheetSnapFrameRef.current = requestAnimationFrame(() => {
            placeSheetSnapFrameRef.current = null;

            if (placeSheetIsOpenRef.current) {
                placeSheetRef.current?.snapToIndex(0);
            }
        });

        return true;
    }, []);

    const clearScheduledPlaceSheetPresentation = useCallback(() => {
        if (placeSheetPresentationFrameRef.current !== null) {
            cancelAnimationFrame(placeSheetPresentationFrameRef.current);
            placeSheetPresentationFrameRef.current = null;
        }

        if (placeSheetPresentationRetryRef.current !== null) {
            clearTimeout(placeSheetPresentationRetryRef.current);
            placeSheetPresentationRetryRef.current = null;
        }

        if (placeSheetSnapFrameRef.current !== null) {
            cancelAnimationFrame(placeSheetSnapFrameRef.current);
            placeSheetSnapFrameRef.current = null;
        }
    }, []);

    const handlePlaceSheetDismiss = useCallback(() => {
        clearScheduledPlaceSheetPresentation();
        placeSheetIsOpenRef.current = false;
    }, [clearScheduledPlaceSheetPresentation]);

    const schedulePlaceSheetPresentation = useCallback(() => {
        clearScheduledPlaceSheetPresentation();
        placeSheetPresentationFrameRef.current = requestAnimationFrame(() => {
            placeSheetPresentationFrameRef.current = null;

            if (
                presentPlaceSheet() &&
                placeSheetPresentationRetryRef.current !== null
            ) {
                clearTimeout(placeSheetPresentationRetryRef.current);
                placeSheetPresentationRetryRef.current = null;
            }
        });
        placeSheetPresentationRetryRef.current = setTimeout(() => {
            placeSheetPresentationRetryRef.current = null;
            presentPlaceSheet();
        }, 300);
    }, [clearScheduledPlaceSheetPresentation, presentPlaceSheet]);

    useEffect(() => {
        if (!selectedSearchResult) {
            return undefined;
        }

        schedulePlaceSheetPresentation();

        return clearScheduledPlaceSheetPresentation;
    }, [
        clearScheduledPlaceSheetPresentation,
        schedulePlaceSheetPresentation,
        selectedSearchResult,
    ]);

    const presentSubmittedSearchResultsSheet = useCallback(() => {
        submittedSearchResultsSheetIsOpenRef.current = true;
        submittedSearchResultsSheetRef.current?.present();

        if (submittedSearchResultsSheetSnapFrameRef.current !== null) {
            cancelAnimationFrame(
                submittedSearchResultsSheetSnapFrameRef.current,
            );
        }

        submittedSearchResultsSheetSnapFrameRef.current = requestAnimationFrame(
            () => {
                submittedSearchResultsSheetSnapFrameRef.current = null;

                if (submittedSearchResultsSheetIsOpenRef.current) {
                    submittedSearchResultsSheetRef.current?.snapToIndex(0);
                }
            },
        );
    }, []);

    const handleSubmittedSearchResultsSheetDismiss = useCallback(() => {
        submittedSearchResultsSheetIsOpenRef.current = false;

        if (submittedSearchResultsSheetSnapFrameRef.current !== null) {
            cancelAnimationFrame(
                submittedSearchResultsSheetSnapFrameRef.current,
            );
            submittedSearchResultsSheetSnapFrameRef.current = null;
        }
    }, []);

    return {
        handlePlaceSheetDismiss,
        handleSubmittedSearchResultsSheetDismiss,
        placeSheetIsOpenRef,
        placeSheetRef,
        presentPlaceSheet,
        schedulePlaceSheetPresentation,
        presentSubmittedSearchResultsSheet,
        submittedSearchResultsSheetIsOpenRef,
        submittedSearchResultsSheetRef,
    };
}
