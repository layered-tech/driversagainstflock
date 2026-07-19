import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getMapLayerSlots } from '../map-layer-slots.js';

describe('Mapbox Standard layer slots', () => {
    test('keeps the Android Auto puck above routes without a transient layer anchor', () => {
        assert.deepEqual(
            getMapLayerSlots({
                navigationPuckVariant: 'auto-play',
                platform: 'android',
            }),
            {
                cameraCone: 'top',
                cameraNode: 'top',
                routePath: 'middle',
                userLocationPuck: 'top',
                userLocationPuckAboveLayer: undefined,
            },
        );
    });

    test('places the CarPlay puck above slotted route layers', () => {
        assert.deepEqual(
            getMapLayerSlots({
                navigationPuckVariant: 'auto-play',
                platform: 'ios',
            }),
            {
                cameraCone: undefined,
                cameraNode: undefined,
                routePath: 'top',
                userLocationPuck: undefined,
                userLocationPuckAboveLayer: undefined,
            },
        );
    });

    test('preserves the existing layer order outside car-host pucks', () => {
        for (const options of [
            { navigationPuckVariant: 'default', platform: 'android' },
            { navigationPuckVariant: 'default', platform: 'ios' },
            { navigationPuckVariant: 'auto-play', platform: 'web' },
        ]) {
            assert.deepEqual(getMapLayerSlots(options), {
                cameraCone: undefined,
                cameraNode: undefined,
                routePath: 'top',
                userLocationPuck: undefined,
                userLocationPuckAboveLayer: undefined,
            });
        }
    });
});
