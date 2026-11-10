import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWatchCameraCuePlanner } from '../watch-camera-cues.js';
import { createWatchCuePlanner } from '../watch-cues.js';
import { publishWatchUpdate } from '../watch-publisher.js';
import {
    createWatchCameraAppearanceTracker,
    projectWatchAreas,
    projectWatchCamera,
    projectWatchRecap,
} from '../watch-projections.js';

test('camera projection keeps only route-eligible ALPR metadata and no coordinates', () => {
    const alert = projectWatchCamera(
        [
            {
                id: 'police',
                type: 'police',
                distanceMeters: 100,
                coordinate: [1, 2],
            },
            {
                id: 'far',
                type: 'alpr',
                distanceMeters: 1000,
                coordinate: [1, 2],
            },
            {
                id: 'near',
                type: 'alpr',
                distanceMeters: 400,
                source: {
                    tags: { brand: 'Flock', 'addr:street': 'Market St' },
                },
                coordinate: [1, 2],
            },
            {
                id: 'other',
                type: 'alpr',
                distanceMeters: 500,
                coordinate: [1, 2],
            },
        ],
        2000,
    );
    assert.equal(alert.id, 'near');
    assert.equal(alert.count, 2);
    assert.equal(alert.road, 'Market St');
    assert.equal(alert.type, 'Flock');
    assert.equal(JSON.stringify(alert).includes('coordinate'), false);
    assert.equal(projectWatchCamera([], 2000), null);
    assert.equal(
        projectWatchCamera(
            [{ id: 'near', type: 'alpr', distanceMeters: 100 }],
            null,
        ),
        null,
    );
});

test('camera appearance time survives republishing and clears when alert ends', () => {
    const track = createWatchCameraAppearanceTracker();
    assert.equal(track(null, 1000), null);
    assert.equal(track({ id: 'a' }, 2000).issuedAt, 2000);
    assert.equal(track({ id: 'a' }, 5000).issuedAt, 2000);
    assert.equal(track(null, 6000), null);
    assert.equal(track({ id: 'a' }, 7000).issuedAt, 7000);
});

test('camera cue plays once for each fresh alert, including the first free-drive alert', () => {
    const planner = createWatchCameraCuePlanner();
    const snapshot = (id) => ({
        publisherId: 'phone',
        cameraAlert: id ? { id, sourceAt: 1000 } : null,
    });
    const first = planner.consume(snapshot('a'), 1000, true);
    assert.equal(first.pattern, 'camera');
    assert.equal(first.cameraId, 'a');
    assert.equal(planner.consume(snapshot('a'), 1100, true), null);
    const cue = planner.consume(snapshot('b'), 1200, true);
    assert.equal(cue.pattern, 'camera');
    assert.equal(cue.cameraId, 'b');
    assert.equal(planner.consume(snapshot('b'), 1300, true), null);
    assert.equal(planner.consume(snapshot(null), 1500, true), null);
});

test('camera cue waits for a fresh enabled alert and then fires once', () => {
    const planner = createWatchCameraCuePlanner();
    const snapshot = (id, sourceAt = 10_000) => ({
        publisherId: 'phone',
        navigation: { status: 'idle' },
        cameraAlert: id ? { id, sourceAt } : null,
    });
    assert.equal(planner.consume(snapshot('a'), 10_000, false), null);
    assert.equal(
        planner.consume(snapshot('a'), 10_100, true)?.pattern,
        'camera',
    );
    assert.equal(planner.consume(snapshot('b', 1), 20_000, true), null);
    assert.equal(
        planner.consume(snapshot('b', 20_000), 20_100, true)?.pattern,
        'camera',
    );
    assert.equal(
        planner.consume(snapshot('c', 20_100), 20_100, true)?.pattern,
        'camera',
    );
});

test('free-driving camera cue gets its full lifetime after snapshot publication', async () => {
    let now = 10_000;
    const sent = [];
    const transport = {
        async publishSnapshot(payload) {
            sent.push(['snapshot', JSON.parse(payload)]);
            now += 2_500;
        },
        async sendHapticCue(payload) {
            sent.push(['cue', JSON.parse(payload)]);
        },
    };
    const cuePlanner = createWatchCuePlanner();
    const cameraCuePlanner = createWatchCameraCuePlanner();
    const publish = (cameraAlert) =>
        publishWatchUpdate({
            snapshot: {
                publisherId: 'phone',
                navigation: { status: 'idle' },
                cameraAlert,
            },
            transport,
            cuePlanner,
            cameraCuePlanner,
            speed: 18,
            hapticsEnabled: true,
            cameraAlertsEnabled: true,
            now: () => now,
        });
    await publish(null);
    await publish({ id: 'mapped-alpr', sourceAt: now });
    const cue = sent.find(([type]) => type === 'cue')?.[1];
    assert.equal(cue?.pattern, 'camera');
    assert.equal(cue?.issuedAt, 15_000);
    assert.equal(cue?.expiresAt, 20_000);
    assert.deepEqual(
        sent.map(([type]) => type),
        ['snapshot', 'snapshot', 'cue'],
    );
});

test('Area projection limits content and preserves read-through identity', () => {
    const area = {
        id: 7,
        name: 'Oakland',
        unread_count: 2,
        camera_count: 100,
        counts: { added: 2, removed: 1 },
        geometry: { private: true },
    };
    const feed = {
        read_through_id: 23,
        changes: {
            data: [
                {
                    id: 22,
                    kind: 'added',
                    street: 'Market St',
                    operator: 'Flock',
                    direction: 'NE',
                    changed_at: '2026-10-30T12:00:00Z',
                    longitude: 1,
                    latitude: 2,
                },
            ],
        },
    };
    const result = projectWatchAreas([area], { 7: feed }, 1000);
    assert.equal(result.items[0].unreadCount, 2);
    assert.equal(result.items[0].readThroughId, 23);
    assert.equal(result.items[0].changesStatus, 'ready');
    assert.equal(result.items[0].changes[0].street, 'Market St');
    assert.equal(JSON.stringify(result).includes('geometry'), false);
    assert.equal(JSON.stringify(result).includes('longitude'), false);
    assert.equal(projectWatchAreas([area]).items[0].changesStatus, 'loading');
    assert.equal(
        projectWatchAreas([area], { 7: null }).items[0].changesStatus,
        'unavailable',
    );
});

test('recap uses finalized trip totals and explicit tracking-off state', () => {
    const trip = {
        id: 'drive-1',
        mode: 'guided',
        completed: true,
        endedAt: Date.now(),
        durationSeconds: 600,
        distanceMiles: 5,
        confirmedReadCount: 1,
        possibleReadCount: 0,
        avoidedCameraCount: 2,
        xpEarned: 90,
    };
    const snapshot = {
        isHydrated: true,
        scorecardState: {
            settings: { enabled: true },
            trips: [trip],
            exposures: [],
        },
    };
    const result = projectWatchRecap(snapshot);
    assert.equal(result.avoidedCameras, 2);
    assert.equal(result.xpEarned, 90);
    assert.equal(result.confirmedCrossings, 1);
    assert.equal(
        projectWatchRecap({
            isHydrated: true,
            scorecardState: { settings: { enabled: false } },
        }).status,
        'tracking-off',
    );
});
