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

    test('chunks long drives within the waypoint limit and stitches their routes', async () => {
        const longDriveExposures = Array.from({ length: 13 }, (_, index) => ({
            cameraCoordinate: [-97.8 + index / 100, 30.2 + index / 100],
            id: `long-drive-${index}`,
            occurredAt: 1000 + index,
            sessionId: 'long-drive',
        }));
        const requests = [];
        const signal = AbortSignal.timeout(1000);
        const requestDirections = async (request) => {
            requests.push(request);

            return {
                route: {
                    routes: {
                        direct: {
                            coordinates: [
                                request.start,
                                ...request.waypoints,
                                request.end,
                            ].map(({ latitude, longitude }) => [
                                longitude,
                                latitude,
                            ]),
                        },
                    },
                },
            };
        };

        const collection = await getScorecardFastestTrailLineCollection({
            exposures: longDriveExposures,
            requestDirections,
            signal,
        });

        assert.equal(requests.length, 2);
        assert.deepEqual(
            requests.map(({ signal: requestSignal, waypoints }) => ({
                signal: requestSignal,
                waypointCount: waypoints.length,
            })),
            [
                { signal, waypointCount: 10 },
                { signal, waypointCount: 0 },
            ],
        );
        assert.deepEqual(
            collection.features[0].geometry.coordinates,
            longDriveExposures.map(({ cameraCoordinate }) => cameraCoordinate),
        );

        await getScorecardFastestTrailLineCollection({
            exposures: longDriveExposures,
            requestDirections,
            signal,
        });

        assert.equal(requests.length, 2);
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
