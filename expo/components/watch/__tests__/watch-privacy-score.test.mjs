import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createEmptyScorecardState,
    getScorecardWindowStats,
} from '../../scorecard/scorecard-engine.js';
import {
    createWatchSnapshot,
    watchSnapshotStateKey,
} from '../watch-contract.js';
import {
    projectWatchPrivacyScore,
    projectWatchRecap,
} from '../watch-projections.js';

const now = Date.now();
const base = {
    publisherId: 'phone',
    publisherStartedAt: now,
    revision: 1,
    now,
    environment: 'development',
    active: false,
    routeRevision: 0,
};

test('idle current score matches the phone dashboard without a guided recap', () => {
    const state = createEmptyScorecardState();
    state.trips = [
        {
            mode: 'free',
            endedAt: now,
            avoidedCameraCount: 3,
            confirmedReadCount: 2,
        },
    ];
    const runtime = { isHydrated: true, scorecardState: state };
    assert.equal(projectWatchRecap(runtime).status, 'none');
    const score = projectWatchPrivacyScore(runtime, now);
    assert.equal(score, 50);
    assert.equal(score, getScorecardWindowStats(state, now).privacyScore);
    const snapshot = createWatchSnapshot({
        ...base,
        currentPrivacyScore: score,
    });
    assert.equal(snapshot.navigation.status, 'idle');
    assert.equal(snapshot.currentPrivacyScore, 50);
    state.settings.enabled = false;
    assert.equal(projectWatchPrivacyScore(runtime, now), 50);
});

test('current score does not fabricate a value before hydration or after history expires', () => {
    const state = createEmptyScorecardState();
    const runtime = { isHydrated: true, scorecardState: state };
    assert.equal(projectWatchPrivacyScore(null, now), null);
    assert.equal(
        projectWatchPrivacyScore({ ...runtime, isHydrated: false }, now),
        null,
    );
    assert.equal(projectWatchPrivacyScore(runtime, now), null);
    state.trips = [{ endedAt: now - 366 * 86_400_000, avoidedCameraCount: 10 }];
    assert.equal(projectWatchPrivacyScore(runtime, now), null);
});

test('score transport keeps zero, rejects invalid values, and triggers state changes', () => {
    for (const value of [0, 82, 100]) {
        assert.equal(
            createWatchSnapshot({ ...base, currentPrivacyScore: value })
                .currentPrivacyScore,
            value,
        );
    }
    for (const value of [null, -1, 101, 0.5, NaN, Infinity, '82']) {
        assert.equal(
            createWatchSnapshot({ ...base, currentPrivacyScore: value })
                .currentPrivacyScore,
            null,
        );
    }
    assert.notEqual(
        watchSnapshotStateKey(
            createWatchSnapshot({ ...base, currentPrivacyScore: 50 }),
        ),
        watchSnapshotStateKey(
            createWatchSnapshot({ ...base, currentPrivacyScore: 75 }),
        ),
    );
});
