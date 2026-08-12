import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    makeMarkerConeFeatureCollection,
    makeMarkerConeFeatures,
} from '../marker-cones.js';

const markerFeature = {
    geometry: {
        coordinates: [-87.9065, 43.0389],
        type: 'Point',
    },
    properties: {
        direction: '90;270',
        id: 'osm-node-1',
    },
    type: 'Feature',
};

describe('makeMarkerConeFeatures', () => {
    test('creates a closed polygon for every marker direction', () => {
        const features = makeMarkerConeFeatures(markerFeature);

        assert.equal(features.length, 2);
        assert.deepEqual(
            features.map((feature) => feature.properties),
            [
                { directionIndex: 0, markerId: 'osm-node-1' },
                { directionIndex: 1, markerId: 'osm-node-1' },
            ],
        );

        for (const feature of features) {
            assert.equal(feature.geometry.type, 'Polygon');
            assert.equal(feature.geometry.coordinates[0].length, 5);
            assert.deepEqual(
                feature.geometry.coordinates[0][0],
                feature.geometry.coordinates[0][4],
            );
        }

        assert.ok(
            features[0].geometry.coordinates[0][2][0] >
                markerFeature.geometry.coordinates[0],
        );
        assert.ok(
            features[1].geometry.coordinates[0][2][0] <
                markerFeature.geometry.coordinates[0],
        );
    });

    test('returns no polygons when a marker has no valid direction', () => {
        assert.deepEqual(
            makeMarkerConeFeatures({
                ...markerFeature,
                properties: { direction: 'unknown', id: 'osm-node-2' },
            }),
            [],
        );
    });
});

describe('makeMarkerConeFeatureCollection', () => {
    test('derives cones directly from normalized marker features', () => {
        const collection = makeMarkerConeFeatureCollection([
            markerFeature,
            {
                ...markerFeature,
                properties: { direction: 'N', id: 'osm-node-2' },
            },
        ]);

        assert.equal(collection.type, 'FeatureCollection');
        assert.equal(collection.features.length, 3);
    });
});
