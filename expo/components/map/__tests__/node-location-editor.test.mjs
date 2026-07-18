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
    test('moves the cone and marker together through a nested drag gesture', () => {
        const markerView = compassDialSource.match(
            /<Mapbox\.MarkerView\b[\s\S]*?<\/Mapbox\.MarkerView>/,
        )?.[0];

        assert.ok(markerView);
        assert.match(markerView, /coordinate=\{coordinate\}/);
        assert.match(
            markerView,
            /<Animated\.View[\s\S]*?markerAnimatedStyle[\s\S]*?<DirectionConeOverlay[\s\S]*?<GestureDetector[\s\S]*?gesture=\{markerDragGesture\}/,
        );
        assert.match(markerView, /testID=\{`\$\{dialTestID\}-marker`\}/);

        const markerGesture = sourceBetween(
            compassDialSource,
            'const markerDragGesture',
            'const markerAnimatedStyle',
        );

        assert.match(markerGesture, /Gesture\.Pan\(\)/);
        assert.match(
            markerGesture,
            /markerTranslationX\.value = event\.translationX/,
        );
        assert.match(
            markerGesture,
            /markerTranslationY\.value = event\.translationY/,
        );
        assert.match(markerGesture, /runOnJS\(handleMarkerDragEnd\)/);
    });

    test('converts the marker drop and map taps into persisted coordinates', () => {
        const dragEnd = sourceBetween(
            compassDialSource,
            'const handleMarkerDragEnd',
            'const markerDragGesture',
        );

        assert.match(dragEnd, /getPointInView\(coordinate\)/);
        assert.match(dragEnd, /getCoordinateFromView\(\[/);
        assert.match(dragEnd, /latitude: droppedCoordinate\?\.\[1\]/);
        assert.match(dragEnd, /longitude: droppedCoordinate\?\.\[0\]/);
        assert.match(dragEnd, /onLocationChange\?\.\(nextLocation\)/);
        assert.match(compassDialSource, /onPress=\{handleMapLocationChange\}/);
        assert.match(
            compassDialSource,
            /getNodeLocationFromMapFeature\(feature\)[\s\S]*?onLocationChange\?\.\(nextLocation\)/,
        );
    });

    test('reserves the outer ring for heading and the map interior for panning', () => {
        const headingGesture = sourceBetween(
            compassDialSource,
            'const headingRingGesture',
            'const compassRoseAnimatedStyle',
        );

        assert.match(headingGesture, /Gesture\.Pan\(\)/);
        assert.match(headingGesture, /\.manualActivation\(true\)/);
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
        assert.match(headingGesture, /\.onEnd\(\(\) =>/);
        assert.match(compassDialSource, /scrollEnabled\s/);
        assert.doesNotMatch(compassDialSource, /scrollEnabled=\{false\}/);
        assert.match(
            compassDialSource,
            /<GestureDetector gesture=\{headingRingGesture\}>[\s\S]*?testID=\{dialTestID\}/,
        );
        assert.match(
            compassDialSource,
            /<Circle[\s\S]*?r="43"[\s\S]*?strokeWidth="14"/,
        );
        assert.doesNotMatch(
            compassDialSource,
            /headingRingGestures\.(top|bottom|left|right)/,
        );
        assert.match(
            compassDialSource,
            /testID=\{`\$\{dialTestID\}-pan-target`\}/,
        );
    });

    test('shows every direction cone and highlights only the active one', () => {
        const directionOverlay = sourceBetween(
            compassDialSource,
            'function DirectionConeOverlay',
            'export function CompassDial',
        );

        assert.match(
            directionOverlay,
            /directions\.map\(\(direction, directionIndex\)/,
        );
        assert.match(
            directionOverlay,
            /normalizeDialDegrees\(direction - activeDirectionValue\)/,
        );
        assert.match(directionOverlay, /color: dafColors\.azure\[500\]/);
        assert.match(
            directionOverlay,
            /coneStyle=\{isActive \? coneStyle : inactiveConeStyle\}/,
        );
        assert.match(
            directionOverlay,
            /testID=\{`\$\{testID\}-direction-cone-\$\{directionIndex\}`\}/,
        );
        assert.match(
            directionOverlay,
            /testID=\{isActive \? `\$\{testID\}-cone` : undefined\}/,
        );
    });

    test('provides zoom controls and one marker recenter control', () => {
        const controlNames = [
            ...compassDialSource.matchAll(
                /testID=\{`\$\{dialTestID\}-(zoom-in|zoom-out|recenter)-button`\}/g,
            ),
        ].map((match) => match[1]);

        assert.deepEqual(controlNames, ['zoom-in', 'zoom-out', 'recenter']);
        assert.equal(
            compassDialSource.match(/<MapControlButton\b/g)?.length ?? 0,
            3,
        );
        assert.equal(
            compassDialSource.match(/accessibilityLabel="Re-center on marker"/g)
                ?.length ?? 0,
            1,
        );
        assert.match(compassDialSource, /handleZoomPress\(ZOOM_STEP\)/);
        assert.match(compassDialSource, /handleZoomPress\(-ZOOM_STEP\)/);

        const recenterHandler = sourceBetween(
            compassDialSource,
            'const handleRecenterPress',
            'const handleMapReady',
        );

        assert.match(recenterHandler, /centerCoordinate: coordinate/);
        assert.match(
            recenterHandler,
            /heading: pendingPreviewHeadingRef\.current/,
        );
        assert.doesNotMatch(compassDialSource, /expo-location/);
        assert.doesNotMatch(compassDialSource, /useCurrentLocation/);
        assert.doesNotMatch(compassDialSource, /user-location-button/);
    });

    test('replaces the standalone editor on both screens', () => {
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
