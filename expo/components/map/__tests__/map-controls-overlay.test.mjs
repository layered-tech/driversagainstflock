import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const mapControlsOverlaySource = readFileSync(
    new URL('../map-controls-overlay.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);

describe('MapControlsOverlay', () => {
    test('hides the free-drive control during route navigation', () => {
        assert.match(mapControlsOverlaySource, /showFreeDriveButton = true/);
        assert.match(mapControlsOverlaySource, /\{showFreeDriveButton \? \(/);
        assert.match(
            mapScreenSource,
            /const freeDriveIsActive = isDrivingMode && !selectedDirectionsRouteOption/,
        );
        assert.match(
            mapScreenSource,
            /<MapControlsOverlay\s+showFreeDriveButton=\{freeDriveIsActive\}/,
        );
    });

    test('shows the drawer button first during active route navigation', () => {
        assert.match(mapControlsOverlaySource, /showDrawerButton = false/);
        assert.match(
            mapControlsOverlaySource,
            /\{showDrawerButton \? \([\s\S]*?accessibilityLabel="Open menu"[\s\S]*?testID="driving-drawer-button"[\s\S]*?\) : null\}\s*\n\s*<MapLayerButton/,
        );
        assert.match(
            mapScreenSource,
            /<MapControlsOverlay\s+showFreeDriveButton=\{freeDriveIsActive\}\s+onDrawerPress=\{\s*searchController\.handleDrawerPress\s*\}\s+showDrawerButton=\{Boolean\(\s*selectedDirectionsRouteOption,\s*\)\}/,
        );
    });

    test('exits free drive when mobile search opens', () => {
        assert.match(
            mapScreenSource,
            /if \(!freeDriveIsActive \|\| !searchController\.searchPageIsVisible\) \{[\s\S]*?logMapDrivingStopped\(\{ route: null \}\);[\s\S]*?setDrivingModeIsActive\(false\);/,
        );
    });

    test('visually centers the free-drive icon with a subtle optical offset', () => {
        assert.match(
            mapControlsOverlaySource,
            /<View className="-translate-x-px translate-y-px">[\s\S]*?<Icon[\s\S]*?name=\{freeDriveIsActive \? 'x' : 'navigation'\}/,
        );
    });
});
