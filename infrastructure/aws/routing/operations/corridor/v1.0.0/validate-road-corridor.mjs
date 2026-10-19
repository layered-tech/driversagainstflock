import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRoadCorridorWays } from './road-corridor-contract.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Validate one tile at a time; retain only identity hashes across tile boundaries.
export function validateRoadCorridorArtifact(directory, expected = {}) {
    const started = performance.now();
    const manifest = JSON.parse(
        readFileSync(path.join(directory, 'manifest.json')),
    );
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.region, 'wisconsin');
    assert.equal(manifest.format, 'gzip-jsonl-whole-ways');
    assert.equal(manifest.deduplication_key, 'id');
    for (const [key, value] of Object.entries(expected)) {
        assert.equal(
            key === 'source_md5' ? manifest.source.md5 : manifest[key],
            value,
        );
    }
    assert.ok(manifest.tiles.length > 0);
    const ways = new Map();
    const nodes = new Map();
    const tiles = new Set();
    const classes = {};
    const directions = {};
    let bytes = 0;
    let uncompressedBytes = 0;
    let maxTileBytes = 0;
    let maxTileRecords = 0;
    let roundabouts = 0;
    let tunnels = 0;
    let unknownSpeeds = 0;
    for (const tile of manifest.tiles) {
        assert.ok(!tiles.has(tile.id), `duplicate tile ${tile.id}`);
        tiles.add(tile.id);
        assert.match(tile.key, /^tiles\/-?\d+_-?\d+-[a-f0-9]{64}\.jsonl\.gz$/);
        assert.equal(tile.key, `tiles/${tile.id}-${tile.sha256}.jsonl.gz`);
        const compressed = readFileSync(path.join(directory, tile.key));
        assert.equal(compressed.length, tile.size_bytes);
        assert.equal(hash(compressed), tile.sha256);
        const contents = gunzipSync(compressed);
        assert.equal(contents.length, tile.uncompressed_size_bytes);
        const records = contents
            .toString('utf8')
            .trimEnd()
            .split('\n')
            .map(JSON.parse);
        assert.equal(records.length, tile.record_count);
        validateRoadCorridorWays(records);
        bytes += compressed.length;
        uncompressedBytes += contents.length;
        maxTileBytes = Math.max(maxTileBytes, compressed.length);
        maxTileRecords = Math.max(maxTileRecords, records.length);
        for (const way of records) {
            const signature = hash(JSON.stringify(way));
            if (ways.has(way.id)) {
                assert.equal(
                    ways.get(way.id),
                    signature,
                    `conflicting repeated way ${way.id}`,
                );
                continue;
            }
            ways.set(way.id, signature);
            way.node_ids.forEach((id, index) => {
                const coordinate = JSON.stringify(way.coordinates[index]);
                if (nodes.has(id))
                    assert.equal(
                        nodes.get(id),
                        coordinate,
                        `conflicting node ${id}`,
                    );
                else nodes.set(id, coordinate);
            });
            classes[way.road_class] = (classes[way.road_class] ?? 0) + 1;
            directions[way.direction] = (directions[way.direction] ?? 0) + 1;
            roundabouts += Number(way.is_roundabout);
            tunnels += Number(way.tunnel);
            unknownSpeeds += Number(way.speed_limit_mph === null);
        }
    }
    assert.equal(ways.size, manifest.record_count);
    return {
        release: manifest.release_id,
        validation_only: manifest.validation_only === true,
        coverage: manifest.coverage,
        source: manifest.source,
        tiles: tiles.size,
        ways: ways.size,
        nodes: nodes.size,
        compressed_bytes: bytes,
        uncompressed_bytes: uncompressedBytes,
        largest_tile_bytes: maxTileBytes,
        largest_tile_records: maxTileRecords,
        classes,
        directions,
        roundabouts,
        tunnels,
        unknown_speeds: unknownSpeeds,
        invalid_source_geometry_count: manifest.invalid_source_geometry_count,
        validation_seconds: (performance.now() - started) / 1000,
        peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    assert.ok(
        process.argv[2],
        'Usage: node validate-road-corridor.mjs DIRECTORY [RELEASE SOURCE_MD5]',
    );
    const expected = process.argv[3]
        ? { release_id: process.argv[3], source_md5: process.argv[4] }
        : {};
    console.log(
        JSON.stringify(
            validateRoadCorridorArtifact(process.argv[2], expected),
            null,
            2,
        ),
    );
}
