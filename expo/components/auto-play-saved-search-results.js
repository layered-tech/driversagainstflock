import {
    createSearchResultFromSavedLocation,
    savedLocationsMatch,
} from './map/saved-locations';

const MAX_SEARCH_ROWS = 6;

export function getAutoPlaySavedSearchResults(savedLocations = {}) {
    const primarySuggestions = [
        { category: 'Home', location: savedLocations?.primaryLocations?.home },
        { category: 'Work', location: savedLocations?.primaryLocations?.work },
    ]
        .map(({ category, location }) => ({
            category,
            location,
            result: createSearchResultFromSavedLocation(location),
        }))
        .filter(({ result }) => Boolean(result));
    const primaryLocations = primarySuggestions.map(({ location }) => location);
    const favoriteLocations = (savedLocations?.favoriteLocations ?? []).filter(
        (location) =>
            !primaryLocations.some((primaryLocation) =>
                savedLocationsMatch(primaryLocation, location),
            ),
    );
    const recentLocations = (savedLocations?.recentLocations ?? []).filter(
        (location) =>
            !primaryLocations.some((primaryLocation) =>
                savedLocationsMatch(primaryLocation, location),
            ) &&
            !favoriteLocations.some((favoriteLocation) =>
                savedLocationsMatch(favoriteLocation, location),
            ),
    );
    const favorites = favoriteLocations
        .map(createSearchResultFromSavedLocation)
        .filter(Boolean);
    const recents = recentLocations
        .map(createSearchResultFromSavedLocation)
        .filter(Boolean);
    const availableRows = MAX_SEARCH_ROWS - primarySuggestions.length;
    const selectedFavorites = favorites.slice(0, Math.ceil(availableRows / 2));
    const selectedRecents = recents.slice(0, Math.floor(availableRows / 2));
    let remainingRows =
        availableRows - selectedFavorites.length - selectedRecents.length;

    if (remainingRows > 0) {
        const moreFavorites = favorites.slice(
            selectedFavorites.length,
            selectedFavorites.length + remainingRows,
        );
        selectedFavorites.push(...moreFavorites);
        remainingRows -= moreFavorites.length;
    }

    if (remainingRows > 0) {
        selectedRecents.push(
            ...recents.slice(
                selectedRecents.length,
                selectedRecents.length + remainingRows,
            ),
        );
    }

    return [
        ...primarySuggestions.map(({ category, result }) => ({
            category,
            isPrimary: true,
            result,
        })),
        ...selectedFavorites.map((result) => ({
            category: 'Favorite',
            result,
        })),
        ...selectedRecents.map((result) => ({ category: 'Recent', result })),
    ];
}
