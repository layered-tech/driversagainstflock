import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getDirectionsRouteCoordinatesAhead,
    getElectronicHorizonPathPosition,
    getUpcomingElectronicHorizonAlerts,
    normalizeElectronicHorizon,
} from '../electronic-horizon.js';

const primaryPath = [
    [-97.7431, 30.2672],
    [-97.7331, 30.2672],
];

describe('Electronic Horizon geometry', () => {
    test('normalizes native coordinates into the shared GeoJSON contract', () => {
        const horizon = normalizeElectronicHorizon({
            branches: [
                {
                    coordinates: [
                        { latitude: 30.2672, longitude: -97.738 },
                        { latitude: 30.27, longitude: -97.738 },
                    ],
                    edgeId: 22,
                    level: 1,
                    probability: 0.3,
                },
            ],
            primaryPath: {
                coordinates: primaryPath,
                segments: [
                    {
                        coordinates: primaryPath,
                        edgeId: 11,
                        probability: 1,
                    },
                ],
            },
            updatedAt: 123,
        });

        assert.deepEqual(horizon.primaryPath.coordinates, primaryPath);
        assert.deepEqual(horizon.branches[0].coordinates, [
            [-97.738, 30.2672],
            [-97.738, 30.27],
        ]);
        assert.equal(horizon.branches[0].level, 1);
    });

    test('calculates a location distance along the primary path', () => {
        const position = getElectronicHorizonPathPosition(
            primaryPath,
            [-97.7381, 30.2672],
        );

        assert.ok(position.distanceAheadMeters > 400);
        assert.ok(position.distanceAheadMeters < 600);
        assert.ok(position.distanceFromPathMeters < 1);
    });
});

describe('upcoming Electronic Horizon alerts', () => {
    test('uses only the primary most-probable path, never a branch', () => {
        const alerts = getUpcomingElectronicHorizonAlerts({
            alprNodes: [
                {
                    coordinate: [-97.7381, 30.2672],
                    id: 'primary-alpr',
                    osmId: 1,
                    tags: { name: 'Primary reader' },
                },
                {
                    coordinate: [-97.738, 30.27],
                    id: 'branch-alpr',
                    osmId: 2,
                },
            ],
            electronicHorizon: {
                branches: [
                    {
                        coordinates: [
                            [-97.738, 30.2672],
                            [-97.738, 30.27],
                        ],
                        edgeId: 'branch',
                        level: 1,
                        probability: 0.3,
                    },
                ],
                primaryPath: { coordinates: primaryPath },
            },
            policeAlerts: [
                {
                    coordinate: [-97.735, 30.2672],
                    id: 'primary-police',
                    street: 'Primary Street',
                },
                {
                    coordinate: [-97.738, 30.27],
                    id: 'branch-police',
                    street: 'Branch Street',
                },
            ],
        });

        assert.deepEqual(
            alerts.map((alert) => alert.id),
            ['primary-alpr', 'primary-police'],
        );
        assert.deepEqual(
            alerts.map((alert) => alert.type),
            ['alpr', 'police'],
        );
        assert.ok(alerts[0].distanceMeters < alerts[1].distanceMeters);
    });

    test('uses the active directions route instead of an inferred horizon path', () => {
        const activeRoutePath = [
            [-97.7431, 30.2672],
            [-97.7431, 30.2772],
        ];
        const alerts = getUpcomingElectronicHorizonAlerts({
            alprNodes: [
                { coordinate: [-97.7381, 30.2672], id: 'inferred-alpr' },
                { coordinate: [-97.7431, 30.272], id: 'routed-alpr' },
            ],
            electronicHorizon: {
                primaryPath: { coordinates: primaryPath },
            },
            pathCoordinates: activeRoutePath,
            policeAlerts: [
                { coordinate: [-97.738, 30.2672], id: 'inferred-police' },
                { coordinate: [-97.7431, 30.275], id: 'routed-police' },
            ],
        });

        assert.deepEqual(
            alerts.map((alert) => alert.id),
            ['routed-alpr', 'routed-police'],
        );
    });

    test('limits ALPR and Waze alerts to the next mile on routes and horizons', () => {
        const longPath = [
            [-97.7431, 30.2672],
            [-97.7431, 30.3],
        ];
        const alertSources = {
            alprNodes: [
                { coordinate: [-97.7431, 30.279], id: 'near-alpr' },
                { coordinate: [-97.7431, 30.284], id: 'far-alpr' },
            ],
            policeAlerts: [
                { coordinate: [-97.7431, 30.28], id: 'near-police' },
                { coordinate: [-97.7431, 30.285], id: 'far-police' },
            ],
        };
        const routeAlerts = getUpcomingElectronicHorizonAlerts({
            ...alertSources,
            pathCoordinates: longPath,
        });
        const horizonAlerts = getUpcomingElectronicHorizonAlerts({
            ...alertSources,
            electronicHorizon: { primaryPath: { coordinates: longPath } },
        });

        assert.deepEqual(
            routeAlerts.map((alert) => alert.id),
            ['near-alpr', 'near-police'],
        );
        assert.deepEqual(
            horizonAlerts.map((alert) => alert.id),
            ['near-alpr', 'near-police'],
        );
    });
});

describe('active directions alert path', () => {
    test('starts at the user projection and excludes traveled route geometry', () => {
        const coordinatesAhead = getDirectionsRouteCoordinatesAhead(
            [
                [-97.7431, 30.2672],
                [-97.7331, 30.2672],
                [-97.7231, 30.2672],
            ],
            { latitude: 30.2672, longitude: -97.7381 },
        );

        assert.ok(coordinatesAhead[0][0] > -97.739);
        assert.ok(coordinatesAhead[0][0] < -97.737);
        assert.deepEqual(coordinatesAhead.at(-1), [-97.7231, 30.2672]);
    });
});
