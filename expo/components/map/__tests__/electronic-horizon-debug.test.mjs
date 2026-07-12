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

    test('renders only the most probable path and each branch with probability labels', () => {
        const featureCollection = makeElectronicHorizonDebugFeatureCollection(
            {
                primaryPath: {
                    coordinates: [
                        [-97.2, 32.7],
                        [-97.19, 32.71],
                    ],
                    probability: 0.92,
                },
                branches: [
                    {
                        coordinates: [
                            [-97.19, 32.71],
                            [-97.18, 32.7],
                        ],
                        level: 1,
                        probability: 0.41,
                    },
                    {
                        coordinates: [
                            [-97.19, 32.71],
                            [-97.18, 32.72],
                        ],
                        level: 2,
                        probability: 0.17,
                    },
                ],
            },
            true,
        );
        const pathFeatures = featureCollection.features.filter(
            (feature) => feature.geometry.type === 'LineString',
        );
        const probabilityFeatures = featureCollection.features.filter(
            (feature) => feature.geometry.type === 'Point',
        );

        assert.equal(pathFeatures.length, 3);
        assert.equal(probabilityFeatures.length, 3);
        assert.equal(
            pathFeatures[0].properties.color,
            ELECTRONIC_HORIZON_DEBUG_PRIMARY_PATH_COLOR,
        );
        assert.deepEqual(
            probabilityFeatures.map(
                (feature) => feature.properties.probabilityLabel,
            ),
            ['92%', '41%', '17%'],
        );
        assert.notEqual(
            pathFeatures[1].properties.color,
            pathFeatures[2].properties.color,
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
                branches: [
                    {
                        coordinates: [
                            [-97.2, 32.7],
                            [-97.19, 32.71],
                        ],
                        probability: 45,
                    },
                ],
            },
            true,
        );

        assert.equal(featureCollection.features.length, 2);
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
