import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createAutoPlayPlaceSearch } from '../../auto-play-place-search.js';
import { getAutoPlayVisibleSearchResults } from '../../auto-play-template-state.js';

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
    autoPlayPlatform = {},
    warmSavedLocations = null,
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
        preparations: 0,
        searchCancellations: 0,
        queries: [],
        pinPublications: [],
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
        autoPlayPlatform,
        activeAutoPlayPlaceSearch: null,
        getRootMapButtons: () => [],
        setAutoPlaySearchWorkflowIsActive() {},
        getSearchResultsHeaderActions: (onBack, onMap) => ({ onBack, onMap }),
        presentAutoPlaySearchResults: (options) => {
            state.mapPresentation = options;
            state.pinPublications.push({
                query: options.query,
                results: getAutoPlayVisibleSearchResults(options.results),
            });
            return { pushPromise: Promise.resolve(true) };
        },
        setAutoPlaySubmittedSearchResults: (value) =>
            state.pinPublications.push(value),
        createPlaceSearchSessionToken: () => 'session',
        getAutoPlaySearchLocation: async () => [1, 2],
        searchPlaces: async () => [],
        searchTextPlaces: async ({ textQuery }) => {
            state.queries.push(textQuery);
            const results = await runPlaceTextSearch?.(
                state.template,
                textQuery,
            );
            return results ?? [];
        },
        createAutoPlayPlaceSearch(options) {
            state.placeSearchOptions = options;
            const search = createAutoPlayPlaceSearch(options);
            return {
                ...search,
                cancel() {
                    state.searchCancellations++;
                    search.cancel();
                },
            };
        },
        updateSearchTemplateResults(_template, results, query) {
            updates.push({
                items: results.length
                    ? results
                    : [{ title: { text: `No results for ${query}` } }],
            });
            return Promise.resolve(true);
        },
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
        PLACE_SEARCH_MIN_QUERY_LENGTH: 2,
        prepareAutoPlaySearchMap: async () => {
            state.preparations += 1;
            state.onPrepare?.();
        },
        getBackHeaderAction: (onPress) => ({ onPress }),
        getSearchSavedLocationsSnapshot: () => warmSavedLocations,
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

    await new Promise((resolve) => setImmediate(resolve));
    finishSearch();
    await search;
    const completedResults = harness.updates.at(-1);
    harness.state.template.config.onSearchTextChanged('');
    assert.strictEqual(harness.updates.at(-1), completedResults);
});

