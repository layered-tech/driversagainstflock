import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getScorecardFastestTrailLineCollection } from '../scorecard-fastest-trail.js';

const exposures = [
    {
        cameraCoordinate: [-97.8, 30.2],
        id: 'one',
        occurredAt: 1000,
        sessionId: 'drive-one',
    },
    {
        cameraCoordinate: [-97.7, 30.3],
        id: 'three',
        occurredAt: 3000,
        sessionId: 'drive-one',
    },
    {
        cameraCoordinate: [-97.75, 30.25],
        id: 'two',
        occurredAt: 2000,
        sessionId: 'drive-one',
    },
    {
        cameraCoordinate: [-97.6, 30.4],
        id: 'other-drive',
        occurredAt: 4000,
        sessionId: 'drive-two',
    },
];

describe('scorecard fastest reconstructed trail', () => {
    test('requests one fastest route through each drive reads in time order', async () => {
        const requests = [];
        const collection = await getScorecardFastestTrailLineCollection({
            exposures,
            requestDirections: async (request) => {
                requests.push(request);

                return {
                    route: {
                        routes: {
                            direct: {
                                coordinates: [
                                    [-97.8, 30.2],
                                    [-97.77, 30.23],
                                    [-97.7, 30.3],
                                ],
                            },
                        },
                    },
                };
            },
        });

        assert.equal(requests.length, 1);
        assert.deepEqual(requests[0].start, {
            latitude: 30.2,
            longitude: -97.8,
        });
        assert.deepEqual(requests[0].waypoints, [
            { latitude: 30.25, longitude: -97.75 },
        ]);
        assert.deepEqual(requests[0].end, {
            latitude: 30.3,
            longitude: -97.7,
        });
        assert.deepEqual(collection.features[0].geometry.coordinates, [
            [-97.8, 30.2],
            [-97.77, 30.23],
            [-97.7, 30.3],
        ]);
    });

    test('fails silently without falling back to straight lines', async () => {
        const collection = await getScorecardFastestTrailLineCollection({
            exposures: exposures.map((exposure) => ({
                ...exposure,
                sessionId: 'uncached-drive',
            })),
            requestDirections: async () => {
                throw new Error('offline');
            },
        });

        assert.deepEqual(collection.features, []);
    });
});
