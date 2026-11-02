import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createWatchCuePlanner,
    watchCueDistanceMeters,
    watchCuePattern,
} from '../watch-cues.js';

function state(distance, kind = 'left', overrides = {}) {
    return {
        publisherId: 'phone-1',
        navigation: {
            status: 'active',
            sourceAt: 10_000,
            sessionId: 'route-1',
            maneuver: { id: '1:2', kind, distanceMeters: distance },
            ...overrides,
        },
    };
}

test('speed sets the advance distance with bounds and a missing-speed fallback', () => {
    assert.equal(watchCueDistanceMeters(12), 120);
    assert.equal(watchCueDistanceMeters(1), 30);
    assert.equal(watchCueDistanceMeters(40), 300);
    assert.equal(watchCueDistanceMeters(null), 100);
    assert.equal(watchCueDistanceMeters(0), 100);
});

test('directional and neutral patterns cover eligible steps only', () => {
    for (const kind of ['left', 'slight-left', 'sharp-left', 'keep-left'])
        assert.equal(watchCuePattern(kind), 'left');
    for (const kind of ['right', 'slight-right', 'sharp-right', 'keep-right'])
        assert.equal(watchCuePattern(kind), 'right');
    for (const kind of ['roundabout', 'uturn'])
        assert.equal(watchCuePattern(kind), 'neutral');
    for (const kind of ['straight', 'depart', 'arrive'])
        assert.equal(watchCuePattern(kind), null);
});

test('one cue fires on threshold crossing, then never replays for the same maneuver', () => {
    const planner = createWatchCuePlanner();
    assert.equal(planner.consume(state(140), 12, true, 10_000), null);
    const cue = planner.consume(state(119), 12, true, 10_100);
    assert.equal(cue.pattern, 'left');
    assert.equal(cue.sessionId, 'route-1');
    assert.equal(cue.expiresAt, 13_100);
    assert.equal(planner.consume(state(105), 12, true, 10_200), null);
    assert.equal(planner.consume(state(130), 12, true, 10_300), null);
    assert.equal(planner.consume(state(115), 12, true, 10_400), null);
});

test('reroutes, stale packets, disabled haptics, and close maneuvers do not cue late', () => {
    const planner = createWatchCuePlanner();
    planner.consume(state(140), 12, true, 10_000);
    assert.equal(
        planner.consume(
            state(110, 'left', { status: 'rerouting' }),
            12,
            true,
            10_100,
        ),
        null,
    );
    assert.equal(
        planner.consume(
            state(90, 'right', {
                maneuver: { id: '2:1', kind: 'right', distanceMeters: 90 },
            }),
            12,
            true,
            10_200,
        ),
        null,
    );
    planner.consume(
        state(150, 'right', {
            maneuver: { id: '2:2', kind: 'right', distanceMeters: 150 },
        }),
        12,
        true,
        10_300,
    );
    assert.equal(
        planner.consume(
            state(110, 'right', {
                maneuver: { id: '2:2', kind: 'right', distanceMeters: 110 },
            }),
            12,
            false,
            10_400,
        ),
        null,
    );
    assert.equal(
        planner.consume(
            state(90, 'right', {
                maneuver: { id: '2:2', kind: 'right', distanceMeters: 90 },
            }),
            12,
            true,
            10_500,
        ),
        null,
    );
    planner.consume(
        state(150, 'right', {
            maneuver: { id: '2:3', kind: 'right', distanceMeters: 150 },
        }),
        12,
        true,
        25_000,
    );
    assert.equal(
        planner.consume(
            state(110, 'right', {
                maneuver: { id: '2:3', kind: 'right', distanceMeters: 110 },
            }),
            12,
            true,
            25_100,
        ),
        null,
    );
});

test('closely spaced maneuvers suppress the second cue', () => {
    const planner = createWatchCuePlanner();
    planner.consume(state(140), 12, true, 10_000);
    assert.ok(planner.consume(state(110), 12, true, 10_100));
    planner.consume(
        state(140, 'right', {
            maneuver: { id: '1:3', kind: 'right', distanceMeters: 140 },
        }),
        12,
        true,
        10_200,
    );
    assert.equal(
        planner.consume(
            state(110, 'right', {
                maneuver: { id: '1:3', kind: 'right', distanceMeters: 110 },
            }),
            12,
            true,
            10_300,
        ),
        null,
    );
});
