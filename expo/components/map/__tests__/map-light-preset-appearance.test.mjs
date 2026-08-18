import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mapLightPresetUsesDarkAppearance } from '../map-light-preset-appearance.js';

describe('map light preset appearance', () => {
    test('uses dark presentation for dusk and night only', () => {
        assert.equal(mapLightPresetUsesDarkAppearance('auto'), false);
        assert.equal(mapLightPresetUsesDarkAppearance('dawn'), false);
        assert.equal(mapLightPresetUsesDarkAppearance('day'), false);
        assert.equal(mapLightPresetUsesDarkAppearance('dusk'), true);
        assert.equal(mapLightPresetUsesDarkAppearance('night'), true);
    });
});
