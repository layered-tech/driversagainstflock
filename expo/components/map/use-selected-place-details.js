import { useMemo } from 'react';
import {
    formatPlaceRating,
    getPlaceAddress,
    getPlaceCoordinate,
    getPlaceCurrentHoursSummary,
    getPlaceDisplayName,
    getPlaceOpenNowLabel,
    getPlacePhoneNumber,
    getPlaceRatingStarStates,
    getPlaceRatingValue,
    getPlaceTypeLabel,
    getPlaceWeekdayDescriptions,
} from './place-formatters';
import {
    createSavedLocationFromPlace,
    savedLocationsMatch,
} from './saved-locations';

function getSearchResultKey(result) {
    return result?.placeId || result?.id || '';
}

export function useSelectedPlaceDetails({
    favoriteLocations,
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
    const selectedPlaceCurrentHoursSummary =
        getPlaceCurrentHoursSummary(selectedPlaceDetails);
    const selectedPlaceOpenNowLabel =
        getPlaceOpenNowLabel(selectedPlaceDetails);
    const selectedPlacePhoneNumber = getPlacePhoneNumber(selectedPlaceDetails);
    const selectedPlaceRatingValue = getPlaceRatingValue(selectedPlaceDetails);
    const selectedPlaceRatingLabel = formatPlaceRating(selectedPlaceDetails);
    const selectedPlaceRatingStars = useMemo(
        () => getPlaceRatingStarStates(selectedPlaceRatingValue),
        [selectedPlaceRatingValue],
    );
    const selectedPlaceHasDetailBox = Boolean(
        selectedPlaceAddress ||
        selectedPlaceRatingLabel ||
        selectedPlacePhoneNumber,
    );
    const selectedPlaceWeekdayDescriptions = useMemo(
        () => getPlaceWeekdayDescriptions(selectedPlaceDetails),
        [selectedPlaceDetails],
    );
    const selectedPlaceHasHoursBox = Boolean(
        selectedPlaceOpenNowLabel ||
        selectedPlaceWeekdayDescriptions.length > 0,
    );
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
        selectedPlaceHasDetailBox,
        selectedPlaceHasHoursBox,
        selectedPlaceHeaderSubtitle,
        selectedPlaceCurrentHoursSummary,
        selectedPlaceIsFavorite,
        selectedPlaceName,
        selectedPlaceOpenNowLabel,
        selectedPlacePhoneNumber,
        selectedPlaceRatingLabel,
        selectedPlaceRatingStars,
        selectedPlaceTypeLabel,
        selectedPlaceWeekdayDescriptions,
        selectedSavedLocation,
    };
}
