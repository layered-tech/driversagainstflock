import assert from 'node:assert/strict';
import test from 'node:test';
import { flagFacts, flagSummary, flagTiming } from '../moderationFlags.js';

test('driver reports show report frequency and occurrence time, not node edit or reconciliation time', () => {
    const flag = {
        source: 'alpr_presence',
        evaluated_at: '2026-09-21T23:00:00Z',
        evidence: {
            report_count: 2,
            first_report_at: '2026-09-21T21:34:30Z',
            latest_report_at: '2026-09-21T22:05:20Z',
            latest_received_at: '2026-09-21T22:05:22Z',
        },
    };
    assert.equal(flagSummary(flag), '2 Not there reports');
    assert.deepEqual(flagTiming(flag), {
        label: 'Latest report',
        at: flag.evidence.latest_report_at,
    });
    assert.deepEqual(
        flagFacts(flag).map(({ label, value }) => [label, value]),
        [
            ['Reports', '2'],
            ['First reported', flag.evidence.first_report_at],
            ['Latest reported', flag.evidence.latest_report_at],
            ['Latest received', flag.evidence.latest_received_at],
        ],
    );
    assert.equal(
        flagSummary({ ...flag, evidence: { report_count: 1 } }),
        '1 Not there report',
    );
    assert.equal(
        flagSummary({ source: 'alpr_presence' }),
        'Not there report count unavailable',
    );
});

test('rule evidence is readable and repeated evaluations are not counted as occurrences', () => {
    const flag = {
        source: 'rule',
        created_at: '2026-09-01T00:00:00Z',
        evaluated_at: '2026-09-21T00:00:00Z',
        evidence: { missing_tags: ['operator', 'direction'] },
    };
    assert.equal(flagSummary(flag), 'Missing tags: operator, direction');
    assert.deepEqual(flagTiming(flag), {
        label: 'Last checked',
        at: flag.evaluated_at,
    });
    assert.ok(
        flagFacts(flag).some(
            ({ label, value }) =>
                label === 'Repeat occurrences' && value === 'Not recorded',
        ),
    );
    assert.ok(
        flagFacts(flag).some(
            ({ label, value }) =>
                label === 'First flagged' && value === flag.created_at,
        ),
    );
    const invalid = {
        evidence: {
            tag: 'direction',
            value: '999',
            expected: { min: 0, max: 360 },
        },
    };
    assert.equal(flagSummary(invalid), 'Invalid direction: 999');
    assert.ok(
        flagFacts(invalid).some(
            ({ label, value }) =>
                label === 'Expected value' &&
                value === 'Minimum: 0 · Maximum: 360',
        ),
    );
});

test('proximity evidence identifies the other node on either side and handles unavailable road distances', () => {
    const duplicate = {
        node_id: 200,
        related_node_id: 300,
        evidence: { distance_meters: 8.2, radius_meters: 25 },
    };
    assert.equal(
        flagSummary(duplicate, 200),
        'Node 300 is 8.2 m away (within 25 m)',
    );
    assert.equal(
        flagSummary(duplicate, 300),
        'Node 200 is 8.2 m away (within 25 m)',
    );
    assert.equal(
        flagSummary({
            evidence: { distance_meters: null, maximum_meters: 50 },
        }),
        'No matching road found within 50 m',
    );
    assert.equal(
        flagSummary({ evidence: { distance_meters: 65, maximum_meters: 50 } }),
        'Nearest matching road is 65 m away (maximum 50 m)',
    );
    assert.equal(flagSummary({}), 'Rule evidence unavailable');
    assert.deepEqual(flagTiming({}), { label: 'Last checked', at: null });
});
