import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createAutoPlaySearchCallbackState } from '../../auto-play-template-state.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const androidPlatformSource = readFileSync(
    new URL('../../auto-play-platform.android.js', import.meta.url),
    'utf8',
);
const iosPlatformSource = readFileSync(
    new URL('../../auto-play-platform.ios.js', import.meta.url),
    'utf8',
);
const autoPlayMapStateSource = readFileSync(
    new URL('../../auto-play-state.js', import.meta.url),
    'utf8',
);
const autoPlayMapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const mapScreenContextSource = readFileSync(
    new URL('../../map/map-screen-context.js', import.meta.url),
    'utf8',
);
const mapCanvasSource = readFileSync(
    new URL('../../map/map-canvas.js', import.meta.url),
    'utf8',
);

function createSavedSearchTemplateHarness(
    loadSavedLocations,
    runPlaceTextSearch,
) {
    const functionStart = autoPlaySource.indexOf(
        'function openSearchTemplate(',
    );
    const functionEnd = autoPlaySource.indexOf(
        'function openVoiceSearchResultsTemplate(',
        functionStart,
    );
    const functionSource = autoPlaySource.slice(functionStart, functionEnd);
    const updates = [];
    const selections = [];
    const state = {
        listener: null,
        template: null,
        unsubscribed: false,
        cancellations: 0,
    };
    class SearchTemplate {
        constructor(config) {
            this.config = config;
            state.template = this;
        }

        push() {
            return Promise.resolve();
        }
    }
    const openSearchTemplate = vm.runInNewContext(`(${functionSource})`, {
        addSearchSavedLocationsListener(listener) {
            state.listener = listener;
            return () => {
                state.unsubscribed = true;
            };
        },
        cancelAutoPlaySearchWork() {
            state.cancellations += 1;
        },
        clearAutoPlaySubmittedSearchResults() {},
        createAutoPlaySearchTemplateLifecycle: () => ({
            waitForResultTemplatePushes() {},
        }),
        createAutoPlaySearchCallbackState,
        PLACE_SEARCH_MIN_QUERY_LENGTH: 2,
        getBackHeaderAction: (onPress) => ({ onPress }),
        getAutoPlaySearchLoadingCopy: (query) => ({
            detailedText: `Looking for ${query}.`,
            title: 'Searching...',
        }),
        handleSearchResultSelected: (...args) => selections.push(args),
        loadAutoPlayModule: () => ({ SearchTemplate }),
        loadSearchSavedLocations: () => loadSavedLocations,
        logAutoPlayPlatformAction() {},
        makeAutoText: (text) => ({ text }),
        makeDisabledSearchRow: (title) => ({
            enabled: false,
            title: { text: title },
        }),
        makeInitialSavedSearchRows: (savedLocations, onPress) =>
            savedLocations.places.map((result) => ({
                onPress: () => onPress(result),
                title: { text: result.name },
            })),
        runPlaceTextSearch: runPlaceTextSearch ?? (() => Promise.resolve()),
        setAutoPlayState() {},
        showAutoPlayError() {},
        updateSearchTemplateSection(_template, section) {
            updates.push(section);
            return Promise.resolve(true);
        },
    });

    return { openSearchTemplate, selections, state, updates };
}

test('late search callbacks cannot reset a submitted search', async () => {
    let finishSearch;
    const pendingSearch = new Promise((resolve) => {
        finishSearch = resolve;
    });
    const harness = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [{ id: 'home', name: 'Home' }] }),
        (template) => {
            harness.updates.push({
                items: [{ title: { text: 'Searching...' } }],
            });
            return pendingSearch;
        },
    );
    const opened = harness.openSearchTemplate();
    await opened.pushPromise;

    const search =
        harness.state.template.config.onSearchTextSubmitted('Austin');
    assert.equal(harness.updates.at(-1).items[0].title.text, 'Searching...');

    harness.state.template.config.onSearchTextChanged('');
    assert.equal(harness.updates.at(-1).items[0].title.text, 'Searching...');

    finishSearch();
    await search;
    harness.state.template.config.onSearchTextChanged('');
    assert.equal(harness.updates.at(-1).items[0].title.text, 'Searching...');
});

