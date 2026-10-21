import assert from 'node:assert/strict';
import { readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from './regional-catalogs.mjs';
import { validateSourceGeometry } from './source-geometry-review.mjs';

export const AUTOMATIC_QUARANTINE_LIMITS = Object.freeze({
    maximum_ways: 100,
    maximum_way_meters: 6000,
    maximum_total_meters: 10000,
    maximum_way_fraction: 0.00001,
});

function sourceLength(points) {
    assert.ok(Array.isArray(points) && points.length >= 2);
    for (const point of points) {
        assert.ok(
            Array.isArray(point) &&
                point.length === 2 &&
                point.every(Number.isFinite) &&
                Math.abs(point[0]) <= 180 &&
                Math.abs(point[1]) <= 90,
            'Incomplete original source geometry; automatic quarantine blocked',
        );
    }
    const radians = (value) => (value * Math.PI) / 180;
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        const [lon1, lat1] = points[i - 1],
            [lon2, lat2] = points[i];
        const a =
            Math.sin(radians(lat2 - lat1) / 2) ** 2 +
            Math.cos(radians(lat1)) *
                Math.cos(radians(lat2)) *
                Math.sin(radians(lon2 - lon1) / 2) ** 2;
        length += 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
    }
    return length;
}

export function createAutomaticReview(directory, manifest) {
    const limits = AUTOMATIC_QUARANTINE_LIMITS;
    assert.match(manifest.source?.name ?? '', /^us-\d{6}\.osm\.pbf$/);
    assert.match(manifest.source?.md5 ?? '', /^[a-f0-9]{32}$/);
    assert.equal(manifest.quarantine?.key, 'source-geometry.jsonl');
    assert.ok(
        Number.isSafeInteger(manifest.record_count) &&
            manifest.record_count > 0,
    );
    const count = manifest.invalid_source_geometry_count;
    assert.ok(
        Number.isSafeInteger(count) &&
            count >= 0 &&
            count <= limits.maximum_ways,
        'Automatic quarantine way-count limit exceeded',
    );
    assert.ok(
        count / (manifest.record_count + count) <= limits.maximum_way_fraction,
        'Automatic quarantine fraction limit exceeded',
    );
    const bytes = readFileSync(path.join(directory, 'source-geometry.jsonl'));
    assert.equal(
        hash(bytes),
        manifest.quarantine.sha256,
        'Source geometry evidence checksum mismatch',
    );
    const lines = bytes.toString('utf8').trimEnd().split('\n').filter(Boolean);
    assert.equal(lines.length, count);
    let total = 0;
    const entries = lines.map((line) => {
        const record = JSON.parse(line);
        assert.equal(
            record.reason,
            'coincident_distinct_nodes',
            'Only independently proven source coincidence is eligible for automatic quarantine',
        );
        const length = sourceLength(record.source_coordinates);
        assert.ok(
            length <= limits.maximum_way_meters,
            'Automatic quarantine per-way length limit exceeded',
        );
        total += length;
        assert.ok(
            total <= limits.maximum_total_meters,
            'Automatic quarantine total-length limit exceeded',
        );
        return {
            osm_way_id: record.osm_way_id,
            reason: record.reason,
            record_sha256: hash(Buffer.from(line)),
            rationale: `Automatic bounded source-defect review: original PBF nodes ${record.node_ids?.[record.node_index - 1]} and ${record.node_ids?.[record.node_index]} have exactly identical coordinates. Exclude the entire ${length.toFixed(3)} meter way without merging distinct node IDs.`,
            length_meters: Math.round(length * 1000) / 1000,
        };
    });
    const review = {
        schema_version: 1,
        source: manifest.source,
        quarantine_sha256: manifest.quarantine.sha256,
        review_method: 'bounded-source-coincidence-v1',
        limits,
        impact: {
            excluded_ways: count,
            total_length_meters: Math.round(total * 1000) / 1000,
        },
        entries,
    };
    // The same strict gate used for manual review proves every source defect and exact record hash.
    validateSourceGeometry(directory, manifest, review);
    return review;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
    const [directory, filename] = process.argv.slice(2);
    assert.ok(
        directory && filename,
        'Usage: automatic-source-geometry-review.mjs OUTPUT REVIEW_FILE',
    );
    const manifest = JSON.parse(
        readFileSync(path.join(directory, 'manifest.json')),
    );
    const review = createAutomaticReview(directory, manifest);
    writeFileSync(`${filename}.partial`, JSON.stringify(review));
    renameSync(`${filename}.partial`, filename);
    console.log(`SOURCE_GEOMETRY_REVIEW ${JSON.stringify(review.impact)}`);
}
