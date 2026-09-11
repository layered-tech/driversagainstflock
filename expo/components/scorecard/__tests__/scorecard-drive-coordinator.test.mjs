import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    processScorecardRawLocationFix,
    updateScorecardRawLocationAnchor,
} from '../scorecard-drive-coordinator.js';

const location = (longitude, latitude, timestamp) => ({
    coords: { accuracy: 5, latitude, longitude },
    timestamp,
});

describe('scorecard raw location coordinator', () => {
    test('uses the guided route snapshot when supplemental camera loading is empty', () => {
        const activeSession = {
            id: 'drive-1',
            mode: 'guided',
            monitoringCameras: [
                {
                    coordinate: [0, 0],
                    directionKnown: true,
                    directions: [{ end: 0, isRange: false, start: 0 }],
                    osmId: 'route-camera',
                },
            ],
        };

        const result = processScorecardRawLocationFix({
            activeSession,
            currentLocation: location(0, 0.0002, 2000),
            detectorState: { cameras: {} },
            previousLocation: location(0, -0.0001, 1000),
            supplementalNodes: [],
        });

        assert.equal(result.exposures.length, 1);
        assert.equal(result.exposures[0].certainty, 'confirmed');
        assert.equal(result.exposures[0].osmId, 'route-camera');
    });

    test('uses supplemental nodes for an explicit free drive', () => {
        const result = processScorecardRawLocationFix({
            activeSession: { id: 'drive-2', mode: 'free' },
            currentLocation: location(0, 0.0002, 2000),
            detectorState: { cameras: {} },
            previousLocation: location(0, -0.0001, 1000),
            supplementalNodes: [
                {
                    coordinate: [0, 0],
                    direction: '0',
                    osmId: 'supplemental-camera',
                },
            ],
        });

        assert.equal(result.exposures.length, 1);
        assert.equal(result.exposures[0].osmId, 'supplemental-camera');
        assert.ok(result.distanceMeters > 0);
    });

    test('retains monitoring-only cameras without scoreable ids', () => {
        const result = processScorecardRawLocationFix({
            activeSession: {
                id: 'drive-3',
                mode: 'guided',
                monitoringCameras: [
                    {
                        coordinate: [0, 0],
                        directions: [{ end: 0, isRange: false, start: 0 }],
                        osmId: null,
                    },
                ],
            },
            currentLocation: location(0, 0.0002, 2000),
            detectorState: { cameras: {} },
            previousLocation: location(0, -0.0001, 1000),
            supplementalNodes: [],
        });

        assert.equal(result.exposures.length, 1);
        assert.equal(result.exposures[0].osmId, null);
    });

    test('rejects a bad fix without replacing the last accepted segment anchor', () => {
        const activeSession = {
            id: 'drive-invalid-fix',
            mode: 'guided',
            monitoringCameras: [
                {
                    coordinate: [0, 0],
                    directions: [{ end: 0, isRange: false, start: 0 }],
                    osmId: 'route-camera',
                },
            ],
        };
        const outsideCone = location(0, -0.0001, 1_000);
        const inaccurateInsideCone = {
            ...location(0, 0.0001, 2_000),
            coords: {
                ...location(0, 0.0001, 2_000).coords,
                accuracy: 100,
            },
        };
        const rejected = processScorecardRawLocationFix({
            activeSession,
            currentLocation: inaccurateInsideCone,
            previousLocation: outsideCone,
        });
        const accepted = processScorecardRawLocationFix({
            activeSession,
            currentLocation: location(0, 0.0002, 3_000),
            detectorState: rejected.detectorState,
            previousLocation: rejected.previousLocation,
        });

        assert.equal(rejected.previousLocation, outsideCone);
        assert.deepEqual(rejected.exposures, []);
        assert.equal(accepted.exposures.length, 1);
        assert.equal(accepted.exposures[0].osmId, 'route-camera');
    });

    test('keeps the accepted anchor across duplicates and cumulative small fixes', () => {
        const activeSession = {
            id: 'drive-small-fixes',
            mode: 'guided',
            monitoringCameras: [
                {
                    coordinate: [0, 0],
                    directions: [],
                    osmId: 'slow-camera',
                },
            ],
        };
        const initialAnchor = location(-0.00046, 0, 1_000);
        const outOfOrder = processScorecardRawLocationFix({
            activeSession,
            currentLocation: location(-0.00045, 0, 900),
            previousLocation: initialAnchor,
        });
        let result = processScorecardRawLocationFix({
            activeSession,
            currentLocation: location(-0.00046, 0, 1_100),
            detectorState: outOfOrder.detectorState,
            previousLocation: outOfOrder.previousLocation,
        });

        assert.equal(outOfOrder.previousLocation, initialAnchor);
        assert.equal(result.previousLocation, initialAnchor);

        for (let index = 1; index <= 12; index += 1) {
            result = processScorecardRawLocationFix({
                activeSession,
                currentLocation: location(
                    -0.00046 + index * 0.000004,
                    0,
                    1_100 + index * 100,
                ),
                detectorState: result.detectorState,
                previousLocation: result.previousLocation,
            });

            if (result.exposures.length > 0) {
                break;
            }
        }

        assert.equal(result.exposures.length, 1);
        assert.equal(result.exposures[0].osmId, 'slow-camera');
    });

    test('does not let an invalid pre-start fix erase a valid crossing anchor', () => {
        const outsideCone = location(0, -0.0001, 1_000);
        const inaccuratePreStart = {
            ...location(0, 0.0001, 2_000),
            coords: {
                ...location(0, 0.0001, 2_000).coords,
                accuracy: 100,
            },
        };
        let anchor = updateScorecardRawLocationAnchor(null, outsideCone);

        anchor = updateScorecardRawLocationAnchor(anchor, inaccuratePreStart);
        const result = processScorecardRawLocationFix({
            activeSession: {
                id: 'drive-pre-start-anchor',
                mode: 'guided',
                monitoringCameras: [
                    {
                        coordinate: [0, 0],
                        directions: [{ end: 0, isRange: false, start: 0 }],
                        osmId: 'start-camera',
                    },
                ],
            },
            currentLocation: location(0, 0.0002, 3_000),
            previousLocation: anchor,
        });

        assert.equal(anchor, outsideCone);
        assert.equal(result.exposures.length, 1);
        assert.equal(result.exposures[0].osmId, 'start-camera');
    });
});
