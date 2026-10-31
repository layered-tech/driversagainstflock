import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWatchCameraCuePlanner } from '../watch-camera-cues.js';
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

test('camera cue sends once, merges back-to-back candidates and never replays initial state', () => {
    const planner = createWatchCameraCuePlanner();
    const snapshot = (id) => ({
        publisherId: 'phone',
        cameraAlert: id ? { id, sourceAt: 1000 } : null,
    });
    assert.equal(planner.consume(snapshot('a'), 1000, null, true), null);
    assert.equal(planner.consume(snapshot('a'), 1100, null, true), null);
    const cue = planner.consume(snapshot('b'), 1200, null, true);
    assert.equal(cue.pattern, 'camera');
    assert.equal(cue.cameraId, 'b');
    assert.equal(planner.consume(snapshot('c'), 1300, null, true), null);
    assert.equal(planner.consume(snapshot('c'), 1400, null, true), null);
    assert.equal(planner.consume(snapshot(null), 1500, null, true), null);
});

test('camera cue waits for a nearby maneuver cue and expires if the gap never opens', () => {
    const planner = createWatchCameraCuePlanner();
    const snapshot = (id, maneuverDistance = 100) => ({
        publisherId: 'phone',
        navigation: { maneuver: { distanceMeters: maneuverDistance } },
        cameraAlert: id ? { id, sourceAt: 10_000 } : null,
    });
    planner.consume(snapshot(null), 10_000, null, true, 10);
    assert.equal(
        planner.consume(snapshot('a', 120), 10_000, null, true, 10),
        null,
    );
    const cue = planner.consume(
        snapshot('a', 100),
        11_000,
        { pattern: 'right' },
        true,
        10,
    );
    assert.equal(cue.pattern, 'camera');
    planner.consume(snapshot(null), 12_000, null, true, 10);
    assert.equal(
        planner.consume(snapshot('b', 120), 20_000, null, true, 10),
        null,
    );
    assert.equal(
        planner.consume(snapshot('b', 90), 22_001, null, true, 10),
        null,
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
