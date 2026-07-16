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
});
