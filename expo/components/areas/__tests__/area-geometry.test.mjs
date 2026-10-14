import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    circleGeometry,
    drawnGeometry,
    geometryBounds,
    geometrySquareMiles,
    mergeAreaChanges,
    notificationRoute,
} from '../area-geometry.js';

test('a radius is a fixed closed circle with the requested physical area', () => {
    const center = [-122.24, 37.8];
    const circle = circleGeometry(center, 5);
    assert.deepEqual(circle.coordinates[0][0], circle.coordinates[0].at(-1));
    assert.equal(circle.coordinates[0].length, 65);
    assert.ok(Math.abs(geometrySquareMiles(circle) - Math.PI * 25) < 0.2);
    const bounds = geometryBounds(circle);
    assert.ok(bounds[0] < center[0] && bounds[2] > center[0]);
    assert.deepEqual(center, [-122.24, 37.8]);
    assert.equal(circleGeometry(center, 26), null);
    assert.equal(circleGeometry([179.999, 37], 5), null);
    assert.equal(circleGeometry(null, 5), null);
});

test('drawn shapes close only after three corners and preserve holes in area totals', () => {
    assert.equal(
        drawnGeometry([
            [0, 0],
            [1, 1],
        ]),
        null,
    );
    const shape = drawnGeometry([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ]);
    assert.deepEqual(geometryBounds(shape), [0, 0, 1, 1]);
    const outerArea = geometrySquareMiles(shape);
    const hole = [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.75, 0.75],
        [0.25, 0.75],
        [0.25, 0.25],
    ];
    assert.ok(
        geometrySquareMiles({
            ...shape,
            coordinates: [...shape.coordinates, hole],
        }) < outerArea,
    );
});

test('push navigation accepts only internal routes with positive numeric IDs', () => {
    assert.equal(
        notificationRoute({ area_id: 12, change_id: 23 }),
        '/areas/12/change?changeId=23',
    );
    assert.equal(notificationRoute({ area_id: 12 }), '/areas/12');
    for (const area_id of [
        'https://evil.test',
        '../settings',
        0,
        -1,
        1.2,
        '99999999999999999',
    ])
        assert.equal(notificationRoute({ area_id }), null);
});

test('overlapping feed pages merge without duplicate records', () => {
    assert.deepEqual(
        mergeAreaChanges(
            [{ id: 1 }, { id: 2 }],
            [{ id: 2, kind: 'removed' }, { id: 3 }],
        ),
        [{ id: 1 }, { id: 2, kind: 'removed' }, { id: 3 }],
    );
});
