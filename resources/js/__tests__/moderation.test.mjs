import assert from 'node:assert/strict';
import test from 'node:test';
import {
    boundsGeometry,
    drawnGeometry,
    filterQuery,
    locationLabel,
    relativeTime,
} from '../moderation.js';

test('filters preserve north at zero degrees and remove unset fields', () => {
    assert.deepEqual(
        filterQuery({
            direction_from: 0,
            direction_to: 10,
            user: '',
            statuses: [],
            area: null,
            missing_direction: false,
        }),
        { direction_from: 0, direction_to: 10 },
    );
});
test('bounds produce a closed geographic polygon in longitude latitude order', () => {
    assert.deepEqual(boundsGeometry('30.09, -97.92 → 30.51, -97.56'), {
        type: 'Polygon',
        coordinates: [
            [
                [-97.92, 30.09],
                [-97.56, 30.09],
                [-97.56, 30.51],
                [-97.92, 30.51],
                [-97.92, 30.09],
            ],
        ],
    });
    for (const input of [
        '31,-98,30,-97',
        '30,-197,31,-97',
        'not coordinates',
        '30,-98,31',
    ])
        assert.throws(() => boundsGeometry(input));
});
test('drawn boundaries close without modifying the editable points', () => {
    const points = [
        [-98, 30],
        [-97, 30],
        [-97, 31],
    ];
    assert.deepEqual(drawnGeometry(points).coordinates[0], [
        ...points,
        points[0],
    ]);
    assert.equal(points.length, 3);
    assert.throws(() => drawnGeometry(points.slice(0, 2)));
});
test('location fallback keeps real coordinates and unavailable states', () => {
    assert.equal(
        locationLabel({ latitude: 0, longitude: 0 }),
        '0.0000, 0.0000',
    );
    assert.equal(locationLabel({ bounds: null }), 'Location unavailable');
});

test('table times are compact and invalid timestamps stay unavailable', () => {
    const now = Date.parse('2026-09-07T12:00:00Z');
    assert.equal(relativeTime('2026-09-07T11:59:50Z', now), 'now');
    assert.equal(relativeTime('2026-09-07T11:55:00Z', now), '5m ago');
    assert.equal(relativeTime('2026-09-07T09:00:00Z', now), '3h ago');
    assert.equal(relativeTime('2026-09-04T12:00:00Z', now), '3d ago');
    assert.equal(relativeTime(null, now), '—');
    assert.equal(relativeTime('invalid', now), '—');
});
