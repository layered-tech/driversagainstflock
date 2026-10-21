import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRoadCorridorArtifact } from './validate-road-corridor.mjs';
import {
    assertNationalCoverage,
    createRegionalCatalogs,
    hash,
} from './regional-catalogs.mjs';
import { awsStore } from './object-store.mjs';

export const POINTER_KEY = 'experimental/road-corridors/us/current.json';
const releasePattern = /^\d{8}T\d{6}Z-us-v\d+$/;

export function promotionPointer(previous, manifest, checksum) {
    if (previous) {
        assert.equal(previous.schema_version, 2);
        assert.match(previous.active_release, releasePattern);
        assert.match(previous.catalog_sha256, /^[a-f0-9]{64}$/);
        assert.ok(
            previous.active_release <= manifest.release_id,
            'Refusing older release',
        );
        assert.ok(
            previous.source_name <= manifest.source.name,
            'Refusing older source',
        );
        if (previous.active_release === manifest.release_id) {
            assert.equal(
                previous.catalog_sha256,
                checksum,
                'Immutable release changed',
            );
            return previous;
        }
    }
    return {
        schema_version: 2,
        active_release: manifest.release_id,
        catalog_sha256: checksum,
        previous_release: previous?.active_release ?? null,
        previous_catalog_sha256: previous?.catalog_sha256 ?? null,
        source_name: manifest.source.name,
        source_md5: manifest.source.md5,
    };
}

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
        'Validation artifacts cannot promote',
    );
    assert.match(manifest.source.name, /^us-\d{6}\.osm\.pbf$/);
    assert.equal(manifest.graphhopper.version, '11.0');
    assert.equal(
        manifest.graphhopper.sha256,
        'b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def',
    );
    assert.equal(manifest.exporter.version, '1.5.0');
    assert.equal(manifest.exporter.semantics, 'retained-source-osm-ways');
    assert.match(manifest.exporter.sha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.coverage.method, 'source-extract');
    assert.equal(manifest.coverage.tile_degrees, 0.1);
    assertNationalCoverage(manifest);
    const { index, bytes, catalogs } = createRegionalCatalogs(manifest);
    const prefix = `experimental/road-corridors/${release}/us/`;
    mkdirSync(path.join(directory, 'regions'), { recursive: true });
    mkdirSync(path.join(readbackDirectory, 'tiles'), { recursive: true });
    mkdirSync(path.join(readbackDirectory, 'regions'), { recursive: true });
    const publish = (key, contents) => {
        const file = path.join(directory, key),
            readback = path.join(readbackDirectory, key);
        if (contents) writeFileSync(file, contents);
        store.putImmutable(prefix + key, file);
        store.get(prefix + key, readback);
        assert.equal(
            hash(readFileSync(readback)),
            hash(contents ?? readFileSync(file)),
            `Readback mismatch: ${key}`,
        );
    };
    for (const tile of manifest.tiles) publish(tile.key);
    publish('manifest.json', manifestBytes);
    validateRoadCorridorArtifact(readbackDirectory, expected);
    for (const [region, catalog] of catalogs)
        publish(`regions/${region}.json`, catalog.bytes);
    publish('index.json', bytes);
    const current = store.getPointer(POINTER_KEY);
    const next = promotionPointer(current?.value, manifest, hash(bytes));
    if (next !== current?.value)
        store.compareAndSwap(POINTER_KEY, next, current?.etag);
    return { ...report, regions: Object.keys(index.regions).length };
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