test('submission survives native dismissal and ignores late voice callbacks', async () => {
    let finish;
    let searches = 0;
    const harness = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [] }),
        () => {
            searches += 1;
            return new Promise((resolve) => {
                finish = resolve;
            });
        },
    );
    await harness.openSearchTemplate().pushPromise;
    const cancellations = harness.state.cancellations;
    const search =
        harness.state.template.config.onSearchTextSubmitted('New York coffee');
    harness.state.template.config.onPopped();
    harness.state.template.config.onSearchTextChanged('');
    harness.state.template.config.onSearchTextChanged('New York');
    await harness.state.template.config.onSearchTextSubmitted(
        'New York coffee',
    );
    assert.equal(searches, 1);
    assert.equal(harness.state.cancellations, cancellations);
    assert.equal(harness.state.unsubscribed, true);
    finish();
    await search;
});

test('an initial voice query opens with a processing row', async () => {
    const harness = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [] }),
    );
    const opened = harness.openSearchTemplate('Austin');

    assert.equal(
        harness.state.template.config.results.items[0].title.text,
        'Searching...',
    );
    harness.state.template.config.onSearchTextChanged('Austin');
    assert.equal(harness.updates.length, 0);
    await opened.pushPromise;
});

test('car search shows saved places before typing and selects through the route flow', async () => {
    const favorite = { id: 'favorite', name: 'Favorite place' };
    const harness = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [favorite] }),
    );
    const opened = harness.openSearchTemplate();
    await opened.pushPromise;
    await Promise.resolve();

    assert.equal(harness.updates.at(-1).items[0].title.text, favorite.name);
    harness.state.template.config.onSearchTextChanged('Austin');
    assert.equal(harness.updates.at(-1).items[0].title.text, 'Search');
    harness.state.template.config.onSearchTextChanged('');
    assert.equal(harness.updates.at(-1).items[0].title.text, favorite.name);

    harness.updates.at(-1).items[0].onPress();
    assert.equal(harness.selections[0][0].id, favorite.id);
    assert.equal(harness.selections[0][1].template, harness.state.template);
    const updateCount = harness.updates.length;
    harness.state.listener({ places: [{ id: 'new', name: 'New place' }] });
    assert.equal(harness.updates.length, updateCount);

    harness.state.template.config.onPopped();
    assert.equal(harness.state.unsubscribed, true);
});

test('late saved-place hydration does not update a dismissed car search', async () => {
    let finishLoading;
    const harness = createSavedSearchTemplateHarness(
        new Promise((resolve) => {
            finishLoading = resolve;
        }),
    );
    const opened = harness.openSearchTemplate();
    await opened.pushPromise;
    const updateCount = harness.updates.length;

    harness.state.template.config.onPopped();
    finishLoading({ places: [{ id: 'late', name: 'Late place' }] });
    await Promise.resolve();
    assert.equal(harness.updates.length, updateCount);
    assert.equal(harness.state.unsubscribed, true);
});

test('car search stays usable when saved places cannot be loaded', async () => {
    const harness = createSavedSearchTemplateHarness(
        Promise.reject(new Error('Secure storage unavailable')),
    );
    const opened = harness.openSearchTemplate();
    await opened.pushPromise;
    await Promise.resolve();

    assert.equal(
        harness.updates.at(-1).items[0].title.text,
        'Saved places unavailable',
    );
    harness.state.template.config.onSearchTextChanged('Austin');
    assert.equal(harness.updates.at(-1).items[0].title.text, 'Search');
});

