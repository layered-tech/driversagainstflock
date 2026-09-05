import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const autoPlayStateSource = readFileSync(
    new URL('../../auto-play-state.js', import.meta.url),
    'utf8',
);

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);

    assert.ok(start >= 0, `missing ${startToken}`);
    assert.ok(end > start, `missing ${endToken} after ${startToken}`);

    return source.slice(start, end);
}

test('Android Auto and CarPlay expose route mode in header actions', () => {
    const headerActionsSource = sourceBetween(
        autoPlaySource,
        'function getRootMapHeaderActions() {',
        'function showAutoPlayError(',
    );

    assert.match(
        autoPlaySource,
        /function getRootHeaderDrivingMapViewButtonImage\(\)[\s\S]*?DRIVING_MAP_VIEW_ROUTE_OVERVIEW[\s\S]*?'map' : 'location-arrow'/,
    );
    assert.match(
        headerActionsSource,
        /const drivingMapViewButton = hasActiveNavigation/,
    );
    assert.match(
        headerActionsSource,
        /android: \[[\s\S]*?drivingMapViewButton[\s\S]*?searchButton/,
    );
    assert.match(
        headerActionsSource,
        /trailingNavigationBarButtons:[\s\S]*?drivingMapViewButton[\s\S]*?trailingNavigationButton/,
    );
    assert.match(
        autoPlaySource,
        /handleRootHeaderDrivingMapViewPress[\s\S]*?handleDrivingMapViewPress\(\)/,
    );
});

test('automotive map buttons remain pan, zoom, and recenter controls', () => {
    const mapButtonsSource = sourceBetween(
        autoPlaySource,
        'function getRootMapButtons() {',
        'let lastDeferredSharedNavigationStartKey',
    );

    assert.match(mapButtonsSource, /type: 'pan'/);
    assert.match(mapButtonsSource, /onPress: handleRootZoomInPress/);
    assert.match(mapButtonsSource, /onPress: handleRootZoomOutPress/);
    assert.match(mapButtonsSource, /onPress: handleRootTrackingPress/);
    assert.doesNotMatch(mapButtonsSource, /DrivingMapView/);
});

test('automotive route mode releases follow and fits the active route', () => {
    assert.match(
        autoPlayStateSource,
        /drivingMapViewMode: DRIVING_MAP_VIEW_PERSPECTIVE/,
    );
    assert.match(
        mapSurfaceSource,
        /const drivingMapViewMode =\s*autoPlayState\.drivingMapViewMode/,
    );
    assert.match(
        mapSurfaceSource,
        /getNextDrivingMapViewMode\(drivingMapViewMode\)[\s\S]*?setAutoPlayState\(\{\s*drivingMapViewMode: nextMode/,
    );
    assert.doesNotMatch(mapSurfaceSource, /setDrivingMapViewMode/);
    assert.match(
        mapSurfaceSource,
        /followIsEnabled:[\s\S]*?drivingMapViewMode !== DRIVING_MAP_VIEW_ROUTE_OVERVIEW/,
    );
    assert.match(
        mapSurfaceSource,
        /const fitCameraToBounds = useCallback\([\s\S]*?followLocationMode\.pauseUntilRecenter\(\)[\s\S]*?locationPuckCameraFollowReleaseRef\.current\?\.\(\)[\s\S]*?cameraRef\.current\.setCamera\(cameraStop\)/,
    );
    assert.match(
        mapSurfaceSource,
        /drivingMapViewMode !== DRIVING_MAP_VIEW_ROUTE_OVERVIEW[\s\S]*?getDirectionsRouteBounds\(activeDirectionsRoute\)[\s\S]*?fitDrivingCameraToBounds\(bounds/,
    );
    assert.match(
        mapSurfaceSource,
        /if \(!isRootMapSurface \|\| activeDirectionsRoute\)[\s\S]*?shouldRestoreDrivingPerspective\(\{[\s\S]*?isRootMapSurface/,
    );
    assert.match(
        mapSurfaceSource,
        /const fitDrivingCameraToBounds = useCallback\([\s\S]*?manualMapGestureGenerationRef\.current \+= 1[\s\S]*?fitCameraToBounds\(bounds,[\s\S]*?shouldApply: \(\) => shouldApply\(\) && isMountedRef\.current[\s\S]*?\[fitCameraToBounds, isDrivingMode\]/,
    );
    assert.equal(
        sourceBetween(
            mapSurfaceSource,
            'const fitDrivingCameraToBounds = useCallback(',
            'const handlePanningInterfaceChanged',
        ).match(/locationPuckCameraFollowReleaseRef/g)?.length ?? 0,
        0,
    );
    assert.match(
        mapSurfaceSource,
        /fitDrivingCameraToBounds\(bounds, \{[\s\S]*?allowBeforeMapReady: true/,
    );
    assert.match(
        mapSurfaceSource,
        /allowBeforeMapReady = false[\s\S]*?\(!allowBeforeMapReady && !isMapReadyRef\.current\)/,
    );
});

test('automotive recenter returns route overview to 3D follow', () => {
    assert.match(
        mapSurfaceSource,
        /handleLocationTrackingPress:[\s\S]*?drivingMapViewMode === DRIVING_MAP_VIEW_ROUTE_OVERVIEW[\s\S]*?handleDrivingMapViewPress/,
    );
    assert.match(
        mapSurfaceSource,
        /previousDrivingMapViewMode\s*===\s*DRIVING_MAP_VIEW_ROUTE_OVERVIEW[\s\S]*?drivingMapViewMode\s*===\s*DRIVING_MAP_VIEW_PERSPECTIVE[\s\S]*?controller\.handleDrivingRecenterPress\(\)/,
    );

    const locationTrackingHandler = mapSurfaceSource.slice(
        mapSurfaceSource.indexOf(
            'const handleLocationTrackingPress = useCallback',
        ),
        mapSurfaceSource.indexOf(
            'const handleDrivingRecenterPress = useCallback',
        ),
    );

    assert.doesNotMatch(locationTrackingHandler, /activeLocationMode\.stop/);
    assert.match(
        mapSurfaceSource,
        /handleLocationTrackingPress:[\s\S]*?isDrivingMode\s*\? controller\.handleDrivingRecenterPress\s*:\s*controller\.handleLocationTrackingPress/,
    );
});

test('automotive route mode hides speed status and the current road pill', () => {
    assert.match(
        mapSurfaceSource,
        /drivingStatusIsVisible=\{\s*mapContentVisibility\.drivingStatusIsVisible &&\s*shouldShowDrivingMapStatus\(drivingMapViewMode\)\s*\}/,
    );
});
