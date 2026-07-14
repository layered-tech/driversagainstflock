import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getMapLayerSlots } from '../map-layer-slots.js';

describe('Mapbox Standard layer slots', () => {
    test('orders Android Auto cameras above a middle-slot route and puck', () => {
        assert.deepEqual(
            getMapLayerSlots({
                navigationPuckVariant: 'auto-play',
                platform: 'android',
            }),
            {
                cameraCone: 'top',
                cameraNode: 'top',
                routePath: 'middle',
                userLocationPuck: 'middle',
                userLocationPuckAboveLayer: 'directions-route-line',
            },
        );
    });

    test('preserves the existing layer order outside Android Auto', () => {
        for (const options of [
            { navigationPuckVariant: 'auto-play', platform: 'ios' },
            { navigationPuckVariant: 'default', platform: 'android' },
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
