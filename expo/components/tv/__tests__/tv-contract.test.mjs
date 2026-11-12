import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTvAreaSnapshot } from '../tv-contract.js';

test('TV projection excludes credentials, geometry and phone trip history', () => {
    const snapshot = createTvAreaSnapshot(
        [
            {
                id: 1,
                name: 'Oakland',
                kind: 'city',
                definition: 'Alameda County',
                alert_mode: 'instant',
                camera_count: 116,
                counts: { added: 4, removed: 1 },
                token: 'secret',
                home: [1, 2],
                trips: ['private'],
                geometry: {},
            },
        ],
        {
            1: {
                changes: {
                    data: [
                        {
                            id: 2,
                            kind: 'added',
                            street: 'Grand Ave',
                            changed_at: '2026-11-02T12:00:00Z',
                            token: 'secret',
                        },
                    ],
                },
            },
        },
        100,
        {
            1: {
                cameras: {
                    data: [
                        {
                            id: 42,
                            latitude: 37.8,
                            longitude: -122.2,
                            geometry: { private: true },
                            direction: '90;270',
                        },
                        { id: 43, latitude: 100, longitude: -122.2 },
                    ],
                },
            },
        },
    );
    assert.equal(snapshot.areas[0].cameraCount, 116);
    assert.equal(snapshot.areas[0].kind, 'city');
    assert.equal(snapshot.areas[0].description, 'Alameda County');
    assert.equal(snapshot.areas[0].cadence, 'Instant');
    assert.deepEqual(snapshot.areas[0].mappedCameras, [
        { latitude: 37.8, longitude: -122.2, direction: '90;270' },
    ]);
    assert.equal(snapshot.areas[0].changes[0].street, 'Grand Ave');
    assert.equal(
        snapshot.areas[0].changes[0].changedAt,
        Date.parse('2026-11-02T12:00:00Z'),
    );
    for (const field of ['token', 'home', 'trips', 'geometry']) {
        assert.equal(JSON.stringify(snapshot).includes(`"${field}"`), false);
    }
});

test('malformed or missing feeds remain unavailable, not a quiet week', () => {
    assert.deepEqual(createTvAreaSnapshot(null).areas, []);
    const result = createTvAreaSnapshot([
        null,
        { id: 1, counts: { added: -1 } },
    ]);
    assert.equal(result.areas.length, 1);
    assert.equal(result.areas[0].changesStatus, 'unavailable');
    assert.deepEqual(result.areas[0].changes, []);
});

test('TV snapshots never transmit route choices or an inferred origin', () => {
    const snapshot = createTvAreaSnapshot([
        {
            id: 1,
            routes: ['private', 'fastest'],
            origin: { latitude: 1, longitude: 2 },
        },
    ]);
    assert.equal(snapshot.areas[0].routes, undefined);
    assert.equal(snapshot.areas[0].origin, undefined);
});

test('large household snapshots stay below the local transport limit', () => {
    const areas = Array.from({ length: 25 }, (_, index) => ({
        id: index + 1,
        name: 'Area',
        counts: { added: 100, removed: 0 },
    }));
    const feeds = Object.fromEntries(
        areas.map((area) => [
            area.id,
            {
                changes: {
                    data: Array.from({ length: 100 }, (_, index) => ({
                        id: index + 1,
                        kind: 'added',
                        street: 'A'.repeat(160),
                        operator: 'B'.repeat(160),
                        direction: 'C'.repeat(160),
                        latitude: 37.8,
                        longitude: -122.2,
                    })),
                },
            },
        ]),
    );
    const cameras = Object.fromEntries(
        areas.map((area) => [
            area.id,
            {
                cameras: {
                    data: Array.from({ length: 500 }, () => ({
                        latitude: 37.8,
                        longitude: -122.2,
                    })),
                },
            },
        ]),
    );
    const snapshot = createTvAreaSnapshot(areas, feeds, 0, cameras);
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= 900_000);
    assert.equal(snapshot.areas.length, 25);
    assert.ok(snapshot.areas.every((area) => area.changes.length > 0));
});
