import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { hash } from '../corridor/v1.2.0/regional-catalogs.mjs';
import { validateSourceGeometry } from '../corridor/v1.2.0/source-geometry-review.mjs';

function fixture(t) {
    const directory = mkdtempSync(
        path.join(tmpdir(), 'source-geometry-review-'),
    );
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const record = {
        osm_way_id: 123,
        reason: 'coincident_distinct_nodes',
        node_index: 1,
        node_ids: [10, 11, 12],
        supplied_coordinates: [
            [-89, 43],
            [-89, 43],
            [-88.99, 43],
        ],
        source_coordinates: [
            [-89, 43],
            [-89, 43],
            [-88.99, 43],
        ],
    };
    const line = JSON.stringify(record);
    const bytes = Buffer.from(line + '\n');
    writeFileSync(path.join(directory, 'source-geometry.jsonl'), bytes);
    const manifest = {
        source: { name: 'us-261020.osm.pbf', md5: 'a'.repeat(32) },
        invalid_source_geometry_count: 1,
        quarantine: {
            key: 'source-geometry.jsonl',
            sha256: hash(bytes),
            record_count: 1,
        },
    };
    const review = {
        schema_version: 1,
        source: manifest.source,
        quarantine_sha256: hash(bytes),
        entries: [
            {
                osm_way_id: 123,
                reason: record.reason,
                record_sha256: hash(Buffer.from(line)),
                rationale:
                    'Two distinct source nodes have exactly the same coordinates; exclude this whole way.',
            },
        ],
    };
    return { directory, record, manifest, review };
}

test('nonzero source rejections remain blocked until every exact record is reviewed', (t) => {
    const f = fixture(t);
    assert.throws(
        () => validateSourceGeometry(f.directory, f.manifest),
        /unreviewed/i,
    );
    assert.deepEqual(
        [...validateSourceGeometry(f.directory, f.manifest, f.review)],
        [123],
    );
    f.review.entries = [];
    assert.throws(() =>
        validateSourceGeometry(f.directory, f.manifest, f.review),
    );
});

for (const field of [
    'source',
    'quarantine_sha256',
    'record_sha256',
    'osm_way_id',
    'reason',
]) {
    test(`review rejects a mismatched ${field}`, (t) => {
        const f = fixture(t);
        if (field === 'source')
            f.review.source = { ...f.review.source, md5: 'b'.repeat(32) };
        else if (field === 'quarantine_sha256')
            f.review[field] = 'b'.repeat(64);
        else
            f.review.entries[0][field] = field === 'osm_way_id' ? 124 : 'wrong';
        assert.throws(() =>
            validateSourceGeometry(f.directory, f.manifest, f.review),
        );
    });
}

test('review cannot excuse coordinate collapse introduced by the exporter', (t) => {
    const f = fixture(t);
    f.record.source_coordinates[1][0] += 0.0000001;
    const line = JSON.stringify(f.record),
        bytes = Buffer.from(line + '\n');
    writeFileSync(path.join(f.directory, 'source-geometry.jsonl'), bytes);
    f.manifest.quarantine.sha256 = f.review.quarantine_sha256 = hash(bytes);
    f.review.entries[0].record_sha256 = hash(Buffer.from(line));
    assert.throws(
        () => validateSourceGeometry(f.directory, f.manifest, f.review),
        /source.*coincident|exporter/i,
    );
});

test('unchanged source rejection evidence is mandatory', (t) => {
    const f = fixture(t);
    writeFileSync(path.join(f.directory, 'source-geometry.jsonl'), '\n');
    assert.throws(() =>
        validateSourceGeometry(f.directory, f.manifest, f.review),
    );
});

test('zero rejected ways needs no exclusion policy but still verifies the evidence', (t) => {
    const f = fixture(t);
    writeFileSync(path.join(f.directory, 'source-geometry.jsonl'), '');
    f.manifest.invalid_source_geometry_count =
        f.manifest.quarantine.record_count = 0;
    f.manifest.quarantine.sha256 = hash(Buffer.alloc(0));
    assert.equal(validateSourceGeometry(f.directory, f.manifest).size, 0);
});
