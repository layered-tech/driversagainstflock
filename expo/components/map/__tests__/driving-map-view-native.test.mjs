import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { URL } from 'node:url';

const locationPuckBridgeSource = readFileSync(
    new URL('../location-puck-3d.js', import.meta.url),
    'utf8',
);
const iosLocationPuckSource = readFileSync(
    new URL(
        '../../../modules/map-location-puck/ios/MapLocationPuckModule.swift',
        import.meta.url,
    ),
    'utf8',
);
const androidLocationPuckSource = readFileSync(
    new URL(
        '../../../modules/map-location-puck/android/src/main/java/expo/modules/maplocationpuck/MapLocationPuckModule.kt',
        import.meta.url,
    ),
    'utf8',
);

describe('native driving map view follow', () => {
    test('passes whether perspective follow is enabled through the bridge', () => {
        assert.match(
            locationPuckBridgeSource,
            /setLocationPuckCameraFollow\([\s\S]*?followProps\?\.enabled === true/,
        );
    });

    test('keeps perspective heading-following on iOS', () => {
        assert.match(iosLocationPuckSource, /options\.bearing = \.heading/);
    });

    test('keeps perspective heading-following on Android', () => {
        assert.match(
            androidLocationPuckSource,
            /\.bearing\(FollowPuckViewportStateBearing\.SyncWithLocationPuck\)/,
        );
    });
});
