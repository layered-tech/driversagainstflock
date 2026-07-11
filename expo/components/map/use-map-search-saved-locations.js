import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    addRecentLocation,
    loadSearchSavedLocations,
    savedLocationsMatch,
    toggleFavoriteLocation,
} from './saved-locations';

export function useMapSearchSavedLocations({ isMountedRef }) {
    const [favoriteLocations, setFavoriteLocations] = useState([]);
    const [recentLocations, setRecentLocations] = useState([]);

    useEffect(() => {
        let isActive = true;

        loadSearchSavedLocations()
            .then((savedLocations) => {
                if (!isActive || !isMountedRef.current) {
                    return;
                }

                setFavoriteLocations(savedLocations.favoriteLocations);
                setRecentLocations(savedLocations.recentLocations);
            })
            .catch(() => {});

        return () => {
            isActive = false;
        };
    }, [isMountedRef]);

    const applyFavoriteLocations = useCallback(
        (updatedLocations) => {
            if (isMountedRef.current) {
                setFavoriteLocations(updatedLocations);
            }
        },
        [isMountedRef],
    );

    const recordRecentLocation = useCallback(
        (location) => {
            if (!location) {
                return;
            }

            addRecentLocation(location)
                .then((updatedLocations) => {
                    if (isMountedRef.current) {
                        setRecentLocations(updatedLocations);
                    }
                })
                .catch(() => {});
        },
        [isMountedRef],
    );

    const visibleRecentLocations = useMemo(
        () =>
            recentLocations.filter(
                (recentLocation) =>
                    !favoriteLocations.some((favoriteLocation) =>
                        savedLocationsMatch(favoriteLocation, recentLocation),
                    ),
            ),
        [favoriteLocations, recentLocations],
    );

    const toggleSavedLocationFavorite = useCallback(
        (savedLocation) => {
            if (!savedLocation) {
                return;
            }

            toggleFavoriteLocation(savedLocation)
                .then((updatedState) => {
                    applyFavoriteLocations(updatedState.favoriteLocations);
                })
                .catch(() => {});
        },
        [applyFavoriteLocations],
    );

    return {
        applyFavoriteLocations,
        favoriteLocations,
        recentLocations: visibleRecentLocations,
        recordRecentLocation,
        toggleSavedLocationFavorite,
    };
}
