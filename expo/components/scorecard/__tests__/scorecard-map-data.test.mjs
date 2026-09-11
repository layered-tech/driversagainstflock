import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getScorecardCoordinateBearingDegrees,
    getScorecardCoordinateDistanceMeters,
} from '../scorecard-geo.js';
import {
    getScorecardMapBounds,
    getScorecardMapGeometryBounds,
    makeScorecardExposureConeCollection,
    makeScorecardExposurePointCollection,
    makeScorecardExposureTravelLineCollection,
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
        travelHeading: 90,
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

    test('derives an approximate travel line without retained GPS samples', () => {
        const routes = makeScorecardExposureTravelLineCollection(exposures);
        const coordinates = routes.features[0].geometry.coordinates;

        assert.equal(routes.features.length, 1);
        assert.equal(coordinates.length, 2);
        assert.ok(
            Math.abs(
                getScorecardCoordinateDistanceMeters(
                    coordinates[0],
                    exposures[1].cameraCoordinate,
                ) - 75,
            ) < 0.01,
        );
        assert.ok(
            Math.abs(
                getScorecardCoordinateDistanceMeters(
                    exposures[1].cameraCoordinate,
                    coordinates[1],
                ) - 75,
            ) < 0.01,
        );
        assert.ok(
            Math.abs(
                getScorecardCoordinateBearingDegrees(
                    coordinates[0],
                    coordinates[1],
                ) - 90,
            ) < 0.01,
        );
    });

    test('omits a travel line when the retained heading is unavailable', () => {
        const routes = makeScorecardExposureTravelLineCollection([
            {
                cameraCoordinate: [-97.8, 30.2],
                certainty: 'confirmed',
                id: 'missing-heading',
                occurredAt: 1000,
                sessionId: 'drive-one',
                travelHeading: null,
            },
        ]);

        assert.deepEqual(routes.features, []);
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
