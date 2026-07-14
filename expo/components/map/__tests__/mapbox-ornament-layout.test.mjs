import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getMapboxCompassSafeAreaInsets } from '../mapbox-ornament-layout.js';

describe('Mapbox ornament layout', () => {
    test('applies the horizontal safe-area inset to Android compass placement', () => {
        assert.deepEqual(
            getMapboxCompassSafeAreaInsets({
                insets: { bottom: 40, left: 24, right: 0, top: 8 },
                platformOS: 'android',
            }),
            {
                bottom: 40,
                left: 24,
                top: 8,
            },
        );
    });

    test('leaves CarPlay compass safe-area placement to Mapbox', () => {
        assert.deepEqual(
            getMapboxCompassSafeAreaInsets({
                insets: { bottom: 40, left: 24, right: 0, top: 8 },
                platformOS: 'ios',
            }),
            {
                bottom: 0,
                left: 0,
                top: 0,
            },
        );
    });
});
