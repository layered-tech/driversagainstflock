import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const drivingGuidanceOverlaySource = readFileSync(
    new URL('../driving-guidance-overlay.js', import.meta.url),
    'utf8',
);
const drivingLocationRoadStackSource = readFileSync(
    new URL('../driving-location-road-stack.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
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

    test('hides speed status and the current road pill in route mode', () => {
        assert.match(
            mapScreenSource,
            /drivingStatusIsVisible=\{shouldShowDrivingMapStatus\(\s*drivingMapViewMode,?\s*\)\}/,
        );
        assert.match(
            drivingGuidanceOverlaySource,
            /\{drivingStatusIsVisible \? \([\s\S]*?<SpeedLimitSign[\s\S]*?\) : null\}/,
        );
        assert.match(
            drivingGuidanceOverlaySource,
            /<DrivingLocationRoadStack\s+currentRoadPillIsVisible=\{drivingStatusIsVisible\}/,
        );
        assert.match(
            drivingLocationRoadStackSource,
            /currentRoadPillIsVisible &&[\s\S]*?shouldShowCurrentRoadPill/,
        );
    });
});
