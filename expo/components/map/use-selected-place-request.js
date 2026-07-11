import { useCallback, useEffect, useRef } from 'react';
import { getPlaceDetails } from './api';
import {
    getPlaceAddress,
    getPlaceDisplayName,
    getPlaceTypeLabel,
} from './place-formatters';
import {
    createSavedLocationFromPlace,
    updateFavoriteLocation,
} from './saved-locations';

export function useSelectedPlaceRequest({
    applyFavoriteLocations,
    isMountedRef,
    moveCameraToPlace,
    recordRecentLocation,
    setSelectedPlaceDetails,
    setSelectedPlaceError,
    setSelectedPlaceIsLoading,
}) {
    const placeAbortControllerRef = useRef(null);
    const placeRequestIdRef = useRef(0);

    const clearSelectedPlaceRequest = useCallback(() => {
        placeRequestIdRef.current += 1;

        if (placeAbortControllerRef.current) {
            placeAbortControllerRef.current.abort();
            placeAbortControllerRef.current = null;
        }
    }, []);

    const requestSelectedPlaceDetails = useCallback(
        (result) => {
            clearSelectedPlaceRequest();

            const requestId = placeRequestIdRef.current + 1;
            const abortController = new AbortController();

            placeRequestIdRef.current = requestId;
            placeAbortControllerRef.current = abortController;

            setSelectedPlaceDetails(null);
            setSelectedPlaceError('');
            setSelectedPlaceIsLoading(true);

            getPlaceDetails({
                placeId: result.placeId,
                signal: abortController.signal,
            })
                .then((place) => {
                    if (
                        isMountedRef.current &&
                        placeRequestIdRef.current === requestId
                    ) {
                        const savedLocation = createSavedLocationFromPlace({
                            address: getPlaceAddress(place, result),
                            name: getPlaceDisplayName(place, result),
                            place,
                            result,
                            typeLabel: getPlaceTypeLabel(place),
                        });

                        setSelectedPlaceDetails(place);
                        recordRecentLocation(savedLocation);
                        updateFavoriteLocation(savedLocation)
                            .then(applyFavoriteLocations)
                            .catch(() => {});
                        moveCameraToPlace(place);
                    }
                })
                .catch((error) => {
                    if (error?.name === 'AbortError') {
                        return;
                    }

                    if (
                        isMountedRef.current &&
                        placeRequestIdRef.current === requestId
                    ) {
                        setSelectedPlaceError(
                            error?.message ||
                                'Place location could not be loaded.',
                        );
                    }
                })
                .finally(() => {
                    if (placeAbortControllerRef.current === abortController) {
                        placeAbortControllerRef.current = null;
                    }

                    if (
                        isMountedRef.current &&
                        placeRequestIdRef.current === requestId
                    ) {
                        setSelectedPlaceIsLoading(false);
                    }
                });
        },
        [
            applyFavoriteLocations,
            clearSelectedPlaceRequest,
            isMountedRef,
            moveCameraToPlace,
            recordRecentLocation,
            setSelectedPlaceDetails,
            setSelectedPlaceError,
            setSelectedPlaceIsLoading,
        ],
    );

    useEffect(() => clearSelectedPlaceRequest, [clearSelectedPlaceRequest]);

    return {
        clearSelectedPlaceRequest,
        requestSelectedPlaceDetails,
    };
}
