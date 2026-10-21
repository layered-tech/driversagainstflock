import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createAutomaticReview } from '../corridor/v1.3.0/automatic-source-geometry-review.mjs';
import { hash } from '../corridor/v1.3.0/regional-catalogs.mjs';
import { validateSourceGeometry } from '../corridor/v1.3.0/source-geometry-review.mjs';

function fixture(t, records) {
    const directory = mkdtempSync(path.join(tmpdir(), 'automatic-geometry-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const lines = records.map((record) =>
        JSON.stringify(record).replaceAll(':', ': '),
    );
    const bytes = Buffer.from(lines.length ? lines.join('\n') + '\n' : '');
    writeFileSync(path.join(directory, 'source-geometry.jsonl'), bytes);
    const manifest = {
        source: { name: 'us-261020.osm.pbf', md5: 'a'.repeat(32) },
        record_count: 31935978,
        invalid_source_geometry_count: records.length,
        quarantine: {
            key: 'source-geometry.jsonl',
            record_count: records.length,
            sha256: hash(bytes),
        },
    };
    return { directory, manifest, lines };
}

function road(id = 123, longitudeExtent = 0.001) {
    return {
        osm_way_id: id,
        reason: 'coincident_distinct_nodes',
        road_class: 'residential',
        name: 'Fixture road',
        node_index: 1,
        node_ids: [id * 3, id * 3 + 1, id * 3 + 2],
        supplied_coordinates: [
            [-89, 43],
            [-89, 43],
            [-89 + longitudeExtent, 43],
        ],
        source_coordinates: [
            [-89, 43],
            [-89, 43],
            [-89 + longitudeExtent, 43],
        ],
    };
}

test('bounded proven defects receive exact source-bound reviews without manual intervention', (t) => {
    const f = fixture(t, [road()]);
    const review = createAutomaticReview(f.directory, f.manifest);
    assert.equal(
        review.entries[0].record_sha256,
        hash(Buffer.from(f.lines[0])),
    );
    assert.equal(review.review_method, 'bounded-source-coincidence-v1');
    assert.ok(review.impact.total_length_meters > 80);
    assert.deepEqual(
        [...validateSourceGeometry(f.directory, f.manifest, review)],
        [123],
    );
});

test('the ten real reviewed nationwide defects fit the automatic policy', (t) => {
    const records = readFileSync(
        new URL('./fixtures/us-261020-source-geometry.jsonl', import.meta.url),
        'utf8',
    )
        .trimEnd()
        .split('\n')
        .map(JSON.parse);
    const f = fixture(t, records);
    const review = createAutomaticReview(f.directory, f.manifest);
    assert.equal(review.entries.length, 10);
    assert.ok(
        review.impact.total_length_meters > 6800 &&
            review.impact.total_length_meters < 7000,
    );
    assert.ok(
        review.entries.some(
            (entry) =>
                entry.osm_way_id === 20307681 && entry.length_meters > 5300,
        ),
    );
    assert.equal(
        validateSourceGeometry(f.directory, f.manifest, review).size,
        10,
    );
});

for (const scenario of [
    'exporter-collapse',
    'missing-source',
    'invalid-node',
    'too-long-way',
    'too-much-total',
    'too-many-ways',
    'too-large-fraction',
    'duplicate-id',
    'evidence-checksum',
]) {
    test(`automatic review blocks ${scenario}`, (t) => {
        let records = [road()];
        if (scenario === 'exporter-collapse')
            records[0].source_coordinates[1][0] += 0.0000001;
        if (scenario === 'missing-source')
            records[0].source_coordinates[2] = null;
        if (scenario === 'invalid-node') records[0].reason = 'invalid_node';
        if (scenario === 'too-long-way') records = [road(123, 0.08)];
        if (scenario === 'too-much-total')
            records = [road(123, 0.07), road(124, 0.07)];
        if (scenario === 'too-many-ways')
            records = Array.from({ length: 101 }, (_, i) => road(i + 100));
        if (scenario === 'duplicate-id') records = [road(), road()];
        const f = fixture(t, records);
        if (scenario === 'too-large-fraction') f.manifest.record_count = 100;
        if (scenario === 'evidence-checksum')
            f.manifest.quarantine.sha256 = 'b'.repeat(64);
        assert.throws(() => createAutomaticReview(f.directory, f.manifest));
    });
}

test('zero defects still verify the quarantine evidence', (t) => {
    const f = fixture(t, []);
    const review = createAutomaticReview(f.directory, f.manifest);
    assert.deepEqual(review.entries, []);
    assert.equal(review.impact.total_length_meters, 0);
    assert.equal(
        validateSourceGeometry(f.directory, f.manifest, review).size,
        0,
    );
});
