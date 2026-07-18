import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getNodeLocationFromMapFeature,
    normalizeNodeLocation,
    updatePinLocationInList,
} from '../node-location.js';

describe('normalizeNodeLocation', () => {
    test('keeps valid coordinates including zero', () => {
        assert.deepEqual(normalizeNodeLocation({ latitude: 0, longitude: 0 }), {
            latitude: 0,
            longitude: 0,
        });
        assert.deepEqual(
            normalizeNodeLocation({
                latitude: 37.7832121,
                longitude: -122.4074189,
            }),
            {
                latitude: 37.7832121,
                longitude: -122.4074189,
            },
        );
    });

    test('rejects missing, non-finite, and out-of-range coordinates', () => {
        assert.equal(normalizeNodeLocation(null), null);
        assert.equal(
            normalizeNodeLocation({ latitude: Number.NaN, longitude: 0 }),
            null,
        );
        assert.equal(
            normalizeNodeLocation({ latitude: 91, longitude: 0 }),
            null,
        );
        assert.equal(
            normalizeNodeLocation({ latitude: 0, longitude: -181 }),
            null,
        );
    });
});

describe('getNodeLocationFromMapFeature', () => {
    test('converts Mapbox longitude-latitude order to node location fields', () => {
        assert.deepEqual(
            getNodeLocationFromMapFeature({
                geometry: {
                    coordinates: [-122.4075123, 37.7831987],
                    type: 'Point',
                },
                type: 'Feature',
            }),
            {
                latitude: 37.7831987,
                longitude: -122.4075123,
            },
        );
    });

    test('rejects invalid map features', () => {
        assert.equal(getNodeLocationFromMapFeature(null), null);
        assert.equal(
            getNodeLocationFromMapFeature({
                geometry: { coordinates: [181, 0] },
            }),
            null,
        );
    });
});

describe('updatePinLocationInList', () => {
    test('moves only the matching pin and preserves its details', () => {
        const pins = [
            {
                details: { directions: [90], manufacturer: 'flock' },
                id: 'pin-1',
                latitude: 37.78,
                longitude: -122.41,
            },
            {
                details: { directions: [180], manufacturer: 'motorola' },
                id: 'pin-2',
                latitude: 37.79,
                longitude: -122.42,
            },
        ];

        const updatedPins = updatePinLocationInList(pins, 'pin-2', {
            latitude: 37.791,
            longitude: -122.421,
        });

        assert.equal(updatedPins[0], pins[0]);
        assert.deepEqual(updatedPins[1], {
            details: { directions: [180], manufacturer: 'motorola' },
            id: 'pin-2',
            latitude: 37.791,
            longitude: -122.421,
        });
    });

    test('does not mutate pins for invalid coordinates', () => {
        const pins = [{ id: 'pin-1', latitude: 0, longitude: 0 }];

        assert.equal(
            updatePinLocationInList(pins, 'pin-1', {
                latitude: 100,
                longitude: 0,
            }),
            pins,
        );
    });
});
