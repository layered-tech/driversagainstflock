import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const drivingGuidanceOverlaySource = readFileSync(
    new URL('../driving-guidance-overlay.js', import.meta.url),
    'utf8',
);

describe('DrivingGuidanceOverlay', () => {
    test('keeps the route-switched destination surface free of NativeWind shadows', () => {
        assert.doesNotMatch(
            drivingGuidanceOverlaySource,
            /overflow-hidden shadow-/,
        );
        assert.match(
            drivingGuidanceOverlaySource,
            /borderTopColor: bottomSheetTheme\.border\.glass/,
        );
    });
});
