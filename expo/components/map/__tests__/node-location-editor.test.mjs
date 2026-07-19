import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const compassDialSource = readFileSync(
    new URL('../../contribute/compass-dial.js', import.meta.url),
    'utf8',
);
const cameraDetailsScreenSource = readFileSync(
    new URL('../../contribute/camera-details-screen.js', import.meta.url),
    'utf8',
);
const editCameraScreenSource = readFileSync(
    new URL('../../edits/edit-camera-screen.js', import.meta.url),
    'utf8',
);

function sourceBetween(source, startToken, endToken) {
    const startIndex = source.indexOf(startToken);
    const endIndex = source.indexOf(endToken, startIndex);

    assert.ok(startIndex >= 0, `Missing ${startToken}`);
    assert.ok(endIndex > startIndex, `Missing ${endToken}`);

    return source.slice(startIndex, endIndex);
}

function getCompassDialInvocation(screenSource) {
    const match = screenSource.match(/<CompassDial\b[\s\S]*?\/>/);

    assert.ok(match);

    return match[0];
}

describe('CompassDial location editing', () => {
    test('keeps the camera marker fixed over an independently pannable map', () => {
        const satelliteMapIndex =
            compassDialSource.indexOf('<NativeWindMapView');
        const satelliteMapCloseIndex = compassDialSource.indexOf(
            '</NativeWindMapView>',
        );
        const coneOverlayIndex = compassDialSource.indexOf(
            '<DirectionConeOverlay',
            satelliteMapCloseIndex,
        );
        const fixedMarkerIndex = compassDialSource.indexOf(
            '<FixedCameraMarker',
            coneOverlayIndex,
        );

        assert.ok(satelliteMapIndex >= 0);
        assert.ok(satelliteMapCloseIndex > satelliteMapIndex);
        assert.ok(coneOverlayIndex > satelliteMapCloseIndex);
        assert.ok(fixedMarkerIndex > coneOverlayIndex);
        assert.match(
            compassDialSource,
            /function FixedCameraMarker[\s\S]*?className="absolute inset-0 items-center justify-center"[\s\S]*?pointerEvents="none"/,
        );
        assert.match(compassDialSource, /testID=\{`\$\{dialTestID\}-marker`\}/);
        assert.doesNotMatch(compassDialSource, /Mapbox\.MarkerView/);
        assert.doesNotMatch(compassDialSource, /markerDragGesture/);
        assert.doesNotMatch(
            compassDialSource,
            /onPress=\{handleMapLocationChange\}/,
        );
    });

    test('persists map center after pan and prevents coordinate drift after rotation', () => {
        const cameraChangedHandler = sourceBetween(
            compassDialSource,
            'const handleCameraChanged',
            'const handleMapIdle',
        );
        const mapIdleHandler = sourceBetween(
            compassDialSource,
            'const handleMapIdle',
            'const handleZoomPress',
        );

        assert.match(
            cameraChangedHandler,
            /cameraState\?\.gestures\?\.isGestureActive/,
        );
        assert.match(
            cameraChangedHandler,
            /setDisplayLocation\(nextLocation\)/,
        );
        assert.match(cameraChangedHandler, /angle\.value = nextHeading/);
        assert.match(
            mapIdleHandler,
            /getAngularDistance\(gesture\.startHeading, nextHeading\)/,
        );
        assert.match(mapIdleHandler, /if \(rotationChanged\)/);
        assert.match(
            mapIdleHandler,
            /const fixedCenter = gesture\.startCenter/,
        );
        assert.match(
            mapIdleHandler,
            /centerCoordinate: \[[\s\S]*?fixedCenter\.longitude,[\s\S]*?fixedCenter\.latitude/,
        );
        assert.match(mapIdleHandler, /onChange\?\.\(nextHeading\)/);
        assert.match(mapIdleHandler, /onLocationChange\?\.\(nextLocation\)/);
        assert.match(compassDialSource, /onMapIdle=\{handleMapIdle\}/);
    });

    test('reserves the outer annulus for heading and the inner cutout for map gestures', () => {
        const headingGesture = sourceBetween(
            compassDialSource,
            'const headingRingGesture',
            'const compassRoseAnimatedStyle',
        );

        assert.match(headingGesture, /Gesture\.Pan\(\)/);
        assert.match(headingGesture, /\.manualActivation\(true\)/);
        assert.match(headingGesture, /\.maxPointers\(1\)/);
        assert.match(
            headingGesture,
            /distanceSquared >= innerRadius \* innerRadius/,
        );
        assert.match(headingGesture, /distanceSquared <= center \* center/);
        assert.match(headingGesture, /stateManager\.fail\(\)/);
        assert.match(headingGesture, /stateManager\.activate\(\)/);
        assert.match(
            headingGesture,
            /runOnJS\(handlePreviewBearingChange\)\(roundedDegrees\)/,
        );
        assert.match(headingGesture, /runOnJS\(handleInteractionEnd\)/);
        assert.match(
            compassDialSource,
            /const COMPASS_RING_INNER_RADIUS_RATIO = 128 \/ 165/,
        );
        assert.match(
            compassDialSource,
            /const COMPASS_MAP_GESTURE_SETTINGS = \{[\s\S]*?panEnabled: true,[\s\S]*?pinchPanEnabled: false/,
        );
        assert.match(compassDialSource, /scrollEnabled\s/);
        assert.match(
            compassDialSource,
            /const loadedMapGestureSettings = \{[\s\S]*?\.\.\.COMPASS_MAP_GESTURE_SETTINGS[\s\S]*?mapViewRef\.current\?\.setNativeProps\(\{[\s\S]*?gestureSettings: loadedMapGestureSettings[\s\S]*?setMapGestureSettings\(loadedMapGestureSettings\)/,
        );
        assert.match(
            compassDialSource,
            /<GestureDetector gesture=\{headingRingGesture\}>[\s\S]*?testID=\{dialTestID\}/,
        );
        assert.match(
            compassDialSource,
            /testID=\{`\$\{dialTestID\}-pan-target`\}/,
        );
    });

    test('shows every direction as red while highlighting only the active cone', () => {
        const directionOverlay = sourceBetween(
            compassDialSource,
            'function DirectionConeOverlay',
            'function FixedCameraMarker',
        );

        assert.match(
            directionOverlay,
            /directions\.map\(\(direction, directionIndex\)/,
        );
        assert.match(
            directionOverlay,
            /normalizeDialDegrees\(direction - activeDirectionValue\)/,
        );
        assert.match(directionOverlay, /opacity: isActive \? 1 : 0\.42/);
        assert.match(directionOverlay, /stopColor=\{dafColors\.alert\[500\]\}/);
        assert.match(
            directionOverlay,
            /d="M128 128 L87\.6 17\.1 A118 118 0 0 1 168\.4 17\.1 Z"/,
        );
        assert.match(directionOverlay, /strokeDasharray="2 6"/);
        assert.match(
            directionOverlay,
            /testID=\{`\$\{testID\}-direction-cone-\$\{directionIndex\}`\}/,
        );
        assert.match(
            directionOverlay,
            /testID=\{isActive \? `\$\{testID\}-cone` : undefined\}/,
        );
        assert.doesNotMatch(directionOverlay, /dafColors\.azure/);
    });

    test('provides only the two requested zoom controls below the dial', () => {
        const controlNames = [
            ...compassDialSource.matchAll(
                /testID=\{`\$\{dialTestID\}-(zoom-in|zoom-out|recenter)-button`\}/g,
            ),
        ].map((match) => match[1]);

        assert.deepEqual(controlNames, ['zoom-in', 'zoom-out']);
        assert.match(compassDialSource, /handleZoomPress\(ZOOM_STEP\)/);
        assert.match(compassDialSource, /handleZoomPress\(-ZOOM_STEP\)/);
        assert.match(
            compassDialSource,
            /COMPASS_MIN_ZOOM_LEVEL[\s\S]*?COMPASS_MAX_ZOOM_LEVEL/,
        );
        assert.doesNotMatch(compassDialSource, /handleRecenterPress/);
        assert.doesNotMatch(compassDialSource, /recenter-button/);
        assert.doesNotMatch(compassDialSource, /expo-location/);
    });

    test('replaces the standalone editor on both create and edit screens', () => {
        assert.equal(
            existsSync(
                new URL(
                    '../../contribute/node-location-editor.js',
                    import.meta.url,
                ),
            ),
            false,
        );

        const createDial = getCompassDialInvocation(cameraDetailsScreenSource);

        assert.match(createDial, /directions=\{directions\}/);
        assert.match(createDial, /location=\{pin\}/);
        assert.match(createDial, /onChange=\{handleDialChange\}/);
        assert.match(createDial, /onLocationChange=\{handleLocationChange\}/);
        assert.match(createDial, /testID="contribute-direction-dial"/);
        assert.match(
            createDial,
            /selectedDirectionIndex=\{selectedDirectionIndex\}/,
        );
        assert.match(createDial, /value=\{selectedBearing\}/);

        const editDial = getCompassDialInvocation(editCameraScreenSource);

        assert.match(editDial, /directions=\{directions\}/);
        assert.match(editDial, /location=\{nodeLocation\}/);
        assert.match(editDial, /onChange=\{handleDialChange\}/);
        assert.match(editDial, /onLocationChange=\{handleLocationChange\}/);
        assert.match(editDial, /testID="edit-camera-direction-dial"/);
        assert.match(
            editDial,
            /selectedDirectionIndex=\{[\s\S]*?selectedDirectionIndex[\s\S]*?\}/,
        );
        assert.match(editDial, /value=\{selectedBearing\}/);

        assert.doesNotMatch(cameraDetailsScreenSource, /NodeLocationEditor/);
        assert.doesNotMatch(editCameraScreenSource, /NodeLocationEditor/);
    });

    test('publishes edited coordinates for existing nodes', () => {
        assert.match(
            editCameraScreenSource,
            /latitude: nodeLocation\.latitude,[\s\S]*?longitude: nodeLocation\.longitude/,
        );
    });
});
