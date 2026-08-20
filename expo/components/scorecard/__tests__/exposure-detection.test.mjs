import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { processScorecardExposureSegment } from '../exposure-detection.js';

function location(longitude, latitude, timestamp, accuracy = 5) {
    return {
        coords: { accuracy, latitude, longitude },
        timestamp,
    };
}

const CAMERA = {
    coordinate: [0, 0],
    direction: 'E',
    osmId: 100,
    tags: { name: 'Public camera', operator: 'Example agency' },
};

describe('local ALPR cone exposure detection', () => {
    test('treats entry through a known 45-degree cone as a confirmed read', () => {
        const result = processScorecardExposureSegment({
            currentLocation: location(0.0003, 0, 5000),
            nodes: [CAMERA],
            previousLocation: location(-0.0003, 0, 1000),
        });

        assert.equal(result.exposures.length, 1);
        assert.equal(result.exposures[0].certainty, 'confirmed');
        assert.deepEqual(result.exposures[0].cameraCoordinate, [0, 0]);
        assert.deepEqual(result.exposures[0].routeSegmentCoordinates, [
            [-0.0003, 0],
            [0.0003, 0],
        ]);
        assert.equal(result.exposures[0].rawUserCoordinate, undefined);
    });

    test('does not confirm travel that remains behind a directional cone', () => {
        const result = processScorecardExposureSegment({
            currentLocation: location(-0.0001, 0, 4000),
            nodes: [CAMERA],
            previousLocation: location(-0.0003, 0, 1000),
        });

        assert.deepEqual(result.exposures, []);
    });

    test('keeps an unknown-direction crossing visible as possible only', () => {
        const result = processScorecardExposureSegment({
            currentLocation: location(0.0003, 0, 5000),
            nodes: [{ ...CAMERA, direction: null }],
            previousLocation: location(-0.0006, 0, 1000),
        });

        assert.equal(result.exposures[0].certainty, 'possible');
    });

    test('accepts structured route-snapshot direction ranges', () => {
        const result = processScorecardExposureSegment({
            currentLocation: location(0.0003, 0, 5000),
            nodes: [
                {
                    coordinate: [0, 0],
                    directions: [{ end: 22.5, isRange: true, start: -22.5 }],
                    label: 'Route snapshot camera',
                    operator: 'Example agency',
                    osmId: null,
                },
            ],
            previousLocation: location(-0.0003, 0, 1000),
        });

        assert.equal(result.exposures.length, 1);
        assert.equal(result.exposures[0].certainty, 'confirmed');
        assert.equal(result.exposures[0].label, 'Route snapshot camera');
        assert.equal(result.exposures[0].operator, 'Example agency');
        assert.equal(result.exposures[0].osmId, null);
    });

    test('rejects inaccurate, stale, and implausibly fast segments', () => {
        assert.deepEqual(
            processScorecardExposureSegment({
                currentLocation: location(0.0003, 0, 5000, 100),
                nodes: [CAMERA],
                previousLocation: location(-0.0003, 0, 1000),
            }).exposures,
            [],
        );
        assert.deepEqual(
            processScorecardExposureSegment({
                currentLocation: location(0.0003, 0, 30_000),
                nodes: [CAMERA],
                previousLocation: location(-0.0003, 0, 1000),
            }).exposures,
            [],
        );
        assert.deepEqual(
            processScorecardExposureSegment({
                currentLocation: location(0.01, 0, 2000),
                nodes: [CAMERA],
                previousLocation: location(-0.01, 0, 1000),
            }).exposures,
            [],
        );
    });

    test('debounces immediate reentry at the same camera', () => {
        const first = processScorecardExposureSegment({
            currentLocation: location(0.0003, 0, 5000),
            nodes: [CAMERA],
            previousLocation: location(-0.0003, 0, 1000),
        });
        const outside = processScorecardExposureSegment({
            currentLocation: location(-0.0003, 0, 9000),
            detectorState: first.detectorState,
            nodes: [CAMERA],
            previousLocation: location(0.0003, 0, 5000),
        });
        const reentry = processScorecardExposureSegment({
            currentLocation: location(0.0003, 0, 13_000),
            detectorState: outside.detectorState,
            nodes: [CAMERA],
            previousLocation: location(-0.0003, 0, 9000),
        });

        assert.equal(first.exposures.length, 1);
        assert.deepEqual(reentry.exposures, []);
    });
});
