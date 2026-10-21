import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hash } from '../corridor/v1.2.0/regional-catalogs.mjs';
import { validateSourceGeometry } from '../corridor/v1.2.0/source-geometry-review.mjs';

test('audit independently recovers original PBF coordinates when the supplier collapses nodes', (t) => {
    const jar = process.env.GRAPHHOPPER_TEST_JAR;
    assert.ok(jar, 'Set GRAPHHOPPER_TEST_JAR to the pinned 11.0 jar');
    assert.equal(
        hash(readFileSync(jar)),
        'b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def',
    );
    const directory = mkdtempSync(
        path.join(tmpdir(), 'source-geometry-export-'),
    );
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const here = fileURLToPath(new URL('./', import.meta.url));
    execFileSync('javac', [
        '--release',
        '17',
        '-cp',
        jar,
        '-d',
        directory,
        path.join(here, '../corridor/v1.2.0/RoadCorridorExporter.java'),
        path.join(here, 'CorridorPbfFixture.java'),
        path.join(here, 'SourceGeometryAuditFixture.java'),
    ]);
    for (const collapsed of [false, true]) {
        const elements = [
            { type: 'node', id: 10, lon: -89, lat: 43 },
            {
                type: 'node',
                id: 11,
                lon: collapsed ? -89 : -88.9999999,
                lat: 43,
            },
            { type: 'node', id: 12, lon: -88.99, lat: 43 },
            {
                type: 'way',
                id: 123,
                nodes: [10, 11, 12],
                tags: { highway: 'residential' },
            },
        ];
        const input = path.join(directory, `source-${collapsed}.json`),
            source = path.join(directory, `source-${collapsed}.osm.pbf`),
            output = path.join(directory, `output-${collapsed}`),
            classpath = `${directory}${path.delimiter}${jar}`;
        writeFileSync(input, JSON.stringify(elements));
        execFileSync('java', [
            '-cp',
            classpath,
            'CorridorPbfFixture',
            input,
            source,
        ]);
        execFileSync('java', [
            '-cp',
            classpath,
            'SourceGeometryAuditFixture',
            source,
            output,
        ]);
        const bytes = readFileSync(path.join(output, 'source-geometry.jsonl')),
            line = bytes.toString().trim(),
            record = JSON.parse(line);
        assert.equal(record.osm_way_id, 123);
        assert.deepEqual(record.node_ids, [10, 11, 12]);
        assert.deepEqual(
            record.supplied_coordinates[0],
            record.supplied_coordinates[1],
        );
        assert.equal(record.source_coordinates[1][0], elements[1].lon);
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
                        'Reviewed the original source node coordinates independently.',
                },
            ],
        };
        if (collapsed)
            assert.equal(
                validateSourceGeometry(output, manifest, review).size,
                1,
            );
        else
            assert.throws(
                () => validateSourceGeometry(output, manifest, review),
                /source.*coincident|exporter/i,
            );
    }
});
