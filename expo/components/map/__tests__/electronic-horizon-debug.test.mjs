import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    ELECTRONIC_HORIZON_DEBUG_PRIMARY_PATH_COLOR,
    formatElectronicHorizonProbability,
    getElectronicHorizonPathMidpoint,
    makeElectronicHorizonDebugFeatureCollection,
} from '../electronic-horizon-debug.js';

describe('Electronic Horizon debug geometry', () => {
    test('does not expose geometry until its debug toggle is enabled', () => {
        assert.deepEqual(
            makeElectronicHorizonDebugFeatureCollection(
                {
                    primaryPath: {
                        coordinates: [
                            [-97.2, 32.7],
                            [-97.19, 32.71],
                        ],
                        probability: 1,
                    },
                },
                false,
            ),
            { features: [], type: 'FeatureCollection' },
        );
    });

    test('renders only the most probable path with probability labels', () => {
        const featureCollection = makeElectronicHorizonDebugFeatureCollection(
            {
                primaryPath: {
                    coordinates: [
                        [-97.2, 32.7],
                        [-97.19, 32.71],
                    ],
                    probability: 0.92,
                },
            },
            true,
        );
        const pathFeatures = featureCollection.features.filter(
            (feature) => feature.geometry.type === 'LineString',
        );
        const probabilityFeatures = featureCollection.features.filter(
            (feature) => feature.geometry.type === 'Point',
        );

        assert.equal(pathFeatures.length, 1);
        assert.equal(probabilityFeatures.length, 1);
        assert.equal(
            pathFeatures[0].properties.color,
            ELECTRONIC_HORIZON_DEBUG_PRIMARY_PATH_COLOR,
        );
        assert.deepEqual(
            probabilityFeatures.map(
                (feature) => feature.properties.probabilityLabel,
            ),
            ['92%'],
        );
    });

    test('filters invalid geometry and formats SDK probability values safely', () => {
        const featureCollection = makeElectronicHorizonDebugFeatureCollection(
            {
                primaryPath: {
                    coordinates: [
                        [-97.2, 32.7],
                        ['invalid', 32.71],
                    ],
                },
            },
            true,
        );

        assert.equal(featureCollection.features.length, 0);
        assert.equal(formatElectronicHorizonProbability(0.4), '40%');
        assert.equal(formatElectronicHorizonProbability(45), '45%');
        assert.equal(formatElectronicHorizonProbability(-1), null);
    });

    test('places the probability label at the traveled midpoint of a path', () => {
        const midpoint = getElectronicHorizonPathMidpoint([
            [-97.2, 32.7],
            [-97.19, 32.7],
            [-97.19, 32.72],
        ]);

        assert.ok(midpoint[0] > -97.2);
        assert.ok(midpoint[0] < -97.19 || midpoint[1] > 32.7);
    });
});
