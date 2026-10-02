import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import {
    profileTimeline,
    timelineSpacing,
    timelineVolume,
} from '../moderation-profile-timeline.js';

test('timeline groups daily bursts and measures spacing between listed changesets', () => {
    const rows = [
        {
            id: 4,
            changed_at: '2026-09-10T12:20:00Z',
            total: 12,
            osm_num_changes: 30,
        },
        {
            id: 3,
            changed_at: '2026-09-10T12:05:00Z',
            total: '8',
            osm_num_changes: 10,
        },
        {
            id: 2,
            changed_at: '2026-09-10T12:00:00Z',
            total: 1,
            osm_num_changes: 5,
        },
        {
            id: 1,
            changed_at: '2026-09-01T12:00:00Z',
            total: 2,
            osm_num_changes: null,
        },
    ];
    const groups = profileTimeline(rows);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].day, '2026-09-10');
    assert.equal(groups[0].entries.length, 3);
    assert.equal(groups[0].span, 'over 20 minutes');
    assert.equal(groups[0].volume.total, 21);
    assert.equal(groups[0].first, Date.parse(rows[2].changed_at));
    assert.equal(groups[0].last, Date.parse(rows[0].changed_at));
    assert.equal(groups[0].entries[0].spacing, null);
    assert.equal(
        groups[0].entries[1].spacing,
        '15 minutes between listed changesets',
    );
    assert.equal(
        groups[0].entries[2].spacing,
        '5 minutes between listed changesets',
    );
    assert.equal(
        groups[1].entries[0].spacing,
        '9 days between listed changesets',
    );
    assert.equal(groups[1].entries[0].osmVolume.unavailable, 1);
    assert.deepEqual(
        groups.flatMap((group) => group.entries.map(({ row }) => row)),
        rows,
    );
});

test('missing timestamps and counts stay unavailable and never become invented zeroes or gaps', () => {
    const groups = profileTimeline([
        { id: 1, changed_at: null, total: null },
        { id: 2, changed_at: 'invalid', total: '' },
        {
            id: 3,
            changed_at: '2026-09-10T12:00:00Z',
            total: 0,
            osm_num_changes: 0,
        },
    ]);
    assert.equal(groups[0].day, null);
    assert.equal(groups[0].first, null);
    assert.deepEqual(groups[0].volume, { total: 0, unavailable: 2, known: 0 });
    assert.equal(
        groups[0].entries[0].spacing,
        'Spacing unavailable: missing timestamp',
    );
    assert.equal(
        groups[1].entries[0].spacing,
        'Spacing unavailable: missing timestamp',
    );
    assert.deepEqual(groups[1].volume, { total: 0, unavailable: 0, known: 1 });
    assert.deepEqual(
        timelineVolume(
            [
                { total: 0 },
                { total: null },
                { total: '3' },
                { total: -1 },
                { total: 'invalid' },
            ],
            'total',
        ),
        { total: 3, unavailable: 3, known: 2 },
    );
});

test('UTC dates handle midnight and timestamp offsets consistently', () => {
    const groups = profileTimeline([
        { id: 1, changed_at: '2026-09-11T00:05:00Z' },
        { id: 2, changed_at: '2026-09-10T18:55:00-05:00' },
    ]);
    assert.deepEqual(
        groups.map(({ day }) => day),
        ['2026-09-11', '2026-09-10'],
    );
    assert.equal(
        groups[1].entries[0].spacing,
        '10 minutes between listed changesets',
    );
});

test('database timestamps without timezone use UTC regardless of the viewer timezone', () => {
    const previousTimezone = process.env.TZ;
    try {
        for (const timezone of ['America/Chicago', 'Asia/Tokyo']) {
            process.env.TZ = timezone;
            const groups = profileTimeline([
                { id: 1, changed_at: '2026-09-10 02:15:00' },
                { id: 2, changed_at: '2026-09-10 02:00:00+00' },
            ]);
            assert.equal(groups.length, 1);
            assert.equal(groups[0].day, '2026-09-10');
            assert.equal(groups[0].last, Date.parse('2026-09-10T02:15:00Z'));
            assert.equal(
                groups[0].entries[1].spacing,
                '15 minutes between listed changesets',
            );
        }
    } finally {
        if (previousTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = previousTimezone;
    }
});

test('pagination and filters do not synthesize unseen changesets or extend visible time ranges', () => {
    const groups = profileTimeline([
        { id: 20, changed_at: '2026-09-10T12:00:00Z', total: 2 },
    ]);
    assert.equal(groups[0].entries.length, 1);
    assert.equal(groups[0].first, groups[0].last);
    assert.equal(groups[0].entries[0].spacing, null);
    assert.deepEqual(profileTimeline([]), []);
});

test('chronological ascending rows keep their order and nonchronological sorts do not imply gaps', () => {
    const rows = [
        { id: 1, changed_at: '2026-09-01T12:00:00Z' },
        { id: 2, changed_at: '2026-09-02T12:00:00Z' },
        { id: 3, changed_at: '2026-09-03T12:00:00Z' },
    ];
    assert.equal(
        profileTimeline(rows)[1].entries[0].spacing,
        '1 day between listed changesets',
    );
    for (const groups of [
        profileTimeline(rows, false),
        profileTimeline([rows[1], rows[0], rows[2]]),
    ]) {
        assert.ok(
            groups.every((group) =>
                group.entries.every(
                    ({ spacing }) =>
                        spacing === 'Spacing unavailable in this sort order',
                ),
            ),
        );
    }
});

test('spacing distinguishes simultaneous changesets, minutes, hours and long gaps', () => {
    assert.equal(timelineSpacing(0), 'Same timestamp');
    assert.equal(
        timelineSpacing(30_000),
        'Less than a minute between listed changesets',
    );
    assert.equal(timelineSpacing(60_000), '1 minute between listed changesets');
    assert.equal(
        timelineSpacing(3_600_000),
        '1 hour between listed changesets',
    );
    assert.equal(
        timelineSpacing(7_200_000),
        '2 hours between listed changesets',
    );
    assert.equal(
        timelineSpacing(172_800_000),
        '2 days between listed changesets',
    );
});
