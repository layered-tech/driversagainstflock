import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tvActionPlace } from '../tv-actions.js';
import { areaCenterFromParams } from '../../areas/area-location-params.js';

test('received camera exposes only a map location', () => {
    const action = {
        id: 'test',
        type: 'camera',
        payload: {
            latitude: 37.8,
            longitude: -122.2,
            street: 'Grand Ave',
            startNavigation: true,
        },
    };
    const request = tvActionPlace(action);
    assert.equal(request.name, 'Grand Ave');
    assert.deepEqual(request, {
        name: 'Grand Ave',
        latitude: 37.8,
        longitude: -122.2,
    });
    assert.equal(request.startNavigation, undefined);
    assert.equal(request.drivingModeIsActive, undefined);
});
test('invalid received locations and unknown operations cannot open a shared place', () => {
    for (const payload of [
        { latitude: 91, longitude: 0 },
        { latitude: '37', longitude: 0 },
        { latitude: 0, longitude: Infinity },
    ]) {
        assert.equal(tvActionPlace({ type: 'camera', payload }), null);
    }
    assert.equal(
        tvActionPlace({
            type: 'start-driving',
            payload: { latitude: 0, longitude: 0 },
        }),
        null,
    );
});
test('area prefill accepts valid zero coordinates and rejects empty or malformed values', () => {
    assert.deepEqual(
        areaCenterFromParams({ latitude: '0', longitude: '0' }),
        [0, 0],
    );
    assert.deepEqual(
        areaCenterFromParams({ latitude: '37.8', longitude: '-122.2' }),
        [-122.2, 37.8],
    );
    for (const params of [
        {},
        { latitude: '', longitude: '' },
        { latitude: '91', longitude: '0' },
        { latitude: 'hi', longitude: '0' },
        { latitude: 1, longitude: 2 },
    ])
        assert.equal(areaCenterFromParams(params), null);
});
