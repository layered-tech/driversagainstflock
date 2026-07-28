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
const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const mapScreenContextSource = readFileSync(
    new URL('../map-screen-context.js', import.meta.url),
    'utf8',
);

function sourceBetween(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = source.indexOf(endToken, start);

    assert.ok(start >= 0, `missing ${startToken}`);
    assert.ok(end > start, `missing ${endToken} after ${startToken}`);

    return source.slice(start, end);
}

test('releases every camera owner before Android Auto applies manual gestures', () => {
    const panModeSource = sourceBetween(
        autoPlaySource,
        'onPanningInterfaceChanged: (isPanningInterfaceVisible) => {',
        'onPan: (translation) => {',
    );
    const pauseSource = sourceBetween(
        mapSurfaceSource,
        'const pauseFollowForManualMapGesture = useCallback(async () => {',
        'const handlePanningInterfaceChanged = useCallback(',
    );
    const panSource = sourceBetween(
        mapSurfaceSource,
        'const handlePan = useCallback(',
        'const handleZoomGesture = useCallback(',
    );
    const zoomGestureSource = sourceBetween(
        mapSurfaceSource,
        'const handleZoomGesture = useCallback(',
        'const isFollowing = locationTrackingMode',
    );

    assert.match(
        panModeSource,
        /handleRootMapPanningInterfaceChanged\(isPanningInterfaceVisible\)[\s\S]*?handlePanningInterfaceChanged\(\s*isPanningInterfaceVisible/,
    );
    assert.match(
        autoPlaySource,
        /function flushTemplateUpdates\(\)[\s\S]*?rootMapButtonsRefreshIsDeferred \|\|= needsMapButtons;[\s\S]*?rootMapHeaderActionsRefreshIsDeferred \|\|= needsHeaderActions;/,
    );
    assert.match(
        autoPlaySource,
        /function updateRootTemplateHeaderActions\(\)[\s\S]*?if \(rootMapPanningInterfaceIsVisible\) \{[\s\S]*?rootMapHeaderActionsRefreshIsDeferred = true;[\s\S]*?return;/,
    );
    assert.match(
        autoPlaySource,
        /function updateRootMapButtons\(\)[\s\S]*?if \(rootMapPanningInterfaceIsVisible\) \{[\s\S]*?rootMapButtonsRefreshIsDeferred = true;[\s\S]*?return;/,
    );
    assert.match(
        autoPlaySource,
        /function handleRootMapPanningInterfaceChanged[\s\S]*?scheduleTemplateUpdate\(\{[\s\S]*?headerActions: headerActionsRefreshIsDeferred,[\s\S]*?mapButtons: mapButtonsRefreshIsDeferred/,
    );
    assert.match(
        autoPlaySource,
        /function updateNavigationGuidance\(userLocation\) \{[\s\S]*?if \(rootMapPanningInterfaceIsVisible\) \{[\s\S]*?navigationGuidanceIsDeferredDuringPanning = true;[\s\S]*?return;/,
    );
    assert.match(
        autoPlaySource,
        /function handleRootMapPanningInterfaceChanged[\s\S]*?guidanceWasDeferred[\s\S]*?updateNavigationGuidance\(guidanceLocation\)/,
    );
    assert.match(
        pauseSource,
        /followLocationMode\.pauseUntilRecenter\(\);[\s\S]*?locationPuckCameraFollowReleaseRef\.current\?\.\(\)[\s\S]*?!== false/,
    );
    assert.match(
        mapSurfaceSource,
        /registerAutoPlayMapControlHandlers\(\{[\s\S]*?handlePanningInterfaceChanged:\s*controller\.handlePanningInterfaceChanged/,
    );
    assert.match(
        panSource,
        /manualMapGestureGenerationRef\.current;[\s\S]*?const wasFollowReleased = await pauseFollowForManualMapGesture\(\);[\s\S]*?!wasFollowReleased[\s\S]*?manualMapGestureGeneration !==[\s\S]*?manualMapGestureGenerationRef\.current[\s\S]*?cameraRef\.current\?\.moveBy\(/,
    );
    assert.doesNotMatch(panSource, /animationDuration|animationMode/);
    assert.match(
        zoomGestureSource,
        /const wasFollowReleased = await pauseFollowForManualMapGesture\(\);[\s\S]*?!wasFollowReleased[\s\S]*?cameraRef\.current\?\.scaleBy\(/,
    );
    assert.match(
        mapScreenContextSource,
        /locationPuckCameraFollowReleaseRef:\s*controller\.locationPuckCameraFollowReleaseRef/,
    );
    assert.match(
        mapCanvasSource,
        /locationPuckCameraFollowLifecycle\.release\([\s\S]*?locationPuckCameraFallbackReleaseGate\.release\([\s\S]*?locationPuckCameraFollowReleaseRef\.current =\s*releaseLocationPuckCameraFollow/,
    );
    assert.match(
        mapCanvasSource,
        /locationPuckCameraFallbackReleaseGate\.handleCameraCommit\(\{[\s\S]*?fallbackCameraIsFollowing: mapboxFallbackCameraIsFollowing/,
    );
    assert.match(
        mapSurfaceSource,
        /const handleDrivingRecenterPress = useCallback\(async \(\) => \{[\s\S]*?manualMapGestureGenerationRef\.current \+= 1;[\s\S]*?locationPuckCameraFollowReleaseRef\.current\?\.\(\{[\s\S]*?resumeFollow: true/,
    );
});
