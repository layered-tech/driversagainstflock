import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hash } from './regional-catalogs.mjs';

function validCoordinate(point) {
    return (
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(Number.isFinite) &&
        Math.abs(point[0]) <= 180 &&
        Math.abs(point[1]) <= 90
    );
}

function assertSourceDefect(record) {
    const {
        node_ids: ids,
        source_coordinates: points,
        node_index: index,
    } = record;
    assert.ok(
        Array.isArray(ids) &&
            Array.isArray(points) &&
            ids.length === points.length,
    );
    assert.ok(Number.isSafeInteger(index) && index >= 0 && index < ids.length);
    if (record.reason === 'coincident_distinct_nodes') {
        assert.ok(index > 0 && ids[index] !== ids[index - 1]);
        assert.ok(
            validCoordinate(points[index]) &&
                validCoordinate(points[index - 1]),
        );
        assert.deepEqual(
            points[index],
            points[index - 1],
            'Source nodes are not coincident; investigate exporter precision',
        );
    } else if (record.reason === 'invalid_node') {
        assert.ok(
            ids[index] <= 0 || !validCoordinate(points[index]),
            'Valid source node; investigate exporter coordinate lookup',
        );
    } else if (record.reason === 'insufficient_points') {
        assert.equal(
            new Set(ids).size,
            1,
            'Source has distinct nodes; investigate exporter point removal',
        );
    } else {
        assert.fail(`Unknown source geometry reason: ${record.reason}`);
    }
}

export function validateSourceGeometry(directory, manifest, review) {
    const count = manifest.invalid_source_geometry_count;
    assert.ok(Number.isSafeInteger(count) && count >= 0 && count <= 100);
    assert.equal(manifest.quarantine?.key, 'source-geometry.jsonl');
    assert.equal(manifest.quarantine.record_count, count);
    const bytes = readFileSync(path.join(directory, manifest.quarantine.key));
    assert.equal(
        hash(bytes),
        manifest.quarantine.sha256,
        'Source geometry evidence checksum mismatch',
    );
    const lines = bytes.toString('utf8').trimEnd().split('\n').filter(Boolean);
    assert.equal(lines.length, count);
    if (!count) return new Set();
    assert.ok(
        review,
        `${count} unreviewed source geometry rejections; publication blocked`,
    );
    assert.equal(review.schema_version, 1);
    assert.deepEqual(
        review.source,
        manifest.source,
        'Review is for a different source snapshot',
    );
    assert.equal(review.quarantine_sha256, manifest.quarantine.sha256);
    assert.equal(review.entries?.length, count);
    const entries = new Map(
        review.entries.map((entry) => [entry.osm_way_id, entry]),
    );
    assert.equal(entries.size, count);
    const excluded = new Set();
    for (const line of lines) {
        const record = JSON.parse(line),
            entry = entries.get(record.osm_way_id);
        assert.ok(
            Number.isSafeInteger(record.osm_way_id) && record.osm_way_id > 0,
        );
        assert.ok(!excluded.has(record.osm_way_id), 'Duplicate rejected way');
        assert.ok(entry, `Unreviewed way ${record.osm_way_id}`);
        assert.equal(entry.reason, record.reason);
        assert.equal(entry.record_sha256, hash(Buffer.from(line)));
        assert.ok(
            typeof entry.rationale === 'string' &&
                entry.rationale.trim().length >= 20,
        );
        assertSourceDefect(record);
        excluded.add(record.osm_way_id);
    }
    if (manifest.quarantine.review_key) {
        assert.match(manifest.quarantine.review_sha256, /^[a-f0-9]{64}$/);
        assert.equal(
            manifest.quarantine.review_key,
            `geometry-review-${manifest.quarantine.review_sha256}.json`,
        );
        const saved = readFileSync(
            path.join(directory, manifest.quarantine.review_key),
        );
        assert.equal(hash(saved), manifest.quarantine.review_sha256);
        assert.deepEqual(JSON.parse(saved), review);
    }
    return excluded;
}
