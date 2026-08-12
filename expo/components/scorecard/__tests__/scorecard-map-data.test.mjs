import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getScorecardMapBounds,
    getScorecardMapGeometryBounds,
    makeScorecardExposureConeCollection,
    makeScorecardExposurePointCollection,
    makeScorecardExposureRouteLineCollection,
} from '../scorecard-map-data.js';

const exposures = [
    {
        cameraCoordinate: [-97.7, 30.3],
        certainty: 'confirmed',
        id: 'later',
        occurredAt: 2000,
        sessionId: 'drive-one',
    },
    {
        cameraCoordinate: [-97.8, 30.2],
        certainty: 'confirmed',
        id: 'earlier',
        occurredAt: 1000,
        cameraDirections: [{ end: 90, isRange: false, start: 90 }],
        routeSegmentCoordinates: [
            [-97.81, 30.19],
            [-97.8, 30.2],
            [-97.79, 30.21],
        ],
        sessionId: 'drive-one',
    },
    {
        cameraCoordinate: [-97.6, 30.4],
        certainty: 'confirmed',
        id: 'other-drive',
        occurredAt: 3000,
        sessionId: 'drive-two',
    },
];

describe('scorecard exposure map data', () => {
    test('maps real camera coordinates in chronological order', () => {
        const points = makeScorecardExposurePointCollection(exposures);

        assert.deepEqual(
            points.features.map((feature) => ({
                coordinate: feature.geometry.coordinates,
                sequence: feature.properties.sequenceLabel,
            })),
            [
                { coordinate: [-97.8, 30.2], sequence: '1' },
                { coordinate: [-97.7, 30.3], sequence: '2' },
                { coordinate: [-97.6, 30.4], sequence: '3' },
            ],
        );
    });

    test('maps the locally retained driven segment at an exposure', () => {
        const routes = makeScorecardExposureRouteLineCollection(exposures);

        assert.equal(routes.features.length, 1);
        assert.deepEqual(routes.features[0].geometry.coordinates, [
            [-97.81, 30.19],
            [-97.8, 30.2],
            [-97.79, 30.21],
        ]);
    });

    test('maps the camera view cone from its reported direction', () => {
        const cones = makeScorecardExposureConeCollection(exposures);
        const ring = cones.features[0].geometry.coordinates[0];

        assert.equal(cones.features.length, 1);
        assert.deepEqual(ring[0], [-97.8, 30.2]);
        assert.deepEqual(ring.at(-1), [-97.8, 30.2]);
        assert.ok(ring.slice(1, -1).every(([longitude]) => longitude > -97.8));
    });

    test('fits all retained camera coordinates', () => {
        assert.deepEqual(getScorecardMapBounds(exposures), {
            ne: [-97.6, 30.4],
            sw: [-97.8, 30.2],
        });
    });

    test('includes rendered route geometry in camera bounds', () => {
        assert.deepEqual(
            getScorecardMapGeometryBounds(exposures, {
                features: [
                    {
                        geometry: {
                            coordinates: [
                                [-97.9, 30.1],
                                [-97.5, 30.5],
                            ],
                            type: 'LineString',
                        },
                    },
                ],
            }),
            {
                ne: [-97.5, 30.5],
                sw: [-97.9, 30.1],
            },
        );
    });
});
