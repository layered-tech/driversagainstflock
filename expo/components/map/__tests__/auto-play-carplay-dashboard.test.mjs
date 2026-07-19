import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const iosPlatformSource = readFileSync(
    new URL('../../auto-play-platform.ios.js', import.meta.url),
    'utf8',
);
const mapTemplateSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/ios/templates/MapTemplate.swift',
        import.meta.url,
    ),
    'utf8',
);
const autoPlayPatch = readFileSync(
    new URL(
        '../../../patches/@iternio+react-native-auto-play+0.4.7.patch',
        import.meta.url,
    ),
    'utf8',
);

test('CarPlay reapplies Dashboard shortcuts after its scene connects', () => {
    assert.match(
        iosPlatformSource,
        /applyDashboardButtons\(CarPlayDashboard, makeGlyphImage\);[\s\S]*?CarPlayDashboard\.addListener\('didConnect',[\s\S]*?applyDashboardButtons\(CarPlayDashboard, makeGlyphImage\)/,
    );
});

test('CarPlay refreshes the active maneuver estimate after publishing maneuvers', () => {
    for (const source of [mapTemplateSource, autoPlayPatch]) {
        assert.match(source, /for: sessionManeuvers\[maneuverIndex\]/);
        assert.match(
            source,
            /navigationSession\.upcomingManeuvers = upcomingManeuvers[\s\S]*?let currentManeuver = navigationSession\.upcomingManeuvers\.first[\s\S]*?navigationSession\.updateEstimates\([\s\S]*?for: currentManeuver/,
        );
    }
});

test('CarPlay removes the idle Car action but retains navigation exit support', () => {
    assert.match(iosPlatformSource, /usesHeaderDrivingModeButton:\s*false/);
    assert.match(iosPlatformSource, /usesHeaderExitNavigationButton:\s*true/);
});
