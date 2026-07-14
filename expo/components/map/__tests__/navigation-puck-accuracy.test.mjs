import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    makeNavigationPuckGroundFeatureCollection,
    NAVIGATION_PUCK_ACCURACY_FEATURE_KIND,
    NAVIGATION_PUCK_SHADOW_FEATURE_KIND,
} from '../navigation-puck-accuracy.js';

const EARTH_RADIUS_METERS = 6371008.8;

function getCoordinateDistanceMeters(from, to) {
    const latitudeDelta = ((to[1] - from[1]) * Math.PI) / 180;
    const longitudeDelta = ((to[0] - from[0]) * Math.PI) / 180;
    const fromLatitude = (from[1] * Math.PI) / 180;
    const toLatitude = (to[1] * Math.PI) / 180;
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(fromLatitude) *
            Math.cos(toLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;

    return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

describe('navigation puck ground treatment', () => {
    test('builds a closed geographic circle at the reported accuracy', () => {
        const featureCollection = makeNavigationPuckGroundFeatureCollection(
            {
                accuracy: 32,
                latitude: 41.8781,
                longitude: -87.6298,
            },
            { segmentCount: 16 },
        );
        const accuracyFeature = featureCollection.features.find(
            (feature) =>
                feature.properties.kind ===
                NAVIGATION_PUCK_ACCURACY_FEATURE_KIND,
        );
        const ring = accuracyFeature.geometry.coordinates[0];

        assert.equal(ring.length, 17);
        assert.deepEqual(ring[0], ring.at(-1));

        for (const coordinate of ring.slice(0, -1)) {
            assert.ok(
                Math.abs(
                    getCoordinateDistanceMeters(
                        [-87.6298, 41.8781],
                        coordinate,
                    ) - 32,
                ) < 0.01,
            );
        }
    });

    test('keeps the puck shadow when accuracy is unavailable', () => {
        const featureCollection = makeNavigationPuckGroundFeatureCollection({
            accuracy: -1,
            latitude: 41.8781,
            longitude: -87.6298,
        });

        assert.deepEqual(featureCollection.features, [
            {
                type: 'Feature',
                properties: {
                    kind: NAVIGATION_PUCK_SHADOW_FEATURE_KIND,
                },
                geometry: {
                    type: 'Point',
                    coordinates: [-87.6298, 41.8781],
                },
            },
        ]);
    });

    test('splits accuracy circles that cross the antimeridian', () => {
        for (const longitude of [179.9999, -179.9999]) {
            const featureCollection = makeNavigationPuckGroundFeatureCollection(
                {
                    accuracy: 50,
                    latitude: 0,
                    longitude,
                },
                { segmentCount: 24 },
            );
            const accuracyFeature = featureCollection.features.find(
                (feature) =>
                    feature.properties.kind ===
                    NAVIGATION_PUCK_ACCURACY_FEATURE_KIND,
            );

            assert.equal(accuracyFeature.geometry.type, 'MultiPolygon');
            assert.equal(accuracyFeature.geometry.coordinates.length, 2);

            for (const polygon of accuracyFeature.geometry.coordinates) {
                const ring = polygon[0];

                assert.deepEqual(ring[0], ring.at(-1));
                assert.ok(ring.length >= 4);

                for (const [ringLongitude] of ring) {
                    assert.ok(ringLongitude >= -180 && ringLongitude <= 180);
                }

                for (let index = 1; index < ring.length; index += 1) {
                    assert.ok(
                        Math.abs(ring[index][0] - ring[index - 1][0]) < 1,
                    );
                }
            }
        }
    });

    test('rejects invalid locations', () => {
        assert.deepEqual(
            makeNavigationPuckGroundFeatureCollection({
                accuracy: 20,
                latitude: 91,
                longitude: -87.6298,
            }).features,
            [],
        );
    });
});
