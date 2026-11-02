import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaCameraCones } from '../area-camera-cones.js';

test('area camera cones use the recorded bearing and preserve real camera coordinates', () => {
    const camera = {
        id: 42,
        longitude: -122.2,
        latitude: 37.8,
        direction: 'N',
        kind: 'added',
    };
    const shape = areaCameraCones([camera]);
    assert.equal(shape.features.length, 1);
    const ring = shape.features[0].geometry.coordinates[0];
    assert.deepEqual(ring[0], [-122.2, 37.8]);
    assert.deepEqual(ring.at(-1), ring[0]);
    assert.ok(ring.slice(1, -1).every((point) => point[1] > 37.8));
    assert.equal(shape.features[0].properties.kind, 'added');
});

test('unknown bearings and invalid coordinates never fabricate a camera cone', () => {
    assert.deepEqual(
        areaCameraCones([
            { id: 1, longitude: -122, latitude: 37, direction: null },
            { id: 2, longitude: null, latitude: 37, direction: '90' },
        ]).features,
        [],
    );
});
