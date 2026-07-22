import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const fullScreenSearchSource = readFileSync(
    new URL('../map-full-screen-search.js', import.meta.url),
    'utf8',
);
const primaryLocationCardsSource = readFileSync(
    new URL('../primary-location-cards.js', import.meta.url),
    'utf8',
);
const savedLocationsSource = readFileSync(
    new URL('../saved-locations.js', import.meta.url),
    'utf8',
);
const savedLocationsHookSource = readFileSync(
    new URL('../use-map-search-saved-locations.js', import.meta.url),
    'utf8',
);
const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const selectedPlaceSheetSource = readFileSync(
    new URL('../selected-place-sheet.js', import.meta.url),
    'utf8',
);
const useMapSearchSource = readFileSync(
    new URL('../use-map-search.js', import.meta.url),
    'utf8',
);

describe('Home and Work map search integration', () => {
    test('hydrates pinned cards before presenting unset destinations', () => {
        assert.match(
            savedLocationsSource,
            /driversagainstflock\.mapSearch\.primaryLocations\.v1/,
        );
        assert.match(
            fullScreenSearchSource,
            /savedLocationsAreLoaded[\s\S]*?<PrimaryLocationCards/,
        );
        assert.match(
            fullScreenSearchSource,
            /primaryLocationTypeBeingSet[\s\S]*?Search or enter address/,
        );
    });

    test('keeps full saved lists available in directions mode', () => {
        assert.match(
            savedLocationsHookSource,
            /recentLocations,\s*recordRecentLocation,[\s\S]*?searchFavoriteLocations:\s*visibleFavoriteLocations,[\s\S]*?searchRecentLocations:\s*visibleRecentLocations/,
        );
        assert.match(
            fullScreenSearchSource,
            /items:\s*searchModeIsDirections\s*\?\s*favoriteLocations\s*:\s*searchFavoriteLocations/,
        );
        assert.match(
            fullScreenSearchSource,
            /items:\s*searchModeIsDirections\s*\?\s*recentLocations\s*:\s*searchRecentLocations/,
        );
    });

    test('offers type-aware Home and Work actions in place details', () => {
        assert.match(
            selectedPlaceSheetSource,
            /selected-place-set-\$\{selectedPlacePrimaryLocationType\}-button/,
        );
        assert.match(
            selectedPlaceSheetSource,
            /Suggested for residential addresses/,
        );
        assert.match(selectedPlaceSheetSource, /Suggested for businesses/);
    });

    test('routes a pinned destination through the automatic directions handoff', () => {
        assert.match(
            useMapSearchSource,
            /createPrimaryLocationDirectionsWaypoint\(\s*type,\s*location,?\s*\)/,
        );
        assert.match(
            useMapSearchSource,
            /queueDirectionsToWaypoint\(destinationWaypoint, type\)/,
        );
        assert.match(
            useMapSearchSource,
            /source:\s*pendingDirectionsRequest\.source \|\| 'selected_place'/,
        );
        assert.match(
            useMapSearchSource,
            /requestDirectionsRoute\(\{[\s\S]*?destinationWaypoint[\s\S]*?startWaypoint/,
        );
    });

    test('confirms before unsetting a saved Home or Work location', () => {
        assert.match(
            primaryLocationCardsSource,
            /onLongPress=\{\s*location\s*\?\s*\(\)\s*=>\s*onLocationLongPress\(type\)\s*:\s*undefined\s*\}/,
        );
        assert.match(
            fullScreenSearchSource,
            /Alert\.alert\(\s*`Unset \$\{label\}\?`,[\s\S]*?onPress:\s*\(\)\s*=>\s*handlePrimaryLocationUnset\(type\),[\s\S]*?style:\s*'destructive',[\s\S]*?text:\s*`Unset \$\{label\}`/,
        );
        assert.match(
            useMapSearchSource,
            /const handlePrimaryLocationUnset\s*=\s*useCallback\([\s\S]*?primaryLocations\[type\][\s\S]*?await setPrimaryLocation\(type, null\)/,
        );
    });

    test('adds configured Home and Work locations to idle car headers', () => {
        assert.match(
            savedLocationsSource,
            /export async function loadPrimaryLocations\(\)/,
        );
        assert.match(
            savedLocationsSource,
            /export function addPrimaryLocationsListener\(listener\)/,
        );
        assert.match(
            autoPlaySource,
            /addPrimaryLocationsListener\(\s*handlePrimaryLocationsChanged,?\s*\)[\s\S]*?refreshAutoPlayPrimaryLocations\(\)/,
        );
        assert.match(
            autoPlaySource,
            /function handleRootHeaderPrimaryLocationPress\(type\)[\s\S]*?createPrimaryLocationDirectionsWaypoint\([\s\S]*?handleSearchResultSelected\(\{[\s\S]*?place:\s*destinationWaypoint\.place/,
        );
        assert.match(
            autoPlaySource,
            /getAutoPlayPrimaryLocationHeaderActionTypes\(\{[\s\S]*?hasActiveNavigation,[\s\S]*?primaryLocations:\s*autoPlayPrimaryLocations/,
        );
        assert.match(
            autoPlaySource,
            /androidPrimaryLocationButtons[\s\S]*?iconOnly:\s*true/,
        );
        assert.match(
            autoPlaySource,
            /carPlayPrimaryLocationButtons\s*=\s*primaryLocationHeaderActionTypes\.ios/,
        );
        assert.match(
            autoPlaySource,
            /function startAutoPlayNavigation[\s\S]*?catch \(error\) \{[\s\S]*?activeNavigationRoute = null;[\s\S]*?activeNavigationDestination = null;[\s\S]*?updateRootTemplateHeaderActions\(\);/,
        );
        assert.match(
            autoPlaySource,
            /rootMapTemplateIsReady = true;\s*updateRootTemplateHeaderActions\(\);/,
        );
    });

    test('clears an in-flight ZIP lookup before starting setup', () => {
        assert.match(
            useMapSearchSource,
            /if \(!location\) \{[\s\S]*?clearLocalitySearchRequest\(\)[\s\S]*?setLocalityBoundary\?\.\(null\)[\s\S]*?setLocalitySearchIsLoading\(false\)/,
        );
    });
});
