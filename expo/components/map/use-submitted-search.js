import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { logMapSearchResultsLoaded, logMapSearchSubmitted } from './analytics';
import { searchTextPlaces } from './api';
import { PLACE_RESULT_CAMERA_ANIMATION_DURATION_MS } from './constants';
import { getSubmittedSearchResultsBounds } from './submitted-search-results-bounds';

export function useSubmittedSearch({
    clearSelectedPlaceRequest,
    dismissPlaceSheet,
    fitCameraToBounds,
    isMountedRef,
    searchResultsCameraPadding,
    searchSource = 'map',
    setSearchIsFocused,
    setSearchValue,
    setSelectedPlaceDetails,
    setSelectedPlaceError,
    setSelectedPlaceIsLoading,
    setSelectedSearchResult,
    userLocation,
}) {
    const submittedSearchAbortControllerRef = useRef(null);
    const submittedSearchRequestIdRef = useRef(0);
    const [submittedSearchError, setSubmittedSearchError] = useState('');
    const [submittedSearchIsLoading, setSubmittedSearchIsLoading] =
        useState(false);
    const [submittedSearchQuery, setSubmittedSearchQuery] = useState('');
    const [submittedSearchResults, setSubmittedSearchResults] = useState([]);

    const clearSubmittedSearchRequest = useCallback(() => {
        submittedSearchRequestIdRef.current += 1;

        if (submittedSearchAbortControllerRef.current) {
            submittedSearchAbortControllerRef.current.abort();
            submittedSearchAbortControllerRef.current = null;
        }
    }, []);

    const resetSubmittedSearch = useCallback(() => {
        clearSubmittedSearchRequest();
        setSubmittedSearchError('');
        setSubmittedSearchIsLoading(false);
        setSubmittedSearchQuery('');
        setSubmittedSearchResults([]);
    }, [clearSubmittedSearchRequest]);

    const submitSubmittedSearchQuery = useCallback(
        (value) => {
            const query = typeof value === 'string' ? value.trim() : '';

            if (!query) {
                return false;
            }

            clearSelectedPlaceRequest();
            clearSubmittedSearchRequest();

            const requestId = submittedSearchRequestIdRef.current + 1;
            const abortController = new AbortController();

            submittedSearchRequestIdRef.current = requestId;
            submittedSearchAbortControllerRef.current = abortController;

            setSearchValue(query);
            setSearchIsFocused(true);
            setSelectedSearchResult(null);
            setSelectedPlaceDetails(null);
            setSelectedPlaceError('');
            setSelectedPlaceIsLoading(false);
            setSubmittedSearchError('');
            setSubmittedSearchIsLoading(true);
            setSubmittedSearchQuery(query);
            dismissPlaceSheet();
            Keyboard.dismiss();
            logMapSearchSubmitted({ query, source: searchSource });

            searchTextPlaces({
                location: userLocation,
                signal: abortController.signal,
                textQuery: query,
            })
                .then((results) => {
                    if (
                        !isMountedRef.current ||
                        submittedSearchRequestIdRef.current !== requestId
                    ) {
                        return;
                    }

                    setSubmittedSearchResults(results);
                    logMapSearchResultsLoaded({
                        query,
                        resultCount: results.length,
                        source: searchSource,
                    });

                    const bounds = getSubmittedSearchResultsBounds(results);

                    if (bounds) {
                        fitCameraToBounds?.(bounds, {
                            duration: PLACE_RESULT_CAMERA_ANIMATION_DURATION_MS,
                            padding: searchResultsCameraPadding,
                        });
                    }
                })
                .catch((error) => {
                    if (error?.name === 'AbortError') {
                        return;
                    }

                    if (
                        isMountedRef.current &&
                        submittedSearchRequestIdRef.current === requestId
                    ) {
                        setSubmittedSearchError(
                            error?.message || 'Places could not be loaded.',
                        );
                        setSubmittedSearchResults([]);
                    }
                })
                .finally(() => {
                    if (
                        submittedSearchAbortControllerRef.current ===
                        abortController
                    ) {
                        submittedSearchAbortControllerRef.current = null;
                    }

                    if (
                        isMountedRef.current &&
                        submittedSearchRequestIdRef.current === requestId
                    ) {
                        setSubmittedSearchIsLoading(false);
                    }
                });

            return true;
        },
        [
            clearSelectedPlaceRequest,
            clearSubmittedSearchRequest,
            dismissPlaceSheet,
            fitCameraToBounds,
            isMountedRef,
            searchResultsCameraPadding,
            searchSource,
            setSearchIsFocused,
            setSearchValue,
            setSelectedPlaceDetails,
            setSelectedPlaceError,
            setSelectedPlaceIsLoading,
            setSelectedSearchResult,
            userLocation,
        ],
    );

    useEffect(() => clearSubmittedSearchRequest, [clearSubmittedSearchRequest]);

    return {
        resetSubmittedSearch,
        submitSubmittedSearchQuery,
        submittedSearchError,
        submittedSearchIsLoading,
        submittedSearchQuery,
        submittedSearchResults,
    };
}
