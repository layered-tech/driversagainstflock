import { useEffect, useRef, useState } from 'react';
import { createPlaceSearchSessionToken } from '../../lib/place-search-session';
import {
    getPlaceSearchLocationBias,
    getPlaceSearchLocationBiasKey,
    getPlaceSearchOrigin,
    searchPlaces,
} from './api';
import { PLACE_SEARCH_MIN_QUERY_LENGTH } from './constants';

export const PLACE_AUTOCOMPLETE_DEBOUNCE_MS = 250;

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
    const searchSessionTokenRef = useRef(null);
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
            searchSessionTokenRef.current = null;

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

        if (!searchSessionTokenRef.current) {
            searchSessionTokenRef.current = createPlaceSearchSessionToken();
        }

        const abortController = new AbortController();

        searchAbortControllerRef.current = abortController;

        const debounceTimeout = setTimeout(() => {
            searchPlaces({
                input,
                locationBias,
                origin,
                sessionToken: searchSessionTokenRef.current,
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
        }, PLACE_AUTOCOMPLETE_DEBOUNCE_MS);

        return () => {
            clearTimeout(debounceTimeout);

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
