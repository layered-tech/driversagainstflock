import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);

    assert.ok(start >= 0, `missing ${startToken}`);
    assert.ok(end > start, `missing ${endToken} after ${startToken}`);

    return source.slice(start, end);
}

test('driving bounds fit releases native puck follow before moving the camera', () => {
    const fitCameraSource = sourceBetween(
        mapSurfaceSource,
        'const fitCameraToBounds = useCallback(',
        'const pauseFollowForManualMapGesture',
    );
    const nativeFollowReleaseIndex = fitCameraSource.indexOf(
        'locationPuckCameraFollowReleaseRef.current',
    );
    const cameraMoveIndex = fitCameraSource.indexOf(
        'cameraRef.current.setCamera(cameraStop)',
    );

    assert.match(
        fitCameraSource,
        /const fitCameraToBounds = useCallback\(\s*async/,
        'bounds fitting must wait for asynchronous camera ownership release',
    );
    assert.ok(
        nativeFollowReleaseIndex >= 0 &&
            /await[\s\S]*locationPuckCameraFollowReleaseRef\.current/.test(
                fitCameraSource.slice(0, cameraMoveIndex),
            ),
        'native puck follow must be awaited before applying the bounds camera',
    );
    assert.ok(
        cameraMoveIndex > nativeFollowReleaseIndex,
        'the bounds camera must move only after native follow releases ownership',
    );
});

test('search and route fits cannot apply after their surface state is replaced', () => {
    const searchFitSource = sourceBetween(
        mapSurfaceSource,
        'const fitSearchResultsToBounds =',
        'fitSearchResultsToBounds();',
    );
    const routeFitSource = sourceBetween(
        mapSurfaceSource,
        'const fitRouteToBounds =',
        'fitRouteToBounds();',
    );

    for (const [name, source] of [
        ['search', searchFitSource],
        ['route', routeFitSource],
    ]) {
        assert.match(source, /=\s*async\s*\(\)\s*=>/);
        assert.match(
            source,
            /await controller\.fitCameraToBounds\(bounds,[\s\S]*?shouldApply:\s*\(\)\s*=>\s*!isCancelled/,
            `${name} bounds fitting must cancel before it takes camera ownership`,
        );
    }

    assert.doesNotMatch(
        searchFitSource,
        /requestAnimationFrame|setTimeout/,
        'search fitting must not queue delayed camera commands after cleanup',
    );
    assert.doesNotMatch(
        routeFitSource,
        /requestAnimationFrame|setTimeout/,
        'route fitting must not queue delayed camera commands after cleanup',
    );

    const fitCameraSource = sourceBetween(
        mapSurfaceSource,
        'const fitCameraToBounds = useCallback(',
        'const pauseFollowForManualMapGesture',
    );
    assert.match(
        fitCameraSource,
        /shouldApply = \(\) => true[\s\S]*?await locationPuckCameraFollowReleaseRef\.current[\s\S]*?!shouldApply\(\)[\s\S]*?cameraRef\.current\.setCamera/,
        'the controller must recheck cancellation after native follow releases',
    );
});

test('location hydration cannot reclaim follow while browsing owns the camera', () => {
    const mapControllerDeclaration = sourceBetween(
        mapSurfaceSource,
        'function useAutoPlayMapController({',
        '}) {',
    );
    const mapControllerCall = sourceBetween(
        mapSurfaceSource,
        'const controller = useAutoPlayMapController({',
        '});',
    );
    const locationHydrationSource = sourceBetween(
        mapSurfaceSource,
        'async function hydrateLocationAccess()',
        'hydrateLocationAccess();',
    );

    assert.match(mapControllerDeclaration, /mapBrowsingContextIsActive/);
    assert.match(mapControllerCall, /mapBrowsingContextIsActive/);
    assert.match(
        locationHydrationSource,
        /if \(\s*isDrivingModeRef\.current\s*&&\s*!mapBrowsingContextIsActiveRef\.current\s*\) \{[\s\S]*?followLocationMode\.start\(currentLocation\);/,
        'search or route browsing must retain camera ownership after location hydration',
    );
    assert.match(
        locationHydrationSource,
        /locationUpdatesEnabledRef\.current[\s\S]*?isDrivingModeRef\.current/,
        'hydration must read the current host state after its permission request resolves',
    );
});

test('the driving location control recenters without disabling follow', () => {
    const trackingPressSource = sourceBetween(
        mapSurfaceSource,
        'const handleLocationTrackingPress = useCallback',
        'const handleDrivingRecenterPress',
    );
    const locationUpdateSource = sourceBetween(
        mapSurfaceSource,
        'const handleUserLocationUpdate = useCallback',
        '// While the Play Store auto-drive simulation',
    );
    const sharedLocationAutoStartSource = sourceBetween(
        mapSurfaceSource,
        'useEffect(() => {\n        if (\n            locationUpdatesEnabled ||',
        'useEffect(() => {\n        if (!isMapReady || !pendingCameraStopRef.current)',
    );
    const drivingSessionSource = sourceBetween(
        mapSurfaceSource,
        'const wasDrivingMode = previousDrivingModeRef.current;',
        'const handleCameraChanged = useCallback',
    );

    assert.match(trackingPressSource, /await handleLocationRecenterPress\(\)/);
    assert.doesNotMatch(trackingPressSource, /activeLocationMode\.stop\(\)/);
    assert.doesNotMatch(mapSurfaceSource, /followAutoStartIsSuppressedRef/);
    assert.match(
        locationUpdateSource,
        /currentTrackingMode !== LOCATION_TRACKING_FOLLOW[\s\S]*?followLocationMode\.start/,
    );
    assert.match(
        sharedLocationAutoStartSource,
        /if \(isDrivingMode\) \{[\s\S]*?followLocationMode\.start\(userLocation\)/,
        'the shared-location fallback must restore automatic follow',
    );
    assert.match(
        drivingSessionSource,
        /if \(isDrivingMode\) \{[\s\S]*?followLocationMode\.start/,
        'a new driving session must start automatic follow',
    );
});
