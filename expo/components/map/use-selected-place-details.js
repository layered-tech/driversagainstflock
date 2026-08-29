import { useMemo } from 'react';
import {
    getPlaceAddress,
    getPlaceCoordinate,
    getPlaceDisplayName,
    getPlaceTypeLabel,
} from './place-formatters';
import { getPrimaryLocationTypeToOffer } from './primary-locations';
import {
    createSavedLocationFromPlace,
    savedLocationsMatch,
} from './saved-locations';

function getSearchResultKey(result) {
    return result?.placeId || result?.id || '';
}

export function useSelectedPlaceDetails({
    favoriteLocations,
    primaryLocations,
    primaryLocationTypeBeingSet,
    savedLocationsAreLoaded,
    selectedPlaceDetails,
    selectedSearchResult,
    submittedSearchResults,
}) {
    const selectedPlaceName = getPlaceDisplayName(
        selectedPlaceDetails,
        selectedSearchResult,
    );
    const selectedPlaceAddress = getPlaceAddress(
        selectedPlaceDetails,
        selectedSearchResult,
    );
    const selectedPlaceCoordinate = useMemo(
        () => getPlaceCoordinate(selectedPlaceDetails),
        [selectedPlaceDetails],
    );
    const selectedPlaceTypeLabel = getPlaceTypeLabel(selectedPlaceDetails);
    const selectedPlaceHeaderSubtitle = selectedPlaceTypeLabel;
    const selectedSavedLocation = useMemo(
        () =>
            createSavedLocationFromPlace({
                address: selectedPlaceAddress,
                name: selectedPlaceName,
                place: selectedPlaceDetails,
                result: selectedSearchResult,
                typeLabel: selectedPlaceTypeLabel,
            }),
        [
            selectedPlaceAddress,
            selectedPlaceDetails,
            selectedPlaceName,
            selectedPlaceTypeLabel,
            selectedSearchResult,
        ],
    );
    const selectedPlaceIsFavorite = useMemo(
        () =>
            favoriteLocations.some((favoriteLocation) =>
                savedLocationsMatch(favoriteLocation, selectedSavedLocation),
            ),
        [favoriteLocations, selectedSavedLocation],
    );
    const selectedPlacePrimaryLocationType = useMemo(
        () =>
            savedLocationsAreLoaded && selectedSavedLocation
                ? getPrimaryLocationTypeToOffer({
                      place: selectedPlaceDetails,
                      preferredType: primaryLocationTypeBeingSet,
                      primaryLocations,
                  })
                : null,
        [
            primaryLocations,
            primaryLocationTypeBeingSet,
            savedLocationsAreLoaded,
            selectedPlaceDetails,
            selectedSavedLocation,
        ],
    );
    const selectedSearchResultKey = getSearchResultKey(selectedSearchResult);
    const selectedPlaceCanReturnToSearchResults = useMemo(
        () =>
            Boolean(
                selectedSearchResultKey &&
                submittedSearchResults.some(
                    (result) =>
                        getSearchResultKey(result) === selectedSearchResultKey,
                ),
            ),
        [selectedSearchResultKey, submittedSearchResults],
    );

    return {
        selectedPlaceAddress,
        selectedPlaceCanReturnToSearchResults,
        selectedPlaceCoordinate,
        selectedPlaceHeaderSubtitle,
        selectedPlaceIsFavorite,
        selectedPlaceName,
        selectedPlacePrimaryLocationType,
        selectedPlaceTypeLabel,
        selectedSavedLocation,
    };
}
