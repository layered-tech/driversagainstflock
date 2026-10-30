import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { getAutoPlayTopRightStatusOverlayLayout } from '../../auto-play-map-status-layout.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const autoPlayStateSource = readFileSync(
    new URL('../../auto-play-state.js', import.meta.url),
    'utf8',
);
const mapStatusOverlaySource = readFileSync(
    new URL('../../auto-play-map-status-overlay.js', import.meta.url),
    'utf8',
);
const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

describe('Auto Play route-loading state', () => {
    test('uses request ids so stale completion cannot hide newer loading', () => {
        assert.match(autoPlayStateSource, /routeLoading: null/);
        assert.match(
            autoPlaySource,
            /function beginAutoPlayRouteLoading[\s\S]*?requestId = \+\+routeLoadingRequestSequence[\s\S]*?routeLoading: \{[\s\S]*?destinationLabel[\s\S]*?requestId/,
        );
        assert.match(
            autoPlaySource,
            /function finishAutoPlayRouteLoading\(requestId\)[\s\S]*?routeLoading\?\.requestId !== requestId[\s\S]*?setAutoPlayState\(\{ routeLoading: null \}\)/,
        );
        assert.match(
            autoPlaySource,
            /function clearAutoPlayRouteLoading[\s\S]*?routeLoadingRequestSequence \+= 1[\s\S]*?routeLoading: null/,
        );
        assert.match(
            autoPlaySource,
            /function cancelAutoPlaySearchWork[\s\S]*?abortRouteLoadRequest\(\)[\s\S]*?clearAutoPlayRouteLoading\(\)/,
        );
    });

    test('covers lookup and route calculation but not broad place search', () => {
        const handlerStart = autoPlaySource.indexOf(
            'async function handleVoiceNavigation(',
        );
        const handlerEnd = autoPlaySource.indexOf(
            'function handleVoiceNavigationWhenReady(',
            handlerStart,
        );
        const handlerSource = autoPlaySource.slice(handlerStart, handlerEnd);
        const searchReturn = handlerSource.indexOf(
            "if (resolvedRequestType === 'search')",
        );
        const loadingStart = handlerSource.indexOf(
            'beginAutoPlayRouteLoading(',
        );

        assert.ok(searchReturn >= 0);
        assert.ok(loadingStart > searchReturn);
        assert.match(
            handlerSource,
            /beginAutoPlayRouteLoading\([\s\S]*?getAutoPlaySearchLocation\(\)[\s\S]*?searchTextPlaces\([\s\S]*?handleSearchResultSelected\(results\[0\], \{[\s\S]*?routeLoadingRequestId/,
        );
        assert.match(
            handlerSource,
            /if \(destinationLocation\)[\s\S]*?handleSearchResultSelected\([\s\S]*?routeLoadingRequestId/,
        );
        assert.match(
            handlerSource,
            /finally \{[\s\S]*?finishAutoPlayRouteLoading\(routeLoadingRequestId\)/,
        );
    });

    test('does not erase an existing route or result map while loading', () => {
        const handlerStart = autoPlaySource.indexOf(
            'async function handleSearchResultSelected(',
        );
        const handlerEnd = autoPlaySource.indexOf(
            'function getTripPointFromCoordinate(',
            handlerStart,
        );
        const handlerSource = autoPlaySource.slice(handlerStart, handlerEnd);
        const loadingStateStart = handlerSource.indexOf('setAutoPlayState({');
        const loadingStateEnd = handlerSource.indexOf('});', loadingStateStart);
        const loadingStateSource = handlerSource.slice(
            loadingStateStart,
            loadingStateEnd,
        );

        assert.doesNotMatch(loadingStateSource, /directionsRoute:/);
        assert.doesNotMatch(loadingStateSource, /submittedSearchResults:/);
        assert.doesNotMatch(loadingStateSource, /isNavigating:/);
        assert.match(
            handlerSource,
            /finally \{\s*finishAutoPlayRouteLoading\(loadingRequestId\);\s*\}/,
        );
    });
});

describe('Auto Play loading presentation', () => {
    test('does not expose route-loading or automatic-advance cards on the map', () => {
        assert.doesNotMatch(
            mapSurfaceSource,
            /routeLoading=|singleResultCountdown=/,
        );
        assert.doesNotMatch(
            mapStatusOverlaySource,
            /AutoPlayRouteLoadingCard|AutoPlaySingleResultCountdownCard|Finding route|Route options in/,
        );
        assert.doesNotMatch(autoPlayStateSource, /singleResultCountdown/);
    });

    test('keeps request tracking and native list loading feedback', () => {
        assert.match(autoPlayStateSource, /routeLoading: null/);
        assert.match(
            autoPlaySource,
            /updateSearchTemplateLoadingRoute\(template, title\)/,
        );
        assert.match(
            autoPlaySource,
            /makeDisabledSearchRow\(\s*'Loading route'/,
        );
    });

    test('keeps search progress at the host-safe top-right edge', () => {
        assert.deepEqual(
            getAutoPlayTopRightStatusOverlayLayout({
                mapControlLayoutInsets: {
                    bottom: 40,
                    left: 210,
                    right: 30,
                    top: 24,
                },
            }).positionStyle,
            { right: 30, top: 24 },
        );
        assert.match(
            mapStatusOverlaySource,
            /function AutoPlayTopRightStatusOverlay[\s\S]*?pointerEvents="none"[\s\S]*?<AutoPlaySearchLoadingCard/,
        );
    });
});

test('search alone uses the compact destination pill', () => {
    assert.match(autoPlayStateSource, /searchLoading: null/);
    assert.match(
        mapSurfaceSource,
        /searchLoading=\{autoPlayState\.searchLoading\}/,
    );
    assert.match(
        mapStatusOverlaySource,
        /Searching for \$\{destinationLabel\}/,
    );
    assert.match(
        mapStatusOverlaySource,
        /gap-2 rounded-dafPill border px-3 py-2/,
    );
    assert.match(
        mapStatusOverlaySource,
        /if \(!searchLoading\) \{\s*return null/,
    );
});
