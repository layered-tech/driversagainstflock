import assert from 'node:assert/strict';
import {
    closeSync,
    mkdtempSync,
    openSync,
    readFileSync,
    readSync,
    rmSync,
    writeSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { validateRoadCorridorWays } from './road-corridor-contract.mjs';
import { hash } from './regional-catalogs.mjs';

function* identityLines(filename) {
    const fd = openSync(filename, 'r'),
        buffer = Buffer.alloc(65536);
    let pending = '';
    try {
        for (let count; (count = readSync(fd, buffer)) > 0;) {
            const lines = (pending + buffer.toString('ascii', 0, count)).split(
                '\n',
            );
            pending = lines.pop();
            yield* lines;
        }
        if (pending) yield pending;
    } finally {
        closeSync(fd);
    }
}

export function validateRoadCorridorArtifact(directory, expected = {}) {
    const manifest = JSON.parse(
        readFileSync(path.join(directory, 'manifest.json')),
    );
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.region, 'us');
    assert.equal(manifest.format, 'gzip-jsonl-whole-ways');
    assert.equal(manifest.deduplication_key, 'id');
    assert.equal(manifest.invalid_source_geometry_count, 0);
    assert.ok(manifest.tiles.length > 0);
    for (const [key, value] of Object.entries(expected))
        assert.equal(
            key === 'source_md5' ? manifest.source.md5 : manifest[key],
            value,
        );
    // External sorting bounds identity validation memory independently of national node count.
    const scratch = mkdtempSync(path.join(directory, '.identity-'));
    const input = path.join(scratch, 'identities'),
        sorted = path.join(scratch, 'sorted');
    let fd;
    const ids = new Set();
    let compressedBytes = 0,
        largestTileBytes = 0;
    try {
        fd = openSync(input, 'w');
        for (const tile of manifest.tiles) {
            assert.match(tile.id, /^-?\d{1,4}_-?\d{1,4}$/);
            assert.ok(!ids.has(tile.id), `Duplicate tile ${tile.id}`);
            ids.add(tile.id);
            assert.match(tile.sha256, /^[a-f0-9]{64}$/);
            assert.equal(tile.key, `tiles/${tile.id}-${tile.sha256}.jsonl.gz`);
            assert.ok(
                tile.size_bytes > 0 && tile.size_bytes <= 20 * 1024 * 1024,
            );
            assert.ok(
                tile.uncompressed_size_bytes > 0 &&
                    tile.uncompressed_size_bytes <= 100 * 1024 * 1024,
            );
            const compressed = readFileSync(path.join(directory, tile.key));
            assert.equal(compressed.length, tile.size_bytes);
            assert.equal(hash(compressed), tile.sha256);
            const contents = gunzipSync(compressed, {
                maxOutputLength: 100 * 1024 * 1024,
            });
            assert.equal(contents.length, tile.uncompressed_size_bytes);
            const records = contents
                .toString('utf8')
                .trimEnd()
                .split('\n')
                .map(JSON.parse);
            assert.equal(records.length, tile.record_count);
            validateRoadCorridorWays(records);
            let signatures = '';
            for (const way of records) {
                signatures += `w${way.id}\t${hash(JSON.stringify(way))}\n`;
                for (let i = 0; i < way.node_ids.length; i++)
                    signatures += `n${way.node_ids[i]}\t${hash(JSON.stringify(way.coordinates[i]))}\n`;
                if (signatures.length > 1048576) {
                    writeSync(fd, signatures);
                    signatures = '';
                }
            }
            if (signatures) writeSync(fd, signatures);
            compressedBytes += compressed.length;
            largestTileBytes = Math.max(largestTileBytes, compressed.length);
        }
        closeSync(fd);
        fd = undefined;
        execFileSync(
            'sort',
            ['-S', '256M', '-T', scratch, '-o', sorted, input],
            { env: { ...process.env, LC_ALL: 'C' } },
        );
        let previousId,
            previousHash,
            ways = 0,
            nodes = 0;
        for (const line of identityLines(sorted)) {
            const [id, signature] = line.split('\t');
            if (id === previousId)
                assert.equal(
                    signature,
                    previousHash,
                    `Conflicting identity ${id}`,
                );
            else if (id.startsWith('w')) ways++;
            else nodes++;
            previousId = id;
            previousHash = signature;
        }
        assert.equal(ways, manifest.record_count);
        return {
            release: manifest.release_id,
            tiles: ids.size,
            ways,
            nodes,
            compressed_bytes: compressedBytes,
            largest_tile_bytes: largestTileBytes,
            peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
        };
    } finally {
        if (fd !== undefined) closeSync(fd);
        rmSync(scratch, { recursive: true, force: true });
    }
}
