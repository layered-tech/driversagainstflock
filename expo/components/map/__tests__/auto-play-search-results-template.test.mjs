import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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

test('Android Auto presents submitted place results with the host map', () => {
    assert.match(androidPlatformSource, /showsSearchResultsOnMap:\s*true/);
    assert.match(
        autoPlaySource,
        /function presentAndroidAutoSearchResults[\s\S]*?new ListTemplate\(/,
    );
    assert.match(
        autoPlaySource,
        /new ListTemplate\([\s\S]*?mapConfig:\s*\{[\s\S]*?mapButtons:\s*getRootMapButtons\(\)/,
    );
    assert.match(
        autoPlaySource,
        /showsSearchResultsOnMap === true[\s\S]*?presentAndroidAutoSearchResults/,
    );
    assert.match(
        autoPlaySource,
        /updateSearchResults === 'function'[\s\S]*?updateSections/,
    );
});

test('Android Auto waits for a stable query before requesting autocomplete', () => {
    assert.match(autoPlaySource, /const SEARCH_DEBOUNCE_MS = 2000;/);
    assert.match(
        autoPlaySource,
        /function schedulePlaceAutocomplete[\s\S]*?abortSearchRequest\(\)[\s\S]*?setTimeout\([\s\S]*?SEARCH_DEBOUNCE_MS/,
    );
    assert.match(
        autoPlaySource,
        /const runSubmittedSearch[\s\S]*?handleSearchTextSubmitted[\s\S]*?runPlaceTextSearch\([\s\S]*?\.finally\([\s\S]*?handleSearchTextSubmissionCompleted/,
    );
    assert.match(
        autoPlaySource,
        /onSearchTextSubmitted:[\s\S]*?runSubmittedSearch\(searchText\)/,
    );
    assert.match(
        autoPlaySource,
        /onSearchTextChanged:[\s\S]*?handleSearchTextChanged[\s\S]*?searchTextChange\.ignored[\s\S]*?return;/,
    );
});

test('Android Auto publishes submitted results before opening its map-backed list', () => {
    assert.match(
        autoPlaySource,
        /const searchTemplateWasUpdated = await updateSearchTemplateResults\([\s\S]*?searchTemplateWasUpdated &&[\s\S]*?showsSearchResultsOnMap === true[\s\S]*?presentAndroidAutoSearchResults\(/,
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
        /results\.length === 1[\s\S]*?await resultTemplatePresentation\.pushPromise[\s\S]*?scheduleAutoPlaySingleResultAutoAdvance/,
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
        /function schedulePlaceAutocomplete[\s\S]*?clearAutoPlaySingleResultCountdown\(\)[\s\S]*?abortSearchRequest\(\)/,
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
        /isRootMapSurface && !searchResultsMapIsActive[\s\S]*?<AutoPlayMapStatusOverlay/,
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
    assert.match(
        mapCanvasSource,
        /navigationPuckRequestsNative3D\s*=\s*Boolean\([\s\S]*?userLocationPuckVisible/,
    );
    assert.match(
        mapCanvasSource,
        /navigationPuckRefreshKey\s*=\s*'default'[\s\S]*?navigationPuckLifecycle\.request\([\s\S]*?navigationPuckRefreshKey/,
    );
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
