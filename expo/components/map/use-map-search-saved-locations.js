import { useCallback, useEffect, useMemo, useState } from 'react';
import { createEmptyPrimaryLocations } from './primary-locations';
import {
    addRecentLocation,
    loadSearchSavedLocations,
    savedLocationsMatch,
    savePrimaryLocation,
    toggleFavoriteLocation,
} from './saved-locations';

export function useMapSearchSavedLocations({ isMountedRef }) {
    const [favoriteLocations, setFavoriteLocations] = useState([]);
    const [primaryLocations, setPrimaryLocations] = useState(
        createEmptyPrimaryLocations,
    );
    const [recentLocations, setRecentLocations] = useState([]);
    const [savedLocationsAreLoaded, setSavedLocationsAreLoaded] =
        useState(false);

    useEffect(() => {
        let isActive = true;

        loadSearchSavedLocations()
            .then((savedLocations) => {
                if (!isActive || !isMountedRef.current) {
                    return;
                }

                setFavoriteLocations(savedLocations.favoriteLocations);
                setPrimaryLocations(savedLocations.primaryLocations);
                setRecentLocations(savedLocations.recentLocations);
            })
            .catch(() => {})
            .finally(() => {
                if (isActive && isMountedRef.current) {
                    setSavedLocationsAreLoaded(true);
                }
            });

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
                    ) &&
                    !Object.values(primaryLocations).some((primaryLocation) =>
                        savedLocationsMatch(primaryLocation, recentLocation),
                    ),
            ),
        [favoriteLocations, primaryLocations, recentLocations],
    );
    const visibleFavoriteLocations = useMemo(
        () =>
            favoriteLocations.filter(
                (favoriteLocation) =>
                    !Object.values(primaryLocations).some((primaryLocation) =>
                        savedLocationsMatch(primaryLocation, favoriteLocation),
                    ),
            ),
        [favoriteLocations, primaryLocations],
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

    const setPrimaryLocation = useCallback(
        async (type, location) => {
            const updatedLocations = await savePrimaryLocation(type, location);

            if (isMountedRef.current) {
                setPrimaryLocations(updatedLocations);
            }

            return updatedLocations;
        },
        [isMountedRef],
    );

    return {
        applyFavoriteLocations,
        favoriteLocations,
        primaryLocations,
        recentLocations,
        recordRecentLocation,
        savedLocationsAreLoaded,
        searchFavoriteLocations: visibleFavoriteLocations,
        searchRecentLocations: visibleRecentLocations,
        setPrimaryLocation,
        toggleSavedLocationFavorite,
    };
}
