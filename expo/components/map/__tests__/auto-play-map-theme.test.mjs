import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveAutoPlayMapLightPresetPreference } from '../../auto-play-map-theme.js';

const AUTO = 'auto';
const DAWN = 'dawn';
const DAY = 'day';
const DUSK = 'dusk';
const NIGHT = 'night';

describe('Auto Play map theme', () => {
    test('Android Auto follows the light host scheme in Auto mode even with a location', () => {
        assert.equal(
            resolveAutoPlayMapLightPresetPreference({
                colorScheme: 'light',
                lightPresetPreference: AUTO,
                userLocation: { latitude: 41.8781, longitude: -87.6298 },
                usesHostColorSchemeForAutomaticMapPreset: true,
            }),
            DAY,
        );
    });

    test('Android Auto follows the dark host scheme in Auto mode even with a location', () => {
        assert.equal(
            resolveAutoPlayMapLightPresetPreference({
                colorScheme: 'dark',
                lightPresetPreference: AUTO,
                userLocation: { latitude: 41.8781, longitude: -87.6298 },
                usesHostColorSchemeForAutomaticMapPreset: true,
            }),
            NIGHT,
        );
    });

    test('Android Auto tracks live light, dark, and light host transitions', () => {
        const resolvedPresets = ['light', 'dark', 'light'].map((colorScheme) =>
            resolveAutoPlayMapLightPresetPreference({
                colorScheme,
                lightPresetPreference: AUTO,
                usesHostColorSchemeForAutomaticMapPreset: true,
            }),
        );

        assert.deepEqual(resolvedPresets, [DAY, NIGHT, DAY]);
    });

    test('Android Auto preserves every explicit light preset override', () => {
        for (const lightPresetPreference of [DAWN, DAY, DUSK, NIGHT]) {
            assert.equal(
                resolveAutoPlayMapLightPresetPreference({
                    colorScheme:
                        lightPresetPreference === NIGHT ? 'light' : 'dark',
                    lightPresetPreference,
                    usesHostColorSchemeForAutomaticMapPreset: true,
                }),
                lightPresetPreference,
            );
        }
    });

    test('CarPlay and phone-style callers retain automatic solar resolution', () => {
        for (const colorScheme of ['light', 'dark']) {
            assert.equal(
                resolveAutoPlayMapLightPresetPreference({
                    colorScheme,
                    lightPresetPreference: AUTO,
                    usesHostColorSchemeForAutomaticMapPreset: false,
                }),
                AUTO,
            );

            assert.equal(
                resolveAutoPlayMapLightPresetPreference({
                    colorScheme,
                    lightPresetPreference: AUTO,
                }),
                AUTO,
            );
        }
    });
});
