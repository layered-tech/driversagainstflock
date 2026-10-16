import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import {
    getAutoPlayHeaderButtonVisibility,
    getAutoPlayPrimaryLocationHeaderActionTypes,
} from '../../auto-play-template-state.js';

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
const androidPlatformSource = readFileSync(
    new URL('../../auto-play-platform.android.js', import.meta.url),
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
    test('Android Auto keeps settings visible while switching saved shortcuts to route steps', () => {
        const platform = vm.runInNewContext(
            androidPlatformSource
                .replace(/^import .*;\n/gm, '')
                .replace(
                    'export const autoPlayPlatform =',
                    'const autoPlayPlatform =',
                ) + '\nautoPlayPlatform;',
            { AndroidAutoMapSurface: null },
        );
        const headerActionsSource = autoPlaySource.slice(
            autoPlaySource.indexOf('function getRootMapHeaderActions() {'),
            autoPlaySource.indexOf('function showAutoPlayError('),
        );

        for (const headerMode of [false, true]) {
            for (const [
                primaryLocations,
                hasActiveNavigation,
                expectedButtons,
            ] of [
                [
                    { home: {}, work: {} },
                    false,
                    ['search', 'home', 'work', 'options'],
                ],
                [
                    { home: {}, work: null },
                    false,
                    ['search', 'home', 'options'],
                ],
                [
                    { home: null, work: {} },
                    false,
                    ['search', 'work', 'options'],
                ],
                [{ home: null, work: null }, false, ['search', 'options']],
                [{ home: {}, work: {} }, true, ['search', 'steps', 'options']],
                [
                    { home: {}, work: null },
                    true,
                    ['search', 'steps', 'options'],
                ],
                [
                    { home: null, work: {} },
                    true,
                    ['search', 'steps', 'options'],
                ],
                [
                    { home: null, work: null },
                    true,
                    ['search', 'steps', 'options'],
                ],
            ]) {
                const actions = vm.runInNewContext(
                    `let cachedRootMapHeaderActions = null;
                 let cachedRootMapHeaderActionsKey = '';
                 ${headerActionsSource}
                 getRootMapHeaderActions();`,
                    {
                        activeNavigationRoute: hasActiveNavigation ? {} : null,
                        autoPlayPlatform: {
                            ...platform,
                            usesSearchAndPrimaryLocationRootHeaderActions:
                                headerMode,
                        },
                        autoPlayPrimaryLocations: primaryLocations,
                        getAutoPlayHeaderButtonVisibility,
                        getAutoPlayPrimaryLocationHeaderActionTypes,
                        getRootHeaderDrivingMapViewButtonImage: () =>
                            'map-view',
                        handleRootHeaderDrivingMapViewPress() {},
                        handleRootHeaderSearchPress() {},
                        handleRootHeaderVoiceSearchPress() {},
                        openRouteStepsTemplate() {},
                        openMapOptionsTemplate() {},
                        makeRootHeaderPrimaryLocationButton: (type) => ({
                            image: type,
                        }),
                        rootMapButtonAppearance: {
                            drivingMapViewMode: 'perspective',
                        },
                        ROOT_HEADER_SEARCH_IMAGE: 'search',
                        ROOT_HEADER_VOICE_SEARCH_IMAGE: 'voice',
                        ROOT_HEADER_ROUTE_STEPS_IMAGE: 'steps',
                        ROOT_HEADER_MAP_OPTIONS_IMAGE: 'options',
                    },
                );

                assert.deepEqual(
                    Array.from(actions.android, ({ image }) => image),
                    expectedButtons,
                );
                assert.ok(actions.android.length <= 4);
            }
        }
    });

    test('saved shortcuts open their destination while a route is active', () => {
        const handlerSource = autoPlaySource.slice(
            autoPlaySource.indexOf(
                'function handleRootHeaderPrimaryLocationPress(type)',
            ),
            autoPlaySource.indexOf('const handleRootHeaderSearchPress'),
        );
        for (const type of ['home', 'work']) {
            for (const [template, ready, shouldOpen] of [
                [{}, true, true],
                [null, true, false],
                [{}, false, false],
            ]) {
                const selected = [];
                const result = { id: type };
                const place = { name: type };
                vm.runInNewContext(
                    `${handlerSource}\nhandleRootHeaderPrimaryLocationPress('${type}');`,
                    {
                        activeNavigationRoute: {},
                        rootMapTemplate: template,
                        rootMapTemplateIsReady: ready,
                        autoPlayPrimaryLocations: { home: {}, work: {} },
                        createPrimaryLocationDirectionsWaypoint: () => ({
                            result,
                            place,
                            label: type,
                        }),
                        logAutoPlayPlatformAction() {},
                        handleSearchResultSelected: (destination) =>
                            selected.push(destination),
                    },
                );
                assert.equal(selected.length, shouldOpen ? 1 : 0);
                if (shouldOpen) {
                    assert.equal(selected[0].id, type);
                    assert.equal(selected[0].place, place);
                }
            }
        }
    });

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
            /function startAutoPlayNavigation[\s\S]*?const rollbackNavigationStart[\s\S]*?stopAutoPlayNavigation\(\{\s*notifyTemplate: false,\s*publishSharedState,\s*\}\)[\s\S]*?showAutoPlayError/,
        );
        assert.match(
            autoPlaySource,
            /void navigationLocationStartup\.catch\(\(error\) => \{\s*rollbackNavigationStart\(error, startupGeneration\);/,
        );
        assert.match(
            autoPlaySource,
            /catch \(error\) \{\s*rollbackNavigationStart\(error\);\s*\}/,
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
