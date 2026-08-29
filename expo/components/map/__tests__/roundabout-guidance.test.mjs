import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getRoundaboutExitNumber,
    isRoundaboutManeuver,
    shouldHoldRoundaboutManeuver,
} from '../roundabout-guidance.js';

describe('roundabout guidance', () => {
    test('recognizes every roundabout step that must stay active', () => {
        assert.equal(isRoundaboutManeuver({ type: 7 }), true);
        assert.equal(isRoundaboutManeuver({ type: 8 }), true);
        assert.equal(isRoundaboutManeuver({ type: 6 }), false);
        assert.equal(shouldHoldRoundaboutManeuver({ type: 7 }), true);
        assert.equal(shouldHoldRoundaboutManeuver({ type: 8 }), false);
    });

    test('uses positive whole exit numbers only', () => {
        assert.equal(getRoundaboutExitNumber({ exit_number: 3 }), 3);
        assert.equal(getRoundaboutExitNumber({ exit_number: '12' }), 12);
        assert.equal(getRoundaboutExitNumber({ exit_number: 0 }), null);
        assert.equal(getRoundaboutExitNumber({ exit_number: 2.5 }), null);
        assert.equal(getRoundaboutExitNumber({ exit_number: null }), null);
    });
});
