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

describe('CompassDial heading preview', () => {
    test('layers a full-width satellite map beneath the compass', () => {
        const satelliteMapIndex =
            compassDialSource.indexOf('<NativeWindMapView');
        const markerIndex = compassDialSource.indexOf('<Mapbox.MarkerView');
        const coneOverlayIndex = compassDialSource.indexOf(
            '<DirectionConeOverlay',
            markerIndex,
        );
        const mapCloseIndex = compassDialSource.indexOf('</NativeWindMapView>');
        const compassOverlayIndex = compassDialSource.indexOf(
            'style={compassRoseAnimatedStyle}',
        );

        assert.ok(satelliteMapIndex >= 0);
        assert.ok(markerIndex > satelliteMapIndex);
        assert.ok(coneOverlayIndex > markerIndex);
        assert.ok(mapCloseIndex > coneOverlayIndex);
        assert.ok(compassOverlayIndex > mapCloseIndex);
        assert.match(
            compassDialSource,
            /aspect-square w-full overflow-hidden rounded-full/,
        );
        assert.match(
            compassDialSource,
            /styleURL=\{MAPBOX_STANDARD_SATELLITE_STYLE_URL\}/,
        );
        assert.match(compassDialSource, /surfaceView=\{false\}/);
        assert.match(compassDialSource, /scrollEnabled\s/);
        assert.doesNotMatch(compassDialSource, /COMPASS_DIAL_SIZE/);
    });

    test('rotates the satellite camera during the drag', () => {
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
            /cameraRef\.current\?\.setCamera\(\{[\s\S]*?animationDuration: 0,[\s\S]*?heading: pendingPreviewHeadingRef\.current/,
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

    test('uses the main map cone for the live preview zoom', () => {
        assert.match(
            compassDialSource,
            /function getCompassConeStyle\(zoomLevel\)[\s\S]*?coneStyle\.minZoom <= zoomLevel/,
        );
        assert.match(
            compassDialSource,
            /setPreviewConeStyle\([\s\S]*?nextConeStyle\.minZoom/,
        );
        assert.match(
            compassDialSource,
            /<DirectionConeOverlay[\s\S]*?coneStyle=\{previewConeStyle\}/,
        );
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
    });
});
