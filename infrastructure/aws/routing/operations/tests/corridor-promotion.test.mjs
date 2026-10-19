import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { baselineCorridorWays } from '../../../../../expo/components/map/__tests__/fixtures/road-corridor-compatibility.mjs';
import {
    awsStore,
    POINTER_KEY,
    promotionPointer,
    publishAndPromote,
} from '../corridor/v1.0.0/publish-and-promote.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
function fixture(t, options = {}) {
    const directory = mkdtempSync(path.join(tmpdir(), 'corridor-promotion-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    mkdirSync(path.join(directory, 'tiles'));
    const content = Buffer.from(
        JSON.stringify({
            ...baselineCorridorWays[0],
            continuity_id: 'osm-way-100',
        }) + '\n',
    );
    const bytes = gzipSync(content),
        sha = hash(bytes);
    const tile = {
        id: '-895_430',
        key: `tiles/-895_430-${sha}.jsonl.gz`,
        sha256: sha,
        size_bytes: bytes.length,
        uncompressed_size_bytes: content.length,
        record_count: 1,
        bounds: [-89.5, 43, -89.4, 43.1],
    };
    writeFileSync(path.join(directory, tile.key), bytes);
    const manifest = {
        schema_version: 1,
        region: 'wisconsin',
        release_id: '20261025T070000Z-us-v1',
        source: { name: 'us-261024.osm.pbf', md5: 'a'.repeat(32) },
        graphhopper: {
            version: '11.0',
            sha256: 'b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def',
        },
        exporter: {
            version: '1.4.0',
            semantics: 'retained-source-osm-ways',
            sha256: 'c'.repeat(64),
        },
        coverage: {
            tile_degrees: 0.1,
            method: 'state-bounding-box-plus-at-least-10km',
            bounds: [-93.04, 42.39, -86.09, 47.42],
        },
        format: 'gzip-jsonl-whole-ways',
        deduplication_key: 'id',
        tiles: [tile],
        record_count: 1,
        invalid_source_geometry_count: 0,
        ...options.manifest,
    };
    writeFileSync(
        path.join(directory, 'manifest.json'),
        JSON.stringify(manifest),
    );
    const objects = new Map(),
        events = [];
    let pointer = options.previous
        ? { value: options.previous, etag: 'old-etag' }
        : null;
    const store = {
        putImmutable(key, file) {
            events.push(`put:${key}`);
            if (options.uploadFailure) throw Error('upload');
            if (!objects.has(key)) objects.set(key, readFileSync(file));
        },
        get(key, file) {
            events.push(`get:${key}`);
            writeFileSync(
                file,
                options.corrupt && key.endsWith('.gz')
                    ? Buffer.from('bad')
                    : objects.get(key),
            );
        },
        getPointer(key) {
            assert.equal(key, POINTER_KEY);
            events.push('pointer-read');
            return pointer;
        },
        compareAndSwap(key, value, etag) {
            events.push('promote');
            assert.equal(key, POINTER_KEY);
            assert.equal(etag, pointer?.etag);
            if (options.concurrent) throw Error('PreconditionFailed');
            pointer = { value, etag: 'new-etag' };
        },
    };
    return {
        run: () =>
            publishAndPromote({
                directory,
                readbackDirectory: path.join(directory, 'readback'),
                release: manifest.release_id,
                sourceMd5: manifest.source.md5,
                store,
            }),
        manifest,
        pointer: () => pointer,
        events,
    };
}
test('publishes, reads back, validates, and only then promotes with a retained previous release', (t) => {
    const previous = {
        schema_version: 1,
        active_release: '20261020T070000Z-us-v1',
        catalog_sha256: 'b'.repeat(64),
    };
    const h = fixture(t, { previous });
    h.run();
    assert.equal(h.pointer().value.previous_release, previous.active_release);
    assert.equal(h.events.at(-1), 'promote');
    assert.ok(
        h.events.findIndex(
            (e) => e.includes('get:') && e.endsWith('mobile-catalog.json'),
        ) < h.events.indexOf('promote'),
    );
    assert.equal(h.pointer().value.source_md5, 'a'.repeat(32));
    const count = h.events.filter((e) => e === 'promote').length;
    h.run();
    assert.equal(
        h.events.filter((e) => e === 'promote').length,
        count,
        'retry is idempotent',
    );
});
test('bad exports, failed uploads, and corrupt readback never change the pointer', (t) => {
    for (const options of [
        { manifest: { invalid_source_geometry_count: 1 } },
        { manifest: { validation_only: true } },
        { uploadFailure: true },
        { corrupt: true },
    ]) {
        const h = fixture(t, options);
        assert.throws(h.run);
        assert.equal(h.pointer(), null);
        assert.ok(!h.events.includes('promote'));
    }
});
test('concurrent publication cannot replace another writer or regress to an older release', (t) => {
    const previous = {
        schema_version: 1,
        active_release: '20261024T070000Z-us-v1',
        catalog_sha256: 'b'.repeat(64),
    };
    const h = fixture(t, { previous, concurrent: true });
    assert.throws(h.run, /PreconditionFailed/);
    assert.equal(h.pointer().value, previous);
    assert.throws(
        () =>
            promotionPointer(
                { ...previous, active_release: '20261101T070000Z-us-v1' },
                h.manifest,
                'c'.repeat(64),
            ),
        /older release/,
    );
});
test('new build timestamps cannot promote older source snapshots', (t) => {
    const h = fixture(t);
    assert.throws(
        () =>
            promotionPointer(
                {
                    schema_version: 1,
                    active_release: '20261020T070000Z-us-v1',
                    catalog_sha256: 'b'.repeat(64),
                    source_name: 'us-261025.osm.pbf',
                },
                h.manifest,
                'c'.repeat(64),
            ),
        /older source snapshot/,
    );
});

test('AWS adapter requires CAS and never treats access errors as a missing pointer', (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'corridor-cas-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const store = awsStore('bucket', dir, (_, args) => {
        calls.push(args);
        return '{}';
    });
    store.compareAndSwap(POINTER_KEY, {}, 'etag');
    assert.deepEqual(calls[0].slice(-2), ['--if-match', 'etag']);
    store.compareAndSwap(POINTER_KEY, {}, undefined);
    assert.deepEqual(calls[1].slice(-2), ['--if-none-match', '*']);
    const denied = awsStore('bucket', dir, () => {
        throw Object.assign(Error('denied'), { stderr: '(AccessDenied)' });
    });
    assert.throws(() => denied.getPointer(POINTER_KEY), /denied/);
});
test('optional corridor stage preserves routing continuation even if its operation download fails', (t) => {
    const workflow = readFileSync(
        new URL('../scheduled-builder/v1.1.0/run-build.sh', import.meta.url),
        'utf8',
    );
    const stage = workflow.slice(
        workflow.indexOf('run_corridor_operation()'),
        workflow.indexOf('CURRENT_STAGE="deployment"\nserving_state='),
    );
    const dir = mkdtempSync(path.join(tmpdir(), 'corridor-workflow-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const script = `set -eu\nOPERATION_ROOT="$1"\nCORRIDOR_ASSETS_KEY=assets\nCORRIDOR_ASSETS_SHA256=hash\nRELEASE_ID=release\nPBF_NAME=source\nPBF_MD5=hash\nFAILURE_NOTIFIED=false\ndownload_operation() { return 1; }\nwrite_cloudwatch_event() { echo "$1 $2"; }\nnotify_failure() { echo "$1 $2"; }\n${stage}\necho ROUTING_CONTINUES\n`;
    const output = execFileSync('bash', ['-c', script, 'test', dir], {
        encoding: 'utf8',
    });
    assert.match(output, /corridor_failed previous-release-retained/);
    assert.match(output, /ROUTING_CONTINUES/);
    assert.doesNotMatch(output, /corridor_published/);
});

test('scheduled assets, workflow, and bootstrap are consistently checksum pinned', () => {
    const root = new URL('../', import.meta.url);
    const assetsBytes = readFileSync(
        new URL('corridor/v1.0.0/assets.json', root),
    );
    const assets = JSON.parse(assetsBytes);
    for (const asset of assets) {
        assert.equal(
            asset.sha256,
            hash(readFileSync(new URL(`corridor/v1.0.0/${asset.name}`, root))),
        );
        assert.equal(asset.key, `operations/corridor/v1.0.0/${asset.name}`);
    }
    const workflow = readFileSync(
        new URL('scheduled-builder/v1.1.0/run-build.sh', root),
    );
    assert.ok(
        workflow
            .toString()
            .includes(`CORRIDOR_ASSETS_SHA256="${hash(assetsBytes)}"`),
    );
    const bootstrap = readFileSync(
        new URL('scheduled-builder-user-data.sh', root),
        'utf8',
    );
    assert.ok(bootstrap.includes(`BOOTSTRAP_SHA256="${hash(workflow)}"`));
    assert.ok(bootstrap.includes('BOOTSTRAP_VERSION="v1.1.0"'));
    for (const [versioned, source] of [
        ['RoadCorridorExporter.java', 'build/v1.4.0/RoadCorridorExporter.java'],
        ['road-corridor-contract.mjs', 'road-corridor-contract.mjs'],
        ['validate-road-corridor.mjs', 'validate-road-corridor.mjs'],
    ])
        assert.deepEqual(
            readFileSync(new URL(`corridor/v1.0.0/${versioned}`, root)),
            readFileSync(new URL(source, root)),
        );
});
