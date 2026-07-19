import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

describe('CompassDial heading preview', () => {
    test('matches the responsive 330px dial and 256px satellite cutout geometry', () => {
        assert.match(compassDialSource, /const COMPASS_DESIGN_SIZE = 330/);
        assert.match(compassDialSource, /const COMPASS_PREVIEW_SIZE = 256/);
        assert.match(compassDialSource, /const COMPASS_PREVIEW_INSET = 37/);
        assert.match(
            compassDialSource,
            /<View className="w-full max-w-\[330px\] self-center">\s*<GestureDetector/,
        );
        assert.match(
            compassDialSource,
            /<GestureDetector gesture=\{headingRingGesture\}>\s*<View[\s\S]*?className="[^"]*aspect-square w-full[^"]*"/,
        );
        assert.doesNotMatch(
            compassDialSource,
            /className="[^"]*(?:aspect-square[^"]*max-w-\[330px\]|max-w-\[330px\][^"]*aspect-square)[^"]*"/,
        );
        assert.match(
            compassDialSource,
            /const previewWindowStyle[\s\S]*?COMPASS_PREVIEW_INSET \* scale[\s\S]*?COMPASS_PREVIEW_SIZE \* scale/,
        );
        assert.match(
            compassDialSource,
            /testID=\{`\$\{dialTestID\}-satellite-cutout`\}/,
        );
        assert.match(
            compassDialSource,
            /styleURL=\{[\s\S]*?MAPBOX_STANDARD_SATELLITE_STYLE_URL/,
        );
        assert.match(
            compassDialSource,
            /const COMPASS_SATELLITE_BASEMAP_CONFIG = \{[\s\S]*?showPlaceLabels: false,[\s\S]*?showPointOfInterestLabels: false,[\s\S]*?showRoadLabels: false/,
        );
        assert.match(
            compassDialSource,
            /<Mapbox\.StyleImport[\s\S]*?config=\{\s*COMPASS_SATELLITE_BASEMAP_CONFIG\s*\}[\s\S]*?existing[\s\S]*?id=\{MAPBOX_STANDARD_STYLE_IMPORT_ID\}/,
        );
        assert.match(compassDialSource, /surfaceView=\{false\}/);
    });

    test('renders the detailed rotating bezel and fixed red direction indicator', () => {
        assert.match(
            compassDialSource,
            /createCompassTickPath\(6, 152, 158\.5\)/,
        );
        assert.match(
            compassDialSource,
            /createCompassTickPath\(30, 146, 158\.5\)/,
        );
        assert.match(
            compassDialSource,
            /<Circle[\s\S]*?r="163\.5"[\s\S]*?<Circle[\s\S]*?r="129"/,
        );
        assert.match(
            compassDialSource,
            /const COMPASS_LABELS = Array\.from\(\{ length: 12 \}/,
        );
        assert.match(
            compassDialSource,
            /transform: \[\{ rotate: `\$\{heading\.value\}deg` \}\]/,
        );
        assert.match(
            compassDialSource,
            /testID=\{`\$\{dialTestID\}-active-direction-indicator`\}/,
        );
        assert.match(compassDialSource, /points="165,27 156\.5,7 173\.5,7"/);
        assert.match(
            compassDialSource,
            /\{formatBearingChip\(displayDegrees\)\}/,
        );
    });

    test('rotates the satellite camera and bezel during a ring drag', () => {
        assert.match(
            compassDialSource,
            /const headingRingGesture[\s\S]*?\.manualActivation\(true\)/,
        );
        assert.match(
            compassDialSource,
            /\.onUpdate\([\s\S]*?runOnJS\(handlePreviewBearingChange\)\(roundedDegrees\)/,
        );
        assert.match(
            compassDialSource,
            /cameraRef\.current\?\.setCamera\(\{[\s\S]*?animationDuration:[\s\S]*?heading: pendingPreviewHeadingRef\.current/,
        );
        assert.match(
            compassDialSource,
            /transform: \[\{ rotate: `\$\{-angle\.value\}deg` \}\]/,
        );
        assert.match(
            compassDialSource,
            /\.onEnd\([\s\S]*?runOnJS\(handleInteractionEnd\)/,
        );
    });

    test('binds native two-finger map rotation to the selected heading without pinch-pan drift', () => {
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
            compassDialSource,
            /const COMPASS_MAP_GESTURE_SETTINGS = \{[\s\S]*?pinchPanEnabled: false,[\s\S]*?pinchZoomEnabled: false,[\s\S]*?rotateEnabled: true,[\s\S]*?simultaneousRotateAndPinchZoomEnabled: true/,
        );
        assert.match(compassDialSource, /rotateEnabled\s/);
        assert.match(
            compassDialSource,
            /gestureSettings=\{mapGestureSettings\}/,
        );
        assert.match(
            compassDialSource,
            /const loadedMapGestureSettings = \{[\s\S]*?\.\.\.COMPASS_MAP_GESTURE_SETTINGS[\s\S]*?mapViewRef\.current\?\.setNativeProps\(\{[\s\S]*?gestureSettings: loadedMapGestureSettings[\s\S]*?setMapGestureSettings\(loadedMapGestureSettings\)/,
        );
        assert.match(cameraChangedHandler, /angle\.value = nextHeading/);
        assert.match(cameraChangedHandler, /setDisplayDegrees\(nextHeading\)/);
        assert.match(mapIdleHandler, /onChange\?\.\(nextHeading\)/);
        assert.match(
            mapIdleHandler,
            /centerCoordinate: \[[\s\S]*?fixedCenter\.longitude,[\s\S]*?fixedCenter\.latitude/,
        );
    });

    test('animates chip selection along the shortest heading path', () => {
        assert.match(
            compassDialSource,
            /function getClosestEquivalentAngle\(currentAngle, targetAngle\)/,
        );
        assert.match(
            compassDialSource,
            /angle\.value = withTiming\([\s\S]*?getClosestEquivalentAngle\(angle\.value, normalizedValue\)[\s\S]*?duration: COMPASS_DIRECTION_ANIMATION_DURATION_MS[\s\S]*?Easing\.bezier\(0\.22, 0\.8, 0\.3, 1\)/,
        );
        assert.match(
            compassDialSource,
            /schedulePreviewCameraHeading\(normalizedValue, true\)/,
        );
    });

    test('places zoom controls and six-decimal coordinates below the dial with no recenter', () => {
        const detectorCloseIndex =
            compassDialSource.lastIndexOf('</GestureDetector>');
        const controlsIndex = compassDialSource.indexOf(
            'testID={`${dialTestID}-controls`}',
            detectorCloseIndex,
        );
        const coordinatesIndex = compassDialSource.indexOf(
            'testID={`${dialTestID}-coordinates`}',
            controlsIndex,
        );

        assert.ok(detectorCloseIndex >= 0);
        assert.ok(controlsIndex > detectorCloseIndex);
        assert.ok(coordinatesIndex > controlsIndex);
        assert.match(
            compassDialSource,
            /h-\[46px\] w-\[46px\][\s\S]*?gap-2\.5/,
        );
        assert.match(
            compassDialSource,
            /latitude\.toFixed\(6\)[\s\S]*?longitude\.toFixed\(6\)/,
        );
        assert.doesNotMatch(compassDialSource, /recenter/i);
    });

    test('receives the edited node location on both screens', () => {
        assert.match(
            cameraDetailsScreenSource,
            /<CompassDial[\s\S]*?directions=\{directions\}[\s\S]*?location=\{pin\}[\s\S]*?onLocationChange=\{handleLocationChange\}[\s\S]*?selectedDirectionIndex=\{selectedDirectionIndex\}/,
        );
        assert.match(
            editCameraScreenSource,
            /<CompassDial[\s\S]*?directions=\{directions\}[\s\S]*?location=\{nodeLocation\}[\s\S]*?onLocationChange=\{handleLocationChange\}[\s\S]*?selectedDirectionIndex=\{[\s\S]*?selectedDirectionIndex[\s\S]*?\}/,
        );
        assert.match(cameraDetailsScreenSource, /Slide[\s\S]*?the imagery/);
        assert.match(editCameraScreenSource, /Slide[\s\S]*?the imagery/);
    });
});
