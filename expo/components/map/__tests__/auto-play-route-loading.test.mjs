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
            /beginAutoPlayRouteLoading\([\s\S]*?getLastKnownLocation\(\)[\s\S]*?searchTextPlaces\([\s\S]*?handleSearchResultSelected\(results\[0\], \{[\s\S]*?routeLoadingRequestId/,
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

describe('Auto Play route-loading overlay', () => {
    test('renders above the root map even while search results own the map', () => {
        assert.match(
            mapSurfaceSource,
            /isRootMapSurface && !searchResultsMapIsActive[\s\S]*?<AutoPlayMapStatusOverlay[\s\S]*?\) : null\}[\s\S]*?isRootMapSurface \? \([\s\S]*?<AutoPlayTopRightStatusOverlay[\s\S]*?routeLoading=\{autoPlayState\.routeLoading\}/,
        );
        assert.match(
            mapStatusOverlaySource,
            /function AutoPlayRouteLoadingCard[\s\S]*?Finding route[\s\S]*?accessibilityRole="progressbar"[\s\S]*?<ActivityIndicator/,
        );
    });

    test('renders the single-result timer on the same visible status rail', () => {
        assert.match(autoPlayStateSource, /singleResultCountdown: null/);
        assert.match(
            mapSurfaceSource,
            /singleResultCountdown=\{\s*autoPlayState\.singleResultCountdown\s*\}/,
        );
        assert.match(
            mapStatusOverlaySource,
            /function AutoPlaySingleResultCountdownCard[\s\S]*?accessibilityRole="timer"[\s\S]*?Route options in \{remainingSeconds\}s/,
        );
        assert.match(
            mapStatusOverlaySource,
            /singleResultCountdown \? \([\s\S]*?<AutoPlaySingleResultCountdownCard/,
        );
    });

    test('shares the alert rail at the host-safe top-right edge', () => {
        assert.deepEqual(
            getAutoPlayTopRightStatusOverlayLayout({
                mapControlLayoutInsets: {
                    bottom: 40,
                    left: 210,
                    right: 30,
                    top: 24,
                },
            }).positionStyle,
            {
                right: 30,
                top: 24,
            },
        );
        assert.match(
            mapStatusOverlaySource,
            /function AutoPlayTopRightStatusOverlay[\s\S]*?className="absolute items-end gap-\[12px\]"[\s\S]*?<AutoPlayUpcomingAlert[\s\S]*?<AutoPlayRouteLoadingCard/,
        );
        assert.match(
            mapSurfaceSource,
            /upcomingAlerts=\{\s*searchResultsMapIsActive \? \[\] : upcomingAlerts\s*\}/,
        );
    });
});
