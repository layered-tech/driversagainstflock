import { createSearchResultFromSavedLocation } from './map/saved-locations';

const AUTO_PLAY_SAVED_SEARCH_PAGE_SIZE = 4;

function makeSavedSearchEntries(locations, category, icon) {
    return (locations ?? [])
        .map((location) => ({
            category,
            icon,
            result: createSearchResultFromSavedLocation(location),
        }))
        .filter(({ result }) => Boolean(result));
}

export function getAutoPlaySavedSearchResults(
    savedLocations = {},
    selectedCategory = null,
) {
    const resolvedSavedLocations = savedLocations ?? {};
    const favorites = makeSavedSearchEntries(
        resolvedSavedLocations.favoriteLocations,
        'Favorite',
        'star',
    );
    const recents = makeSavedSearchEntries(
        resolvedSavedLocations.recentLocations,
        'Recent',
        'clock',
    );

    if (selectedCategory === 'Favorites') {
        return favorites;
    }

    if (selectedCategory === 'Recents') {
        return recents;
    }

    const primarySuggestions = [
        {
            category: 'Home',
            icon: 'house',
            location: resolvedSavedLocations.primaryLocations?.home,
        },
        {
            category: 'Work',
            icon: 'briefcase',
            location: resolvedSavedLocations.primaryLocations?.work,
        },
    ]
        .map(({ category, icon, location }) => ({
            category,
            icon,
            isCategory: false,
            isPrimary: true,
            result: createSearchResultFromSavedLocation(location),
        }))
        .filter(({ result }) => Boolean(result));

    return [
        {
            category: 'Recents',
            count: recents.length,
            icon: 'clock',
            isCategory: true,
        },
        {
            category: 'Favorites',
            count: favorites.length,
            icon: 'star',
            isCategory: true,
        },
        ...primarySuggestions.map(({ category, icon, result }) => ({
            category,
            icon,
            isCategory: false,
            isPrimary: true,
            result,
        })),
    ];
}

export function getAutoPlaySavedSearchPage(results, page = 0) {
    const resolvedResults = Array.isArray(results) ? results : [];
    const lastPage = Math.max(
        0,
        Math.ceil(resolvedResults.length / AUTO_PLAY_SAVED_SEARCH_PAGE_SIZE) -
            1,
    );
    const resolvedPage = Math.min(
        lastPage,
        Math.max(0, Math.floor(Number(page) || 0)),
    );
    const start = resolvedPage * AUTO_PLAY_SAVED_SEARCH_PAGE_SIZE;

    return {
        hasNextPage:
            start + AUTO_PLAY_SAVED_SEARCH_PAGE_SIZE < resolvedResults.length,
        hasPreviousPage: resolvedPage > 0,
        page: resolvedPage,
        results: resolvedResults.slice(
            start,
            start + AUTO_PLAY_SAVED_SEARCH_PAGE_SIZE,
        ),
    };
}
