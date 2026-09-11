import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { getStateCodeForCoordinate } from '../local-state-geometry.js';

const boundaries = JSON.parse(
    readFileSync(new URL('../us-state-boundaries.json', import.meta.url)),
);

describe('offline starting-state resolution', () => {
    test('resolves states and DC without making a geocoding request', () => {
        assert.equal(
            getStateCodeForCoordinate([-97.7431, 30.2672], boundaries),
            'TX',
        );
        assert.equal(
            getStateCodeForCoordinate([-122.4194, 37.7749], boundaries),
            'CA',
        );
        assert.equal(
            getStateCodeForCoordinate([-77.0369, 38.9072], boundaries),
            'DC',
        );
    });

    test('returns null in an ambiguous border band', () => {
        const adjacentSquares = {
            features: [
                {
                    geometry: {
                        coordinates: [
                            [
                                [0, 0],
                                [1, 0],
                                [1, 1],
                                [0, 1],
                                [0, 0],
                            ],
                        ],
                        type: 'Polygon',
                    },
                    properties: { stateCode: 'AA' },
                },
                {
                    geometry: {
                        coordinates: [
                            [
                                [1, 0],
                                [2, 0],
                                [2, 1],
                                [1, 1],
                                [1, 0],
                            ],
                        ],
                        type: 'Polygon',
                    },
                    properties: { stateCode: 'BB' },
                },
            ],
        };

        assert.equal(
            getStateCodeForCoordinate([0.999, 0.5], adjacentSquares, {
                borderAmbiguityMeters: 500,
            }),
            null,
        );
        assert.equal(
            getStateCodeForCoordinate([0.5, 0.5], adjacentSquares, {
                borderAmbiguityMeters: 500,
            }),
            'AA',
        );
    });
});
