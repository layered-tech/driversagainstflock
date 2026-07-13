import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getMockCurrentSpeedMps,
    getMockSpeedLimitSnapshot,
    MOCK_CURRENT_SPEED_MPH,
    MOCK_SPEED_LIMIT_MPH,
} from '../speed-limit-mock.js';

const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362920544;

describe('speed-limit Maestro fixture', () => {
    test('renders the design over-limit state deterministically', () => {
        const speedLimit = getMockSpeedLimitSnapshot();
        const currentSpeedMph = Math.round(
            getMockCurrentSpeedMps() * METERS_PER_SECOND_TO_MILES_PER_HOUR,
        );

        assert.equal(speedLimit.speedLimitMph, 35);
        assert.equal(MOCK_SPEED_LIMIT_MPH, 35);
        assert.equal(currentSpeedMph, 41);
        assert.equal(MOCK_CURRENT_SPEED_MPH, 41);
        assert.ok(currentSpeedMph > speedLimit.speedLimitMph);
    });
});
