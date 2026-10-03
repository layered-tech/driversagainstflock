import assert from 'node:assert/strict';
import test from 'node:test';
import * as flags from '../moderationFlags.js';
import { flagFacts, flagSummary, flagTiming } from '../moderationFlags.js';
import { moderationNodeFeatures } from '../moderation.js';

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
        'Original primary node 300 is 8.2 m away (within 25 m)',
    );
    assert.equal(
        flagSummary(duplicate, 300),
        'Duplicate node 200 is 8.2 m away (within 25 m)',
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

const duplicateFlag = {
    node_id: 300,
    related_node_id: 200,
    evidence: {
        radius_meters: 25,
        locations: { 200: [-97.74, 30.27], 300: [-97.7401, 30.2701] },
        node_versions: { 200: 2, 300: 3 },
    },
};

test('duplicate maps show the other endpoint from either side with distinct node labels', () => {
    for (const [id, other] of [
        [200, 300],
        [300, 200],
    ]) {
        const [longitude, latitude] = duplicateFlag.evidence.locations[id];
        const node = { id, longitude, latitude, osm_version: 2, visible: true };
        const nodes = flags.flagMapNodes(node, [duplicateFlag, duplicateFlag]);
        assert.deepEqual(
            nodes.map((node) => node.id),
            [id, other],
        );
        assert.deepEqual(
            [nodes[1].longitude, nodes[1].latitude],
            duplicateFlag.evidence.locations[other],
        );
        assert.equal(
            nodes[1].osm_version,
            duplicateFlag.evidence.node_versions[other],
        );
        const features = moderationNodeFeatures(nodes);
        assert.equal(
            features[0].properties.label,
            `Node ${id} (${id === 300 ? 'duplicate' : 'original primary'})`,
        );
        assert.equal(
            features[1].properties.label,
            `Node ${other} (${other === 300 ? 'duplicate' : 'original primary'})`,
        );
        assert.equal(features[1].properties.recordId, other);
    }
});

test('duplicate maps skip missing or invalid evidence locations and unrelated flags', () => {
    const node = { id: 200, longitude: -97.74, latitude: 30.27 };
    for (const location of [
        null,
        [],
        [null, 30],
        ['', 30],
        ['invalid', 30],
        [181, 30],
        [-97, 91],
    ]) {
        const flag = {
            ...duplicateFlag,
            evidence: {
                ...duplicateFlag.evidence,
                locations: { 300: location },
            },
        };
        assert.deepEqual(flags.flagMapNodes(node, [flag]), [node]);
        assert.equal(flags.flagRelatedNodeId(flag, 200), 300);
    }
    assert.deepEqual(
        flags.flagMapNodes(node, [
            { ...duplicateFlag, evidence: {} },
            { ...duplicateFlag, node_id: 400, related_node_id: 500 },
        ]),
        [node],
    );
    assert.equal(flags.flagRelatedNodeId({ related_node_id: 0 }, 200), null);
    assert.equal(flags.flagRelatedNodeId(duplicateFlag, 400), null);
});

test('duplicate map evidence preserves zero coordinates and includes every distinct neighbor', () => {
    const node = { id: 300, longitude: 0, latitude: 0 };
    const nodes = flags.flagMapNodes(node, [
        duplicateFlag,
        {
            ...duplicateFlag,
            related_node_id: 400,
            evidence: { radius_meters: 25, locations: { 400: [0, 0] } },
        },
    ]);
    assert.deepEqual(
        nodes.map((node) => node.id),
        [300, 200, 400],
    );
    assert.deepEqual([nodes[2].longitude, nodes[2].latitude], [0, 0]);
});
