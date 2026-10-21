import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
    assertNationalCoverage,
    createRegionalCatalogs,
    hash,
} from '../corridor/v1.1.0/regional-catalogs.mjs';
import { validateRoadCorridorArtifact } from '../corridor/v1.1.0/validate-road-corridor.mjs';
import {
    POINTER_KEY,
    publishAndPromote,
} from '../corridor/v1.1.0/publish-and-promote.mjs';
import {
    corridorCatalogIdentity,
    corridorRegion,
    createCorridorReleaseManager,
    validateCorridorCatalog,
} from '../../../../../expo/components/map/road-corridor-releases.js';
import {
    loadPilotCorridor,
    selectCorridorTiles,
} from '../../../../../expo/components/map/road-corridor-pilot-core.js';
import { createDirectedRoadGraph } from '../../../../../expo/components/map/road-graph.js';

const operation = fileURLToPath(
    new URL('../corridor/v1.1.0/', import.meta.url),
);
const jar = process.env.GRAPHHOPPER_TEST_JAR;
const graphSha =
    'b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def';
const release = '20261021T010000Z-us-v1';
const temporary = mkdtempSync(path.join(tmpdir(), 'daf-national-test-'));
const output = path.join(temporary, 'output');
const cities = [
    ['Seattle', -122.33, 47.6],
    ['Los Angeles', -118.24, 34.05],
    ['New York', -73.99, 40.71],
    ['Chicago', -87.63, 41.88],
    ['Dallas', -96.8, 32.78],
    ['Anchorage', -149.9, 61.22],
    ['Honolulu', -157.86, 21.31],
    ['West border', -88.005, 43.1],
    ['East border', -87.995, 43.1],
];
let manifest, catalogs, sourceMd5;
before(() => {
    assert.ok(jar, 'Set GRAPHHOPPER_TEST_JAR to the pinned 11.0 jar');
    assert.equal(hash(readFileSync(jar)), graphSha);
    execFileSync('javac', [
        '--release',
        '17',
        '-cp',
        jar,
        '-d',
        temporary,
        path.join(operation, 'RoadCorridorExporter.java'),
        fileURLToPath(new URL('./CorridorPbfFixture.java', import.meta.url)),
    ]);
    const exporter = path.join(temporary, 'exporter.jar');
    execFileSync('jar', [
        '--create',
        '--file',
        exporter,
        '-C',
        temporary,
        'RoadCorridorExporter.class',
    ]);
    const nodes = [],
        ways = [];
    for (const [, lon, lat] of cities) {
        const south = Math.floor(lat * 10) / 10 - 0.2,
            west = Math.floor(lon * 10) / 10 - 0.2;
        // A small real PBF road grid gives neighboring tiles complete geometry.
        for (let x = 0; x < 6; x++)
            for (let y = 0; y < 6; y++) {
                const id = nodes.length + 1;
                nodes.push({
                    type: 'node',
                    id,
                    lon: west + x * 0.1,
                    lat: south + y * 0.1,
                });
                if (x)
                    ways.push({
                        type: 'way',
                        id: ways.length + 1000,
                        nodes: [id - 6, id],
                        tags: { highway: 'residential', maxspeed: '35 mph' },
                    });
                if (y)
                    ways.push({
                        type: 'way',
                        id: ways.length + 1000,
                        nodes: [id - 1, id],
                        tags: { highway: 'residential', maxspeed: '35 mph' },
                    });
            }
    }
    for (const [, lon, lat] of cities) {
        const id = nodes.length + 1;
        nodes.push(
            { type: 'node', id, lon: lon - 0.2, lat },
            { type: 'node', id: id + 1, lon: lon + 0.2, lat },
        );
        ways.push({
            type: 'way',
            id: ways.length + 1000,
            nodes: [id, id + 1],
            tags: { highway: 'primary', maxspeed: '35 mph' },
        });
    }
    const input = path.join(temporary, 'fixture.json'),
        source = path.join(temporary, 'us-261020.osm.pbf');
    writeFileSync(input, JSON.stringify([...nodes, ...ways]));
    execFileSync('java', [
        '-cp',
        `${temporary}${path.delimiter}${jar}`,
        'CorridorPbfFixture',
        input,
        source,
    ]);
    sourceMd5 = createHash('md5').update(readFileSync(source)).digest('hex');
    execFileSync(
        'java',
        [
            '-cp',
            `${temporary}${path.delimiter}${jar}`,
            'RoadCorridorExporter',
            source,
            output,
            path.join(temporary, 'scratch'),
            release,
            sourceMd5,
            graphSha,
            hash(readFileSync(exporter)),
        ],
        { timeout: 60000 },
    );
    manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json')));
    catalogs = createRegionalCatalogs(manifest).catalogs;
});
after(() => rmSync(temporary, { recursive: true, force: true }));

