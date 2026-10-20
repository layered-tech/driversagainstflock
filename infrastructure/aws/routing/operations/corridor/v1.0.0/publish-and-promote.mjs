import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRoadCorridorArtifact } from './validate-road-corridor.mjs';

export const POINTER_KEY = 'experimental/road-corridors/wisconsin/current.json';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const releasePattern = /^\d{8}T\d{6}Z-us-v\d+$/;

export function promotionPointer(previous, manifest, catalogHash) {
    if (previous) {
        assert.equal(previous.schema_version, 1);
        assert.match(previous.active_release, releasePattern);
        assert.match(previous.catalog_sha256, /^[a-f0-9]{64}$/);
        if (previous.source_name)
            assert.ok(
                previous.source_name <= manifest.source.name,
                'Refusing an older source snapshot',
            );
        assert.ok(
            previous.active_release <= manifest.release_id,
            'Refusing to promote an older release',
        );
        if (previous.active_release === manifest.release_id) {
            assert.equal(
                previous.catalog_sha256,
                catalogHash,
                'Immutable release changed',
            );
            return previous;
        }
    }
    return {
        schema_version: 1,
        active_release: manifest.release_id,
        catalog_sha256: catalogHash,
        previous_release: previous?.active_release ?? '20261019T043000Z-us-v1',
        previous_catalog_sha256: previous?.catalog_sha256 ?? null,
        source_md5: manifest.source.md5,
        source_name: manifest.source.name,
    };
}

// Object-store operations are injected so failure ordering and CAS can be tested without AWS.
export function publishAndPromote({
    directory,
    readbackDirectory,
    release,
    sourceMd5,
    store,
}) {
    assert.match(release, releasePattern);
    assert.match(sourceMd5, /^[a-f0-9]{32}$/);
    const expected = { release_id: release, source_md5: sourceMd5 };
    const report = validateRoadCorridorArtifact(directory, expected);
    const manifestBytes = readFileSync(path.join(directory, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes);
    assert.notEqual(
        manifest.validation_only,
        true,
        'Regional validation artifacts cannot auto-promote',
    );
    assert.equal(manifest.invalid_source_geometry_count, 0);
    assert.match(manifest.source.name, /^us-\d{6}\.osm\.pbf$/);
    assert.equal(manifest.graphhopper.version, '11.0');
    assert.equal(manifest.exporter?.version, '1.4.0');
    assert.equal(manifest.exporter?.semantics, 'retained-source-osm-ways');
    assert.match(manifest.exporter?.sha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(manifest.coverage.tile_degrees, 0.1);
    assert.equal(
        manifest.graphhopper.sha256,
        'b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def',
    );
    assert.equal(
        manifest.coverage.method,
        'state-bounding-box-plus-at-least-10km',
    );
    assert.deepEqual(manifest.coverage.bounds, [-93.04, 42.39, -86.09, 47.42]);
    const [west, south, east, north] = manifest.coverage.bounds;
    const catalog = {
        schema_version: 1,
        release,
        coverage: [
            [
                [
                    [west, south],
                    [east, south],
                    [east, north],
                    [west, north],
                    [west, south],
                ],
            ],
        ],
        tiles: manifest.tiles,
    };
    const catalogBytes = Buffer.from(JSON.stringify(catalog));
    assert.ok(
        catalogBytes.length < 900000,
        'Catalog exceeds supported mobile size',
    );
    const prefix = `experimental/road-corridors/${release}/wisconsin/`;
    const catalogPath = path.join(directory, 'mobile-catalog.json');
    writeFileSync(catalogPath, catalogBytes);
    mkdirSync(path.join(readbackDirectory, 'tiles'), { recursive: true });
    for (const tile of manifest.tiles) {
        store.putImmutable(prefix + tile.key, path.join(directory, tile.key));
        store.get(prefix + tile.key, path.join(readbackDirectory, tile.key));
    }
    store.putImmutable(
        prefix + 'manifest.json',
        path.join(directory, 'manifest.json'),
    );
    store.get(
        prefix + 'manifest.json',
        path.join(readbackDirectory, 'manifest.json'),
    );
    assert.equal(
        hash(readFileSync(path.join(readbackDirectory, 'manifest.json'))),
        hash(manifestBytes),
    );
    validateRoadCorridorArtifact(readbackDirectory, expected);
    store.putImmutable(prefix + 'mobile-catalog.json', catalogPath);
    store.get(
        prefix + 'mobile-catalog.json',
        path.join(readbackDirectory, 'mobile-catalog.json'),
    );
    assert.equal(
        hash(readFileSync(path.join(readbackDirectory, 'mobile-catalog.json'))),
        hash(catalogBytes),
    );
    // Read the pointer and its ETag together. A concurrent promotion must not be overwritten.
    const current = store.getPointer(POINTER_KEY);
    const next = promotionPointer(current?.value, manifest, hash(catalogBytes));
    if (next !== current?.value)
        store.compareAndSwap(POINTER_KEY, next, current?.etag);
    return { release, tiles: report.tiles, ways: report.ways };
}

export function awsStore(bucket, workDirectory, execute = execFileSync) {
    const aws = (args) =>
        execute('aws', ['--region', 'us-east-1', ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    return {
        putImmutable(key, filename) {
            try {
                aws([
                    's3api',
                    'put-object',
                    '--bucket',
                    bucket,
                    '--key',
                    key,
                    '--body',
                    filename,
                    '--if-none-match',
                    '*',
                    '--content-type',
                    key.endsWith('.gz')
                        ? 'application/gzip'
                        : 'application/json',
                ]);
            } catch (error) {
                if (!String(error.stderr).includes('(PreconditionFailed)'))
                    throw error;
                // The mandatory subsequent readback checks existing immutable bytes too.
            }
        },
        get(key, filename) {
            aws([
                's3api',
                'get-object',
                '--bucket',
                bucket,
                '--key',
                key,
                filename,
            ]);
        },
        getPointer(key) {
            const file = path.join(workDirectory, 'current.json');
            try {
                const metadata = JSON.parse(
                    aws([
                        's3api',
                        'get-object',
                        '--bucket',
                        bucket,
                        '--key',
                        key,
                        file,
                    ]),
                );
                return {
                    value: JSON.parse(readFileSync(file)),
                    etag: metadata.ETag,
                };
            } catch (error) {
                if (String(error.stderr).includes('(NoSuchKey)')) return null;
                throw error;
            }
        },
        compareAndSwap(key, value, etag) {
            const file = path.join(workDirectory, 'next.json');
            writeFileSync(file, JSON.stringify(value));
            aws([
                's3api',
                'put-object',
                '--bucket',
                bucket,
                '--key',
                key,
                '--body',
                file,
                '--content-type',
                'application/json',
                ...(etag ? ['--if-match', etag] : ['--if-none-match', '*']),
            ]);
        },
    };
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const [directory, readbackDirectory, release, sourceMd5, bucket] =
        process.argv.slice(2);
    assert.ok(
        directory && readbackDirectory && bucket,
        'Usage: publish-and-promote.mjs OUTPUT READBACK RELEASE SOURCE_MD5 BUCKET',
    );
    mkdirSync(readbackDirectory, { recursive: true });
    console.log(
        JSON.stringify(
            publishAndPromote({
                directory,
                readbackDirectory,
                release,
                sourceMd5,
                store: awsStore(bucket, readbackDirectory),
            }),
        ),
    );
}
