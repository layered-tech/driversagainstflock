import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeMapboxColor } from '../mapbox-colors.js';

describe('normalizeMapboxColor', () => {
    test('converts production-minified hex colors with alpha to rgba', () => {
        assert.equal(
            normalizeMapboxColor('#ff4d4f4d'),
            'rgba(255,77,79,0.30196078431372547)',
        );
        assert.equal(
            normalizeMapboxColor('#f44d'),
            'rgba(255,68,68,0.8666666666666667)',
        );
    });

    test('preserves colors already supported by Mapbox', () => {
        assert.equal(normalizeMapboxColor('#ff4d4f'), '#ff4d4f');
        assert.equal(
            normalizeMapboxColor('rgba(255,77,79,0.30)'),
            'rgba(255,77,79,0.30)',
        );
    });
});