for (const [name, longitude, latitude] of cities)
    test(`real exported tiles load a graph around ${name}`, async () => {
        const location = { longitude, latitude },
            region = corridorRegion(location);
        const catalog = validateCorridorCatalog(catalogs.get(region).catalog);
        assert.ok(JSON.stringify(catalog).length < 900000);
        const ways = await loadPilotCorridor({
            catalog,
            location,
            radiusMeters: 3200,
            normalize: (way) => way,
            loadTile: async (tile) =>
                gunzipSync(readFileSync(path.join(output, tile.key)))
                    .toString()
                    .trimEnd()
                    .split('\n')
                    .map(JSON.parse),
            service: () => {
                throw new Error('Unexpected service fallback');
            },
        });
        assert.equal(ways.corridorSource.source, 'download');
        assert.ok(createDirectedRoadGraph(ways).edges.length > 0);
    });

test('disk-backed national validation checks every tile and all identities', () => {
    const report = validateRoadCorridorArtifact(output, {
        release_id: release,
        source_md5: sourceMd5,
    });
    assert.equal(report.ways, manifest.record_count);
    assert.ok(report.tiles > 100);
    assertNationalCoverage(manifest);
    assert.throws(
        () =>
            assertNationalCoverage({
                tiles: manifest.tiles.filter(
                    (tile) => !tile.id.startsWith('-1579_'),
                ),
            }),
        /Honolulu/,
    );
});

test('overlap serves both sides before a regional transition and promotes within one release', async () => {
    const location = { longitude: -88.005, latitude: 43.1 },
        nextLocation = { ...location, longitude: -87.995 };
    const west = catalogs.get(corridorRegion(location)).catalog,
        east = catalogs.get(corridorRegion(nextLocation)).catalog;
    assert.notEqual(west.region, east.region);
    assert.deepEqual(
        selectCorridorTiles(west, nextLocation),
        selectCorridorTiles(east, nextLocation),
    );
    const prepared = [];
    let saved;
    const manager = createCorridorReleaseManager({
        bundled: west,
        read: async () => null,
        write: async (state) => {
            saved = structuredClone(state);
        },
        fetchControl: async (options) => ({
            enabled: true,
            catalog: catalogs.get(corridorRegion(options.location)).catalog,
        }),
        prepare: async (catalog) => prepared.push(catalog.region),
        now: () => 1000,
    });
    await manager.refresh({ location });
    await manager.refresh({ location: nextLocation });
    assert.deepEqual(prepared, [east.region]);
    assert.equal(manager.getState().active.region, east.region);
    assert.equal(saved.previous.region, west.region);
    assert.notEqual(
        corridorCatalogIdentity(saved.active),
        corridorCatalogIdentity(saved.previous),
    );
});

