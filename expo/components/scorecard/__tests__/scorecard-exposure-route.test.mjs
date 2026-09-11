import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getScorecardExposureRouteSegment,
    normalizeScorecardExposureRouteSegment,
} from '../scorecard-exposure-route.js';

describe('scorecard exposure route segment', () => {
    test('retains only the route surrounding the flagged camera', () => {
        const route = Array.from({ length: 21 }, (_, index) => [
            -97.8 + index * 0.001,
            30.2,
        ]);
        const segment = getScorecardExposureRouteSegment(route, [-97.79, 30.2]);

        assert.ok(segment.length < route.length);
        assert.ok(Math.abs(segment[0][0] - -97.793) < 1e-9);
        assert.ok(Math.abs(segment.at(-1)[0] - -97.787) < 1e-9);
    });

    test('rejects invalid coordinates and caps persisted detail', () => {
        const segment = normalizeScorecardExposureRouteSegment([
            ...Array.from({ length: 120 }, (_, index) => [index / 10, 30]),
            [181, 30],
        ]);

        assert.equal(segment.length, 100);
    });
});