test('native results keep the search alive until the template is popped', async () => {
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
    // Disappearing under the package results list does not pop SearchTemplate.
    harness.state.template.config.onSearchTextChanged('');
    harness.state.template.config.onSearchTextChanged('New York');
    await harness.state.template.config.onSearchTextSubmitted(
        'New York coffee',
    );
    assert.equal(searches, 1);
    assert.equal(harness.state.cancellations, cancellations);
    assert.equal(harness.state.unsubscribed, false);
    await new Promise((resolve) => setImmediate(resolve));
    finish();
    await search;
    harness.state.template.config.onPopped();
    assert.equal(harness.state.unsubscribed, true);
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
    assert.equal(harness.updates.at(-1).items[0].title.text, favorite.name);
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

test('warm car keyboard search is constructed with saved destinations immediately', async () => {
    const harness = createSavedSearchTemplateHarness(
        new Promise(() => {}),
        undefined,
        {},
        { places: [{ id: 'favorite', name: 'Favorite place' }] },
    );
    const opened = harness.openSearchTemplate();
    assert.equal(
        harness.state.template.config.results.items[0].title.text,
        'Favorite place',
    );
    assert.equal(harness.updates.length, 0);
    await opened.pushPromise;
    assert.equal(harness.updates.at(-1).items[0].title.text, 'Favorite place');
});

test('car keyboard search preserves available saved places after unrelated storage fails', async () => {
    let failLoad;
    const harness = createSavedSearchTemplateHarness(
        new Promise((_resolve, reject) => {
            failLoad = reject;
        }),
    );
    const opened = harness.openSearchTemplate();
    await opened.pushPromise;
    harness.state.listener({
        places: [{ id: 'favorite', name: 'Favorite place' }],
    });
    failLoad(new Error('primary unavailable'));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(harness.updates.at(-1).items[0].title.text, 'Favorite place');
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
    assert.equal(
        harness.updates.at(-1).items[0].title.text,
        'Saved places unavailable',
    );
});

test('programmatic voice results offer an optional map-backed list', () => {
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

test('both platforms share native autocomplete and submit callbacks', () => {
    const keyboard = autoPlaySource.slice(
        autoPlaySource.indexOf('function openSearchTemplate('),
        autoPlaySource.indexOf('function openVoiceSearchResultsTemplate('),
    );
    assert.match(keyboard, /createAutoPlayPlaceSearch/);
    assert.match(keyboard, /placeSearch\.change\(searchTextValue\)/);
    assert.match(keyboard, /placeSearch\.submit\(searchTextValue\)/);
    assert.doesNotMatch(keyboard, /nativeTransition|new ListTemplate/);
});

test('Auto Play omits the unreachable header driving-mode toggle', () => {
    assert.doesNotMatch(autoPlaySource, /usesHeaderDrivingModeButton/);
    assert.doesNotMatch(autoPlaySource, /getRootHeaderDrivingModeButtonImage/);
    assert.doesNotMatch(autoPlaySource, /toggleAutoPlayDrivingMode/);
    assert.doesNotMatch(autoPlaySource, /handleRootHeaderDrivingModePress/);
    assert.match(autoPlaySource, /function setAutoPlayDrivingModeIsActive/);
});

test('voice results retain map presentation and tolerate removed templates', () => {
    assert.match(
        autoPlaySource,
        /await prepareMap\(\)[\s\S]*?searchTextPlaces\([\s\S]*?presentAutoPlaySearchResults\(/,
    );
    assert.match(
        autoPlaySource,
        /function updateSearchTemplateSection[\s\S]*?return updatePromise\.then\([\s\S]*?\(\) => true,[\s\S]*?\(\) => false/,
    );
});

test('submitted searches never schedule automatic result selection', () => {
    assert.doesNotMatch(
        autoPlaySource,
        /autoAdvanceSingleResult|scheduleAutoPlaySingleResultAutoAdvance|singleResultCountdown/,
    );
    assert.match(
        autoPlaySource,
        /onSearchTextSubmitted: \(searchText\) => \{\s*return runSubmittedSearch\(searchText\);\s*\}/,
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

test('keyboard uses native submitted results and only the Map header action opens the short map list', async () => {
    const h = createSavedSearchTemplateHarness(Promise.resolve({ places: [] }));
    await h.openSearchTemplate().pushPromise;
    const results = Array.from({ length: 20 }, (_, id) => ({
        id,
        coordinate: [id, 2],
    }));
    assert.equal(h.state.template.config.mapConfig, undefined);
    await h.state.placeSearchOptions.onResults(results, 'Coffee', false);
    assert.equal(h.state.pinPublications.length, 0);
    await h.state.template.config.onSearchTextSubmitted('Coffee');
    await h.state.placeSearchOptions.onResults(results, 'Coffee', true);
    assert.equal(h.state.pinPublications.length, 0);
    assert.equal(h.updates.at(-1).items.length, 20);
    await h.state.template.config.headerActions.onMap();
    assert.equal(h.state.preparations, 1);
    assert.equal(h.state.mapPresentation.includesMap, true);
    assert.equal(h.state.pinPublications[0].results.length, 6);
    assert.deepEqual(
        h.state.pinPublications[0].results.map(({ id }) => id),
        [0, 1, 2, 3, 4, 5],
    );
});

test('the native list keeps every result while numbered map rows match exactly the published pins', () => {
    const state = {};
    const context = vm.createContext({
        getAutoPlayVisibleSearchResults,
        makeAutoText: (text) => text,
        getSearchResultSubtitle: () => '',
        setAutoPlayState: (value) => Object.assign(state, value),
    });
    vm.runInContext(
        [
            autoPlaySource.slice(
                autoPlaySource.indexOf('function makeSearchRows('),
                autoPlaySource.indexOf('function makeInitialSavedSearchRows('),
            ),
            autoPlaySource.slice(
                autoPlaySource.indexOf(
                    'function setAutoPlaySubmittedSearchResults(',
                ),
                autoPlaySource.indexOf(
                    'function getSearchResultsHeaderActions(',
                ),
            ),
        ].join('\n'),
        context,
    );
    const results = Array.from({ length: 20 }, (_, id) => ({
        id,
        label: `Place ${id}`,
    }));
    assert.equal(
        context.makeSearchRows(results, 'places', () => {}).length,
        20,
    );
    const selected = [];
    const rows = context.makeSearchRows(
        getAutoPlayVisibleSearchResults(results),
        'places',
        (result) => selected.push(result),
        { numbered: true },
    );
    rows.forEach(({ onPress }) => onPress());
    context.setAutoPlaySubmittedSearchResults({ query: 'places', results });
    assert.deepEqual(state.submittedSearchResults, selected);
    assert.equal(rows.length, 6);
    rows.forEach((row, index) =>
        assert.equal(row.title, `${index + 1}. Place ${index}`),
    );
});

test('selecting a destination cancels autocomplete before route loading can be overwritten', () => {
    let cancelled = 0;
    const context = vm.createContext({
        activeAutoPlayPlaceSearch: { cancel: () => cancelled++ },
        searchAbortController: null,
        searchRequestSequence: 0,
        setAutoPlayState() {},
    });
    vm.runInContext(
        autoPlaySource.slice(
            autoPlaySource.indexOf('function abortSearchRequest()'),
            autoPlaySource.indexOf('function abortRouteLoadRequest()'),
        ),
        context,
    );
    context.abortSearchRequest();
    assert.equal(cancelled, 1);
    assert.equal(context.activeAutoPlayPlaceSearch, null);
    const selection = autoPlaySource.slice(
        autoPlaySource.indexOf('async function handleSearchResultSelected('),
        autoPlaySource.indexOf('function getTripPointFromCoordinate('),
    );
    assert.ok(
        selection.indexOf('abortSearchRequest()') <
            selection.indexOf('startRouteLoadRequest()'),
    );
});

for (const platform of ['ios', 'android']) {
    test(`${platform} submits immediately without waiting for disappearance or rebuilding the stack`, async () => {
        const h = createSavedSearchTemplateHarness(
            Promise.resolve({ places: [] }),
        );
        const opened = h.openSearchTemplate();
        await opened.pushPromise;
        await opened.template.config.onSearchTextSubmitted('walmart');
        assert.deepEqual(h.state.queries, ['walmart']);
        assert.equal(h.state.preparations, 0);
        assert.equal(
            h.updates.at(-1).items[0].title.text,
            'No results for walmart',
        );
    });
}

test('back cancels submitted work and ignores its late response', async () => {
    let finish;
    const h = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [] }),
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const opened = h.openSearchTemplate();
    await opened.pushPromise;
    const submission = opened.template.config.onSearchTextSubmitted('walmart');
    await new Promise((resolve) => setImmediate(resolve));
    opened.template.config.headerActions.onBack();
    const updates = h.updates.length;
    finish([{ title: { text: 'stale' } }]);
    await submission;
    assert.equal(h.updates.length, updates);
    assert.equal(h.state.searchCancellations, 1);
});

test('moving from native results to the map survives the keyboard being popped and ignores duplicate Map taps', async () => {
    const h = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [] }),
        async () => [{ id: 'coffee' }],
    );
    await h.openSearchTemplate().pushPromise;
    await h.state.template.config.onSearchTextSubmitted('Coffee');
    const cancellations = h.state.searchCancellations;
    h.state.onPrepare = () => h.state.template.config.onPopped();
    await h.state.template.config.headerActions.onMap();
    await h.state.template.config.headerActions.onMap();
    assert.equal(h.state.preparations, 1);
    assert.equal(h.state.searchCancellations, cancellations);
    assert.equal(h.state.unsubscribed, true);
    assert.equal(h.state.mapPresentation.requestIsCurrent(), true);
    assert.equal(h.state.queries.length, 1);
});

test('the Map header action is wired for both platforms', () => {
    const makeHeaders = vm.runInNewContext(
        `(${autoPlaySource.slice(autoPlaySource.indexOf('function getSearchResultsHeaderActions('), autoPlaySource.indexOf('function presentAutoPlaySearchResults('))})`,
        {
            getBackHeaderAction: () => ({
                android: { startHeaderAction: { type: 'back' } },
                ios: { backButton: { type: 'back' } },
            }),
            makeButtonGlyphImage: (name) => name,
        },
    );
    let maps = 0;
    const headers = makeHeaders(
        () => {},
        () => maps++,
    );
    const android = headers.android.endHeaderActions[0];
    const ios = headers.ios.trailingNavigationBarButtons[0];
    assert.equal(android.image, 'map');
    assert.strictEqual(android, ios);
    android.onPress();
    ios.onPress();
    assert.equal(maps, 2);
    assert.equal(headers.android.startHeaderAction.type, 'back');
    assert.equal(headers.ios.backButton.type, 'back');
});

test('Back from native submitted results keeps the keyboard search usable', async () => {
    const h = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [] }),
        async () => [{ id: 'place' }],
    );
    await h.openSearchTemplate().pushPromise;
    await h.state.template.config.onSearchTextSubmitted('Coffee');
    h.state.template.config.headerActions.onBack();
    assert.equal(h.state.unsubscribed, false);
    h.state.template.config.onWillAppear();
    await h.state.template.config.onSearchTextSubmitted('Tea');
    assert.deepEqual(h.state.queries, ['Coffee', 'Tea']);
});

test('Map does not leave search before submission or for an empty result set', async () => {
    const h = createSavedSearchTemplateHarness(
        Promise.resolve({ places: [] }),
        async () => [],
    );
    await h.openSearchTemplate().pushPromise;
    await h.state.template.config.headerActions.onMap();
    await h.state.template.config.onSearchTextSubmitted('Coffee');
    await h.state.template.config.headerActions.onMap();
    assert.equal(h.state.preparations, 0);
    assert.equal(h.state.pinPublications.length, 0);
});
