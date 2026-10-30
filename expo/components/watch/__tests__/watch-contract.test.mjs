import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
    createWatchSnapshot,
    semanticWatchManeuver,
    watchEnvironmentIsSupported,
    watchSnapshotStateKey,
    watchSourceIsStale,
} from '../watch-contract.js';
import { createWatchPublisher } from '../watch-publisher.js';

const base = {
    publisherId: 'fixture-phone',
    publisherStartedAt: 1000,
    revision: 1,
    now: 2000,
    environment: 'staging',
    phoneVersion: '2.9.3',
    sessionId: 'drive-1',
    routeRevision: 1,
    active: true,
    sourceAt: 2000,
    destination: 'Ferry Building',
    maneuver: {
        type: 1,
        stepIndex: 2,
        instruction: 'Turn right onto Market St',
        distanceToManeuver: 120,
    },
    remaining: { distanceRemaining: 21000, durationRemaining: 1620 },
    scorecard: {
        status: 'active',
        sessionId: 'score-1',
        sourceAt: 2000,
        elapsedSeconds: 1122,
        distanceMeters: 6400,
        confirmedCrossings: 1,
        possibleCrossings: 2,
        cameraCrossings: 3,
    },
};

test('watch publishing supports production and staging while rejecting unknown environments', () => {
    for (const environment of ['production', 'staging', 'development', 'e2e']) {
        assert.equal(watchEnvironmentIsSupported(environment), true);
        assert.equal(
            createWatchSnapshot({ ...base, environment }).environment,
            environment,
        );
    }
    for (const environment of [undefined, '', 'unknown']) {
        assert.equal(watchEnvironmentIsSupported(environment), false);
    }
});

test('shared native fixture equals the phone projection', () => {
    const fixture = JSON.parse(
        readFileSync(
            new URL(
                '../../../../wear-os/contracts/active.json',
                import.meta.url,
            ),
        ),
    );
    assert.deepEqual(createWatchSnapshot(base), fixture);
});
test('preview and cancellation clear active guidance and metrics', () => {
    const snapshot = createWatchSnapshot({ ...base, active: false });
    assert.equal(snapshot.navigation.status, 'idle');
    assert.equal(snapshot.navigation.sessionId, null);
    assert.equal(snapshot.navigation.maneuver, null);
    assert.equal(snapshot.scorecard.status, 'no-active-drive');
    assert.equal(snapshot.scorecard.distanceMeters, null);
});
test('rerouting suppresses the old maneuver and unknown types stay unavailable', () => {
    assert.equal(
        createWatchSnapshot({ ...base, rerouting: true }).navigation.maneuver,
        null,
    );
    assert.equal(
        createWatchSnapshot({ ...base, maneuver: { type: 98 } }).navigation
            .status,
        'missing-maneuver',
    );
    assert.equal(
        createWatchSnapshot({ ...base, sourceAt: null }).navigation.status,
        'waiting-for-location',
    );
});
test('all maneuver types map semantically and identity changes after reroute', () => {
    const expected = [
        'left',
        'right',
        'sharp-left',
        'sharp-right',
        'slight-left',
        'slight-right',
        'straight',
        'roundabout',
        'roundabout',
        'uturn',
        'arrive',
        'depart',
        'keep-left',
        'keep-right',
    ];
    expected.forEach((kind, type) =>
        assert.equal(semanticWatchManeuver({ type }, 1).kind, kind),
    );
    assert.notEqual(
        semanticWatchManeuver(base.maneuver, 1).id,
        semanticWatchManeuver(base.maneuver, 2).id,
    );
    assert.equal(
        semanticWatchManeuver({ type: 7, exit_number: 3 }, 1).exitNumber,
        3,
    );
});
test('privacy opt-out and missing numbers never become zero-valued metrics', () => {
    const snapshot = createWatchSnapshot({
        ...base,
        scorecard: { status: 'tracking-off' },
        remaining: {},
    });
    assert.equal(snapshot.scorecard.status, 'tracking-off');
    assert.equal(snapshot.scorecard.cameraCrossings, null);
    assert.equal(snapshot.navigation.durationRemainingSeconds, null);
    assert.equal(snapshot.navigation.arrivalAt, null);
    assert.equal(
        JSON.stringify(
            createWatchSnapshot({
                ...base,
                coordinates: [1, 2],
                credentials: 'secret',
            }),
        ).includes('secret'),
        false,
    );
});
test('haptic preference is explicit and changes the immediate state key', () => {
    const enabled = createWatchSnapshot(base);
    const disabled = createWatchSnapshot({ ...base, hapticsEnabled: false });
    assert.equal(enabled.hapticsEnabled, true);
    assert.equal(disabled.hapticsEnabled, false);
    assert.notEqual(
        watchSnapshotStateKey(enabled),
        watchSnapshotStateKey(disabled),
    );
});
test('republication never refreshes source age; staleness starts at 15 seconds', () => {
    const snapshot = createWatchSnapshot({ ...base, now: 90_000 });
    assert.equal(snapshot.navigation.sourceAt, 2000);
    assert.equal(watchSourceIsStale(2000, 16999), false);
    assert.equal(watchSourceIsStale(2000, 17000), true);
    assert.equal(watchSourceIsStale(null, 10000), true);
    assert.equal(watchSourceIsStale(20000, 10000), true);
});
test('progress coalesces; state changes and reconnect requests publish immediately', async () => {
    let now = 2000;
    let active = true;
    let pending;
    const sent = [];
    const publisher = createWatchPublisher({
        now: () => now,
        readSnapshot: (revision) =>
            createWatchSnapshot({ ...base, active, now, revision }),
        publish: async (snapshot) => sent.push(snapshot),
        schedule: (callback) => {
            pending = callback;
            return 1;
        },
        cancel: () => {
            pending = null;
        },
    });
    publisher.update();
    await publisher.flush();
    now += 100;
    publisher.update();
    publisher.update();
    await publisher.flush();
    assert.equal(sent.length, 1);
    now = 3000;
    pending();
    await publisher.flush();
    assert.equal(sent.length, 2);
    now += 100;
    active = false;
    publisher.update();
    await publisher.flush();
    assert.equal(sent.length, 3);
    publisher.update({ force: true });
    await publisher.flush();
    assert.equal(sent.length, 4);
    assert.ok(
        sent.every(
            (snapshot, index) =>
                !index || snapshot.revision > sent[index - 1].revision,
        ),
    );
    publisher.stop();
    publisher.update();
    await publisher.flush();
    assert.equal(sent.length, 4);
});
test('failed delivery can retry and does not break the queue', async () => {
    let attempts = 0;
    const errors = [];
    const publisher = createWatchPublisher({
        readSnapshot: (revision) => createWatchSnapshot({ ...base, revision }),
        publish: async () => {
            if (++attempts === 1) throw Error('offline');
        },
        onError: (error) => errors.push(error),
    });
    publisher.update();
    await publisher.flush();
    publisher.update();
    await publisher.flush();
    assert.equal(attempts, 2);
    assert.deepEqual(errors, ['publish-failed']);
    publisher.stop();
});