function storeFixture(failure) {
    const objects = new Map(),
        events = [];
    const readback = mkdtempSync(path.join(temporary, 'readback-'));
    let pointer;
    return {
        objects,
        events,
        readback,
        store: {
            putImmutable(key, file) {
                events.push(key);
                if (failure === 'upload') throw Error('upload');
                objects.set(key, readFileSync(file));
            },
            get(key, file) {
                writeFileSync(
                    file,
                    failure === 'readback' ? 'bad' : objects.get(key),
                );
            },
            getPointer() {
                return pointer;
            },
            compareAndSwap(key, value, etag) {
                assert.equal(key, POINTER_KEY);
                assert.equal(etag, undefined);
                if (failure === 'cas') throw Error('concurrent publication');
                pointer = { value };
                events.push('promoted');
            },
        },
    };
}

test('national publication verifies all readbacks before advancing its separate pointer', (t) => {
    const fixture = storeFixture();
    const result = publishAndPromote({
        directory: output,
        readbackDirectory: fixture.readback,
        release,
        sourceMd5,
        store: fixture.store,
    });
    assert.ok(result.regions > 7);
    assert.equal(fixture.events.at(-1), 'promoted');
    assert.ok(fixture.events.at(-2).endsWith('/us/index.json'));
    assert.ok(
        [...fixture.objects.keys()].every(
            (key) => !key.includes('/wisconsin/'),
        ),
    );
});
for (const failure of ['upload', 'readback', 'cas'])
    test(`national ${failure} failure never advances the pointer`, (t) => {
        const fixture = storeFixture(failure);
        assert.throws(() =>
            publishAndPromote({
                directory: output,
                readbackDirectory: fixture.readback,
                release,
                sourceMd5,
                store: fixture.store,
            }),
        );
        assert.ok(!fixture.events.includes('promoted'));
    });

test('national validation rejects conflicting geometry even with valid checksums', () => {
    const tile = manifest.tiles[0],
        file = path.join(output, tile.key),
        original = readFileSync(file);
    const manifestFile = path.join(output, 'manifest.json'),
        originalManifest = readFileSync(manifestFile);
    const records = gunzipSync(original)
        .toString()
        .trimEnd()
        .split('\n')
        .map(JSON.parse);
    records[0].coordinates[0][0] += 0.00001;
    const contents = Buffer.from(records.map(JSON.stringify).join('\n') + '\n'),
        bytes = gzipSync(contents);
    const changed = structuredClone(manifest),
        metadata = changed.tiles[0];
    metadata.sha256 = hash(bytes);
    metadata.key = `tiles/${tile.id}-${metadata.sha256}.jsonl.gz`;
    metadata.size_bytes = bytes.length;
    metadata.uncompressed_size_bytes = contents.length;
    try {
        writeFileSync(path.join(output, metadata.key), bytes);
        writeFileSync(manifestFile, JSON.stringify(changed));
        assert.throws(
            () => validateRoadCorridorArtifact(output),
            /Conflicting identity/,
        );
    } finally {
        writeFileSync(manifestFile, originalManifest);
    }
});

test('national operation assets and scheduled bootstrap are pinned end to end', () => {
    const assetsBytes = readFileSync(path.join(operation, 'assets.json'));
    const assets = JSON.parse(assetsBytes);
    for (const asset of assets) {
        assert.equal(
            asset.sha256,
            hash(readFileSync(path.join(operation, asset.name))),
        );
        assert.equal(asset.key, `operations/corridor/v1.1.0/${asset.name}`);
    }
    const workflow = readFileSync(
        path.join(operation, '../../scheduled-builder/v1.2.0/run-build.sh'),
    );
    assert.ok(
        workflow
            .toString()
            .includes(`NATIONAL_CORRIDOR_ASSETS_SHA256="${hash(assetsBytes)}"`),
    );
    const bootstrap = readFileSync(
        path.join(operation, '../../scheduled-builder-national-user-data.sh'),
        'utf8',
    );
    assert.ok(bootstrap.includes('BOOTSTRAP_VERSION="v1.2.0"'));
    assert.ok(bootstrap.includes(`BOOTSTRAP_SHA256="${hash(workflow)}"`));
    const compute = readFileSync(
        path.join(operation, '../../../compute.tf'),
        'utf8',
    );
    const variables = readFileSync(
        path.join(operation, '../../../schedule_variables.tf'),
        'utf8',
    );
    assert.match(compute, /var.national_corridor_builds_enabled/);
    assert.match(
        variables,
        /variable "national_corridor_builds_enabled"\s*\{[^}]*default\s*=\s*false/s,
    );
});

