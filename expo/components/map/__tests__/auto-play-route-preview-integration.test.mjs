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
const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

test('CarPlay exit glyph leaves button chrome to the host', () => {
    assert.match(
        autoPlaySource,
        /ROOT_MAP_BUTTON_EXIT_BACKGROUND_COLOR\s*=\s*'transparent'/,
    );
});

test('Android Auto keeps populated search results beneath route preview', () => {
    assert.match(
        androidPlatformSource,
        /keepsSearchTemplateUnderRoutePreview:\s*true/,
    );
    assert.match(
        autoPlaySource,
        /keepsSearchTemplateUnderRoutePreview\s*!==\s*true/,
    );
    assert.match(
        autoPlaySource,
        /updateSearchTemplateResults\([\s\S]*?searchContext\.results[\s\S]*?await showRoutePreview/,
    );
    assert.match(
        autoPlaySource,
        /onBackPressed:\s*clearAutoPlayRoutePreviewState/,
    );
    assert.match(
        autoPlaySource,
        /function startAutoPlayNavigation[\s\S]*?HybridAutoPlay\.popToRootTemplate\(false\)\.catch/,
    );
});

test('route preview waits for the map and applies a selected top-down camera stop', () => {
    assert.match(mapSurfaceSource, /getBoundsFitCameraStop\(/);
    assert.match(mapSurfaceSource, /getAutoPlayBoundsFitPadding\(/);
    assert.match(
        mapSurfaceSource,
        /!displayedDirectionsRoute \|\| !controller\.isMapReady/,
    );
    assert.match(mapSurfaceSource, /getAutoPlayRoutePreviewFitKey\(/);
    assert.match(
        mapSurfaceSource,
        /const bounds\s*=\s*getDirectionsRouteBounds\(displayedDirectionsRoute\)\s*\?\?\s*displayedDirectionsRoute\.bounds/,
    );
    assert.doesNotMatch(mapSurfaceSource, /getDirectionsRouteOptionsBounds/);
    assert.match(
        mapSurfaceSource,
        /getAutoPlayRoutePreviewFitKey\(\{[\s\S]*?bounds,[\s\S]*?route: displayedDirectionsRoute/,
    );
    assert.match(
        mapSurfaceSource,
        /cameraRef\.current\.setCamera\(cameraStop\)/,
    );
    assert.match(
        mapSurfaceSource,
        /fitCameraToBounds\(bounds,\s*\{\s*adaptsPaddingToViewport: routePreviewIsActive/,
    );
    assert.match(
        mapSurfaceSource,
        /fittedDirectionsRouteKeyRef\.current === routeFitKey/,
    );
    assert.match(
        mapSurfaceSource,
        /drivingStatusIsVisible=[\s\S]*?mapContentVisibility\.drivingStatusIsVisible/,
    );
    assert.match(
        mapSurfaceSource,
        /userLocationPuckVisible:[\s\S]*?mapContentVisibility\.userLocationPuckVisible/,
    );
    assert.match(
        mapSurfaceSource,
        /hideCompassDuringNavigation:\s*Boolean\([\s\S]*?!mapContentVisibility\.compassIsVisible/,
    );
    assert.match(
        mapSurfaceSource,
        /mapBrowsingContextIsActive[\s\S]*?routePreviewIsActive \|\| searchResultsMapIsActive/,
    );
    assert.match(
        mapSurfaceSource,
        /mapBrowsingContextWasActive[\s\S]*?!mapBrowsingContextWasActive[\s\S]*?mapBrowsingContextIsActive[\s\S]*?handleDrivingRecenterPress/,
    );
    assert.match(
        mapSurfaceSource,
        /if \(isDrivingMode\)[\s\S]*?handleDrivingRecenterPress[\s\S]*?else[\s\S]*?handleLocationRecenterPress/,
    );
});

test('CarPlay clears search-map context before presenting route choices', () => {
    assert.match(
        autoPlaySource,
        /keepsSearchTemplateUnderRoutePreview\s*!==\s*true[\s\S]*?clearAutoPlaySubmittedSearchResults\(\)[\s\S]*?popToRootTemplate/,
    );
});
