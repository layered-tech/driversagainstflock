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

test('Android Auto supplies submitted result markers and frames them on its map', () => {
    assert.match(autoPlayMapStateSource, /submittedSearchResults: \[\]/);
    assert.match(
        autoPlayMapSurfaceSource,
        /getSubmittedSearchResultsBounds\(submittedSearchResults\)/,
    );
    assert.match(autoPlayMapSurfaceSource, /getAutoPlaySearchResultsFitKey/);
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
        /isRootMapSurface && !searchResultsMapIsActive[\s\S]*?<AutoPlayMapStatusOverlay/,
    );
    assert.match(
        mapScreenContextSource,
        /submittedSearchResults:\s*submittedSearchResults/,
    );
});