test('national stage download failure preserves routing deployment and the previous pointer', () => {
    const workflow = readFileSync(
        path.join(operation, '../../scheduled-builder/v1.2.0/run-build.sh'),
        'utf8',
    );
    const stage = workflow.slice(
        workflow.indexOf('run_national_corridor_operation()'),
        workflow.indexOf('CURRENT_STAGE="deployment"'),
    );
    const script = `set -eu\nOPERATION_ROOT="$1"\nNATIONAL_CORRIDOR_ASSETS_KEY=assets\nNATIONAL_CORRIDOR_ASSETS_SHA256=hash\nRELEASE_ID=release\nPBF_NAME=source\nPBF_MD5=hash\nFAILURE_NOTIFIED=false\ndownload_operation() { return 1; }\nwrite_cloudwatch_event() { echo "$1 $2"; }\nnotify_failure() { echo "$1 $2"; }\n${stage}\necho ROUTING_CONTINUES\n`;
    const log = execFileSync('bash', ['-c', script, '_', temporary], {
        encoding: 'utf8',
    });
    assert.match(log, /national_corridor_failed previous-release-retained/);
    assert.match(log, /ROUTING_CONTINUES/);
    assert.doesNotMatch(log, /national_corridor_published/);
});

test(
    'the national exporter validates a real regional source without promoting it',
    { skip: !process.env.NATIONAL_CORRIDOR_SOURCE },
    () => {
        const source = process.env.NATIONAL_CORRIDOR_SOURCE;
        const realOutput = path.join(temporary, 'real-output');
        const md5 = execFileSync('md5', ['-q', source], {
            encoding: 'utf8',
        }).trim();
        execFileSync(
            'java',
            [
                '-Xmx4g',
                '-cp',
                `${temporary}${path.delimiter}${jar}`,
                'RoadCorridorExporter',
                source,
                realOutput,
                path.join(temporary, 'real-scratch'),
                release,
                md5,
                graphSha,
                hash(readFileSync(path.join(temporary, 'exporter.jar'))),
            ],
            { timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        const realManifest = JSON.parse(
            readFileSync(path.join(realOutput, 'manifest.json')),
        );
        const report = validateRoadCorridorArtifact(realOutput, {
            release_id: release,
            source_md5: md5,
        });
        const regional = createRegionalCatalogs(realManifest);
        for (const { catalog } of regional.catalogs.values())
            validateCorridorCatalog(catalog);
        assert.ok(report.ways > 10000);
        assert.throws(
            () => assertNationalCoverage(realManifest),
            /Missing national coverage/,
        );
        console.log(
            'REAL_REGIONAL_VALIDATION ' +
                JSON.stringify({ ...report, regions: regional.catalogs.size }),
        );
    },
);

test('a national tile inventory exceeding the old limit stays bounded in regional discovery', () => {
    const tiles = [];
    for (let x = -1250; x < -670; x += 2) {
        for (let y = 250; y < 490; y += 2) {
            const id = `${x}_${y}`,
                sha256 = 'a'.repeat(64);
            tiles.push({
                id,
                sha256,
                key: `tiles/${id}-${sha256}.jsonl.gz`,
                size_bytes: 1000,
                uncompressed_size_bytes: 2000,
                record_count: 1,
            });
        }
    }
    assert.ok(JSON.stringify(tiles).length > 900000);
    const result = createRegionalCatalogs({ ...manifest, tiles });
    assert.ok(result.bytes.length < 900000);
    assert.ok(result.catalogs.size > 100);
    for (const { catalog, bytes } of result.catalogs.values()) {
        assert.ok(bytes.length < 900000);
        validateCorridorCatalog(catalog);
    }
});
