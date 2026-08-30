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

test('search and route fit callers await asynchronous camera ownership', () => {
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
            /await controller\.fitCameraToBounds\(bounds/,
            `${name} bounds fitting must await camera ownership`,
        );
    }
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
        /if \(\s*isDrivingMode\s*&&\s*!mapBrowsingContextIsActive(?:Ref)?(?:\.current)?\s*\) \{\s*followLocationMode\.start\(currentLocation\);/,
        'search or route browsing must retain camera ownership after location hydration',
    );
});
