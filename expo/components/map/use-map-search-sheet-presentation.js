import { useCallback, useEffect, useRef } from 'react';

export function useMapSearchSheetPresentation({
    selectedPlaceDetails,
    selectedPlaceIsLoading,
    selectedSearchResult,
}) {
    const placeSheetIsOpenRef = useRef(false);
    const placeSheetRef = useRef(null);
    const submittedSearchResultsSheetIsOpenRef = useRef(false);
    const submittedSearchResultsSheetRef = useRef(null);

    const presentPlaceSheet = useCallback(() => {
        placeSheetIsOpenRef.current = true;
        placeSheetRef.current?.present();
        requestAnimationFrame(() => {
            placeSheetRef.current?.snapToIndex(0);
        });
    }, []);

    const handlePlaceSheetDismiss = useCallback(() => {
        placeSheetIsOpenRef.current = false;
    }, []);

    useEffect(() => {
        if (!selectedSearchResult) {
            return undefined;
        }

        const frame = requestAnimationFrame(presentPlaceSheet);
        const retry = setTimeout(presentPlaceSheet, 300);

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(retry);
        };
    }, [
        presentPlaceSheet,
        selectedPlaceDetails,
        selectedPlaceIsLoading,
        selectedSearchResult,
    ]);

    const presentSubmittedSearchResultsSheet = useCallback(() => {
        submittedSearchResultsSheetIsOpenRef.current = true;
        submittedSearchResultsSheetRef.current?.present();
        requestAnimationFrame(() => {
            submittedSearchResultsSheetRef.current?.snapToIndex(0);
        });
    }, []);

    const handleSubmittedSearchResultsSheetDismiss = useCallback(() => {
        submittedSearchResultsSheetIsOpenRef.current = false;
    }, []);

    return {
        handlePlaceSheetDismiss,
        handleSubmittedSearchResultsSheetDismiss,
        placeSheetIsOpenRef,
        placeSheetRef,
        presentPlaceSheet,
        presentSubmittedSearchResultsSheet,
        submittedSearchResultsSheetIsOpenRef,
        submittedSearchResultsSheetRef,
    };
}
