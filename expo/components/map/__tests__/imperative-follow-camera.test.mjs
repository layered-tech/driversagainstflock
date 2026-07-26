import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const followLocationModeSource = readFileSync(
    new URL('../../map-follow-location-mode.js', import.meta.url),
    'utf8',
);
const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const mapLocationControllerSource = readFileSync(
    new URL('../use-map-location-controller.js', import.meta.url),
    'utf8',
);
const mapApiMockControlsSource = readFileSync(
    new URL('../use-map-api-mock-controls.js', import.meta.url),
    'utf8',
);

test('does not issue a separate camera center for each accepted location', () => {
    assert.equal(
        existsSync(new URL('../imperative-follow-camera.js', import.meta.url)),
        false,
    );
    assert.doesNotMatch(
        followLocationModeSource,
        /getImperativeFollowCameraStop/,
    );
    assert.doesNotMatch(
        followLocationModeSource,
        /updateImperativeFollowCamera/,
    );
    assert.doesNotMatch(mapCanvasSource, /androidFollowCameraStop/);
    assert.doesNotMatch(
        mapCanvasSource,
        /centerCoordinate=\{[^}]*userLocation/,
    );
});

test('gives RNMapbox camera fallback ownership after native follow fails', () => {
    assert.match(
        mapCanvasSource,
        /onStatusChange: setLocationPuckCameraFollowStatus/,
    );
    assert.match(
        mapCanvasSource,
        /getLocationPuckCameraFollowFallbackProps\(\{[\s\S]*?nativeFollowIsSupported:[\s\S]*?nativeFollowStatus: locationPuckCameraFollowStatus/,
    );
    assert.match(mapCanvasSource, /\.\.\.mapboxCameraFollowFallbackProps/);
    assert.match(
        mapCanvasSource,
        /locationPuckCameraFollowStatus !== 'preparing-native'[\s\S]*?requestLocationPuckCameraFollow\(\{ cameraIsPrepared: true \}\)/,
    );
    assert.match(
        mapCanvasSource,
        /getLocationPuckCameraControllerKey\([\s\S]*?key=\{mapboxCameraControllerKey\}/,
    );
});

test('starts phone follow from the existing fix when driving mode begins', () => {
    const followModeDeclarationIndex = mapLocationControllerSource.indexOf(
        'const followLocationMode = useFollowLocationMode',
    );
    const drivingModeTransitionIndex = mapLocationControllerSource.indexOf(
        'const wasDrivingMode = previousDrivingModeRef.current',
    );

    assert.ok(followModeDeclarationIndex >= 0);
    assert.ok(drivingModeTransitionIndex > followModeDeclarationIndex);
    assert.match(
        mapLocationControllerSource,
        /const wasDrivingMode = previousDrivingModeRef\.current;\s*previousDrivingModeRef\.current = isDrivingMode;\s*if \(wasDrivingMode === isDrivingMode\) \{\s*return;\s*\}\s*if \(isDrivingMode\) \{\s*if \(locationAccessGranted && userLocationRef\.current\) \{\s*followLocationMode\.start\(userLocationRef\.current\);/,
    );
});

test('keeps phone driving exit camera cleanup in the shared transition', () => {
    assert.match(
        mapLocationControllerSource,
        /if \(isDrivingMode\) \{[\s\S]*?followLocationMode\.start\(userLocationRef\.current\);[\s\S]*?return;\s*\}\s*setTrackingMode\(LOCATION_TRACKING_NONE\);\s*markDrivingModeExitCameraRetryWindowStarted\(\);[\s\S]*?scheduleDrivingModeExitCameraRetry\(cameraStop\);/,
    );
});

test('test map initialization cannot repeatedly pause driving follow', () => {
    assert.match(
        mapApiMockControlsSource,
        /initialMockCameraMoveHasRunRef\.current = true;[\s\S]*?moveCameraToCoordinate/,
    );
    assert.match(
        mapApiMockControlsSource,
        /if \(initialMockCameraMoveHasRunRef\.current\) \{[\s\S]*?return;/,
    );
});
