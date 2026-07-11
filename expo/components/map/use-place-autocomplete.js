import { useEffect, useRef, useState } from 'react';
import {
    getPlaceSearchLocationBias,
    getPlaceSearchLocationBiasKey,
    getPlaceSearchOrigin,
    searchPlaces,
} from './api';
import { PLACE_SEARCH_MIN_QUERY_LENGTH } from './constants';

export function usePlaceAutocomplete({
    isMountedRef,
    searchIsFocused,
    searchValue,
    userLocation,
}) {
    const searchAbortControllerRef = useRef(null);
    const searchLocationRef = useRef({
        key: '',
        locationBias: null,
        origin: null,
    });
    const searchRequestIdRef = useRef(0);
    const [searchResults, setSearchResults] = useState([]);
    const [searchIsLoading, setSearchIsLoading] = useState(false);
    const [searchError, setSearchError] = useState('');
    const locationBiasKey = getPlaceSearchLocationBiasKey(userLocation);

    if (searchLocationRef.current.key !== locationBiasKey) {
        searchLocationRef.current = {
            key: locationBiasKey,
            locationBias: getPlaceSearchLocationBias(userLocation),
            origin: getPlaceSearchOrigin(userLocation),
        };
    }

    const { locationBias, origin } = searchLocationRef.current;

    useEffect(() => {
        const input = searchValue.trim();

        if (!searchIsFocused || input.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
            searchRequestIdRef.current += 1;

            if (searchAbortControllerRef.current) {
                searchAbortControllerRef.current.abort();
                searchAbortControllerRef.current = null;
            }

            setSearchResults([]);
            setSearchIsLoading(false);
            setSearchError('');

            return undefined;
        }

        const requestId = searchRequestIdRef.current + 1;

        searchRequestIdRef.current = requestId;

        if (searchAbortControllerRef.current) {
            searchAbortControllerRef.current.abort();
            searchAbortControllerRef.current = null;
        }

        setSearchError('');
        setSearchIsLoading(true);

        const abortController = new AbortController();

        searchAbortControllerRef.current = abortController;

        searchPlaces({
            input,
            locationBias,
            origin,
            signal: abortController.signal,
        })
            .then((results) => {
                if (
                    isMountedRef.current &&
                    searchRequestIdRef.current === requestId
                ) {
                    setSearchResults(results);
                }
            })
            .catch((error) => {
                if (error?.name === 'AbortError') {
                    return;
                }

                if (
                    isMountedRef.current &&
                    searchRequestIdRef.current === requestId
                ) {
                    setSearchError(
                        error?.message || 'Places could not be loaded.',
                    );
                }
            })
            .finally(() => {
                if (searchAbortControllerRef.current === abortController) {
                    searchAbortControllerRef.current = null;
                }

                if (
                    isMountedRef.current &&
                    searchRequestIdRef.current === requestId
                ) {
                    setSearchIsLoading(false);
                }
            });

        return () => {
            if (searchAbortControllerRef.current === abortController) {
                searchAbortControllerRef.current.abort();
                searchAbortControllerRef.current = null;
            }
        };
    }, [isMountedRef, locationBias, origin, searchIsFocused, searchValue]);

    useEffect(
        () => () => {
            if (searchAbortControllerRef.current) {
                searchAbortControllerRef.current.abort();
                searchAbortControllerRef.current = null;
            }
        },
        [],
    );

    return {
        searchError,
        searchIsLoading,
        searchResults,
        setSearchError,
        setSearchIsLoading,
        setSearchResults,
    };
}