test('Android Auto presents submitted place results with the host map', () => {
    assert.match(androidPlatformSource, /showsSearchResultsOnMap:\s*true/);
    assert.match(
        autoPlaySource,
        /function presentAutoPlaySearchResults[\s\S]*?new ListTemplate\(/,
    );
    assert.match(
        autoPlaySource,
        /new ListTemplate\([\s\S]*?mapConfig:\s*\{[\s\S]*?mapButtons:\s*getRootMapButtons\(\)/,
    );
    assert.match(
        autoPlaySource,
        /presentAutoPlaySearchResults\(\{\s*includesMap: true/,
    );
    assert.match(
        autoPlaySource,
        /updateSearchResults === 'function'[\s\S]*?updateSections/,
    );
});

test('Android Auto searches only after explicit submission', () => {
    assert.doesNotMatch(autoPlaySource, /supportsSearchAutocomplete/);
    assert.doesNotMatch(autoPlaySource, /schedulePlaceAutocomplete/);
    assert.doesNotMatch(autoPlaySource, /runPlaceAutocomplete/);
    assert.doesNotMatch(autoPlaySource, /createPlaceSearchSessionToken/);
    assert.match(autoPlaySource, /createAutoPlaySearchCallbackState/);
    assert.doesNotMatch(autoPlaySource, /SEARCH_DEBOUNCE_MS/);
    assert.doesNotMatch(autoPlaySource, /\bsearchPlaces\b/);
    assert.match(
        autoPlaySource,
        /const runSubmittedSearch[\s\S]*?return runPlaceTextSearch\(/,
    );
    assert.match(
        autoPlaySource,
        /onSearchTextSubmitted: \(searchText\) => \{\s*return runSubmittedSearch\(searchText\);\s*\}/,
    );
});

test('Auto Play omits the unreachable header driving-mode toggle', () => {
    assert.doesNotMatch(autoPlaySource, /usesHeaderDrivingModeButton/);
    assert.doesNotMatch(autoPlaySource, /getRootHeaderDrivingModeButtonImage/);
    assert.doesNotMatch(autoPlaySource, /toggleAutoPlayDrivingMode/);
    assert.doesNotMatch(autoPlaySource, /handleRootHeaderDrivingModePress/);
    assert.match(autoPlaySource, /function setAutoPlayDrivingModeIsActive/);
});

test('submitted results open without updating the dismissed search template', () => {
    assert.match(
        autoPlaySource,
        /await prepareMap\(\)[\s\S]*?searchTextPlaces\([\s\S]*?presentAutoPlaySearchResults\(/,
    );
    assert.match(
        autoPlaySource,
        /function updateSearchTemplateSection[\s\S]*?return updatePromise\.then\([\s\S]*?\(\) => true,[\s\S]*?\(\) => false/,
    );
});

test('voice searches visibly count down before advancing a sole result', () => {
    assert.equal(
        autoPlaySource.match(/autoAdvanceSingleResult:\s*true/g)?.length,
        1,
    );
    assert.match(
        autoPlaySource,
        /resolvedRequestType === 'search'[\s\S]*?autoAdvanceSingleResult:\s*true/,
    );
    assert.match(
        autoPlaySource,
        /await resultTemplatePresentation\.pushPromise[\s\S]*?results\.length === 1[\s\S]*?scheduleAutoPlaySingleResultAutoAdvance/,
    );
    assert.match(
        autoPlaySource,
        /function scheduleAutoPlaySingleResultAutoAdvance[\s\S]*?handleSearchResultSelected\(result,[\s\S]*?template:\s*resultTemplate/,
    );
    assert.match(
        autoPlaySource,
        /function cancelAutoPlaySearchWork[\s\S]*?clearAutoPlaySingleResultCountdown\(\)/,
    );
    assert.match(
        autoPlaySource,
        /async function handleSearchResultSelected[\s\S]*?clearAutoPlaySingleResultCountdown\(\)[\s\S]*?startRouteLoadRequest/,
    );
    assert.match(
        autoPlaySource,
        /onSearchTextSubmitted: \(searchText\) => \{\s*return runSubmittedSearch\(searchText\);\s*\}/,
    );
    assert.match(
        autoPlaySource,
        /runSubmittedSearch\(initialSearchText, \{\s*shouldAutoAdvanceSingleResult: autoAdvanceSingleResult/,
    );
    assert.match(
        autoPlaySource,
        /async function runPlaceTextSearch[\s\S]*?clearAutoPlaySingleResultCountdown\(\)[\s\S]*?abortSearchRequest\(\)/,
    );

    const countdownStart = autoPlaySource.indexOf(
        'function scheduleAutoPlaySingleResultAutoAdvance(',
    );
    const countdownEnd = autoPlaySource.indexOf(
        'function cancelAutoPlaySearchWork(',
        countdownStart,
    );

    assert.doesNotMatch(
        autoPlaySource.slice(countdownStart, countdownEnd),
        /startNavigationImmediately/,
    );
});

test('Android Auto supplies submitted result markers and frames them on its map', () => {
    assert.match(autoPlayMapStateSource, /submittedSearchResults: \[\]/);
    assert.match(
        autoPlayMapSurfaceSource,
        /getSubmittedSearchResultsBounds\(submittedSearchResults\)/,
    );
    assert.match(autoPlayMapSurfaceSource, /getAutoPlaySearchResultsFitKey/);
    assert.match(
        autoPlayMapSurfaceSource,
        /fitCameraToBounds\(bounds,\s*\{\s*adaptsPaddingToViewport: true/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /hideCompassDuringNavigation:[\s\S]*?searchResultsMapIsActive/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /policeAlertsAreEnabled:[\s\S]*?!searchResultsMapIsActive/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /surveillanceMarkersVisible:[\s\S]*?mapContentVisibility\.surveillanceMarkersVisible/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /userLocationPuckVisible:[\s\S]*?mapContentVisibility\.userLocationPuckVisible/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /getAutoPlayNavigationPuckRefreshKey\([\s\S]*?navigationPuckRefreshKey,/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /<AutoPlayMapStatusOverlay[\s\S]*?statusChromeIsVisible=\{\s*rendersAppOverlays && !searchResultsMapIsActive\s*\}/,
    );
    assert.match(
        mapScreenContextSource,
        /submittedSearchResults:\s*submittedSearchResults/,
    );
    assert.match(
        mapScreenContextSource,
        /useAutoPlayMapScreenContextValues\(\{[\s\S]*?navigationPuckRefreshKey,[\s\S]*?navigationPuckVariant:\s*'auto-play'/,
    );
    assert.match(
        mapScreenContextSource,
        /surveillanceMarkersVisible\s*\?\?[\s\S]*?mapPreferences\.surveillanceMarkersVisible/,
    );
    assert.match(mapCanvasSource, /<MapLocationProvider/);
    assert.match(mapCanvasSource, /locationPuckRequests3D/);
    assert.match(mapCanvasSource, /createLocationPuck3DLifecycle/);
    assert.match(
        mapCanvasSource,
        /locationAccessGranted\s*&&\s*userLocationPuckVisible[\s\S]*?<Mapbox\.LocationPuck/,
    );
});

test('CarPlay publishes visible search results to the shared map context', () => {
    assert.match(
        iosPlatformSource,
        /publishesSearchTemplateResultsToMap:\s*true/,
    );
    assert.match(
        autoPlaySource,
        /function updateSearchTemplateResults[\s\S]*?publishesSearchTemplateResultsToMap[\s\S]*?setAutoPlaySubmittedSearchResults/,
    );
    assert.match(
        autoPlaySource,
        /function openSearchTemplate[\s\S]*?const dismissSearch[\s\S]*?clearAutoPlaySubmittedSearchResults[\s\S]*?onPopped:\s*dismissSearch/,
    );
    assert.match(
        autoPlaySource,
        /template\s*\.push\(\)[\s\S]*?\.catch\(\(error\) => \{[\s\S]*?dismissSearch\(\)/,
    );
});
