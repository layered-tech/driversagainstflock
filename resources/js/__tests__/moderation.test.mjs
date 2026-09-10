import { renderToString } from '@vue/server-renderer';
import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { createRenderer, createSSRApp, h, nextTick } from 'vue';
import {
    absoluteTime,
    boundsGeometry,
    changesetNodes,
    drawnGeometry,
    filterQuery,
    localTime,
    locationLabel,
    moderationDetailNodes,
    moderationNodeFeatures,
    moderationNodeRecordId,
    nodeChangeColors,
    nodeProfileSummary,
    nodeVersionHistory,
    relativeTime,
} from '../moderation.js';
import { useModerationTime } from '../useModerationTime.js';

test('timestamps use the viewer timezone across daylight saving and date rollover', () => {
    const previous = process.env.TZ;
    try {
        for (const [zone, input, expected] of [
            [
                'America/Chicago',
                '2026-09-10T02:15:00Z',
                'Sep 9, 2026, 9:15 PM CDT',
            ],
            [
                'America/Chicago',
                '2026-01-10T02:15:00Z',
                'Jan 9, 2026, 8:15 PM CST',
            ],
            [
                'Asia/Kolkata',
                '2026-09-10T02:15:00Z',
                'Sep 10, 2026, 7:45 AM GMT+5:30',
            ],
            ['UTC', '2026-09-10T02:15:00Z', 'Sep 10, 2026, 2:15 AM UTC'],
            [
                'America/Chicago',
                '2026-09-10 02:15:00+00',
                'Sep 9, 2026, 9:15 PM CDT',
            ],
            [
                'America/Chicago',
                '2026-09-10 02:15:00.123456+00',
                'Sep 9, 2026, 9:15 PM CDT',
            ],
            [
                'America/Chicago',
                '2026-09-09 21:15:00-05',
                'Sep 9, 2026, 9:15 PM CDT',
            ],
            [
                'America/Chicago',
                '2026-09-10 07:45:00+05:30',
                'Sep 9, 2026, 9:15 PM CDT',
            ],

            [
                'America/Chicago',
                '2026-09-10T04:15:00+02:00',
                'Sep 9, 2026, 9:15 PM CDT',
            ],
            [
                'America/Chicago',
                '2026-09-10 02:15:00',
                'Sep 9, 2026, 9:15 PM CDT',
            ],
        ]) {
            process.env.TZ = zone;
            assert.equal(absoluteTime(input), expected);
            assert.equal(localTime(input), expected);
        }
        for (const value of [null, undefined, '', 'invalid']) {
            assert.equal(localTime(value), '—');
            assert.equal(absoluteTime(value), '—');
        }
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});

test('moderation map nodes carry counter-matched change kinds and selectable IDs', () => {
    const features = moderationNodeFeatures([
        {
            id: 1,
            node_id: 200,
            osm_version: 1,
            visible: true,
            longitude: -97.5,
            latitude: 30.5,
        },
        {
            id: 2,
            node_id: 201,
            osm_version: 3,
            visible: true,
            longitude: -97.6,
            latitude: 30.6,
        },
        {
            id: 3,
            node_id: 202,
            osm_version: 4,
            visible: false,
            longitude: -97.7,
            latitude: 30.7,
        },
    ]);

    assert.deepEqual(
        features.map((feature) => feature.properties.change),
        ['added', 'edited', 'deleted'],
    );
    assert.deepEqual(nodeChangeColors, {
        added: '#1FBF6B',
        edited: '#FFB02E',
        deleted: '#FF4D4F',
    });
    assert.equal(moderationNodeRecordId(features[1]), 2);
    assert.equal(moderationNodeRecordId({ properties: {} }), null);
});

test('area details expose their nodes to the expanded map', () => {
    const nodes = [{ id: 123, latitude: 30.1, longitude: -97.7 }];

    assert.deepEqual(moderationDetailNodes('areas', { nodes }), nodes);
    assert.deepEqual(
        moderationDetailNodes('changesets', { versions: { data: nodes } }),
        nodes,
    );
});

test('changeset maps use node versions returned by the detail endpoint', () => {
    const nodes = [
        { node_id: 200, longitude: -97.5, latitude: 30.5 },
        { node_id: 201, longitude: -97.6, latitude: 30.6 },
    ];

    assert.deepEqual(changesetNodes({ versions: { data: nodes } }), nodes);
    assert.deepEqual(changesetNodes({}), []);
});

test('node profiles derive history, movement, tags, editors, and open flags from stored versions', () => {
    const versions = [
        {
            osm_version: 1,
            visible: true,
            latitude: 30.5,
            longitude: -97.5,
            osm_uid: 123,
            osm_user: 'first_mapper',
            osm_updated_at: '2026-09-01T00:00:00Z',
            tags: { 'surveillance:type': 'ALPR' },
        },
        {
            osm_version: 2,
            visible: true,
            latitude: 30.5005,
            longitude: -97.5005,
            osm_uid: 456,
            osm_user: 'second_mapper',
            osm_updated_at: '2026-09-02T00:00:00Z',
            tags: {
                'surveillance:type': 'ALPR',
                operator: 'Flock Safety',
            },
        },
        {
            osm_version: 3,
            visible: false,
            latitude: 30.5005,
            longitude: -97.5005,
            location_is_historical: true,
            osm_uid: 456,
            osm_user: 'second_mapper',
            osm_updated_at: '2026-09-03T00:00:00Z',
            tags: {},
        },
    ];
    const history = nodeVersionHistory(versions);
    const summary = nodeProfileSummary(versions, [
        { status: 'open', rule: { enabled: true } },
        { status: 'dismissed', rule: { enabled: true } },
    ]);

    assert.deepEqual(
        history.map((version) => version.kind),
        ['Deleted', 'Moved', 'Created'],
    );
    assert.ok(history[1].movement_meters > 0);
    assert.deepEqual(summary.current_tags, {
        'surveillance:type': 'ALPR',
        operator: 'Flock Safety',
    });
    assert.equal(summary.editors.length, 2);
    assert.equal(summary.tag_edits, 3);
    assert.equal(summary.moves, 1);
    assert.equal(summary.open_flags, 1);
});

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
    assert.equal(relativeTime('2026-09-07 11:55:00+00', now), '5m ago');
    assert.equal(relativeTime(null, now), '—');
    assert.equal(relativeTime('invalid', now), '—');
});

test('localized dates wait for mounting and reactively replace the SSR placeholder', async () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/Chicago';
    try {
        const timestamp = '2026-09-10 02:15:00+00';
        let output;
        const component = {
            setup() {
                const { absoluteTime, localDate } = useModerationTime();
                return () => {
                    output = `${absoluteTime(timestamp)} | ${localDate(timestamp)}`;
                    return h('time', output);
                };
            },
        };
        assert.equal(
            await renderToString(createSSRApp(component)),
            '<time>— | —</time>',
        );
        const renderer = createRenderer({
            createElement: () => ({}),
            parentNode: () => null,
            nextSibling: () => null,
            setElementText: () => {},
            insert: () => {},
            remove: () => {},
            patchProp: () => {},
        });
        const app = renderer.createApp(component);
        app.mount({});
        assert.equal(output, '— | —');
        await nextTick();
        assert.equal(output, 'Sep 9, 2026, 9:15 PM CDT | Sep 9, 2026');
        app.unmount();
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});
