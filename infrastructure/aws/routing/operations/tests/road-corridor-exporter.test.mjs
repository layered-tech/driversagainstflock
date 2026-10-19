import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { validateRoadCorridorWays } from '../road-corridor-contract.mjs';
import { validateRoadCorridorArtifact } from '../validate-road-corridor.mjs';

const root = fileURLToPath(new URL('../../../../..', import.meta.url));
const operation = fileURLToPath(new URL('../build/v1.4.0/', import.meta.url));
const jar = process.env.GRAPHHOPPER_TEST_JAR;
const graphSha =
    'b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def';
const release = '20261018T120000Z-us-v1';
const temporary = mkdtempSync(path.join(tmpdir(), 'daf-corridor-test-'));
const exporter = path.join(temporary, 'exporter.jar');
const hash = (bytes, algorithm = 'sha256') =>
    createHash(algorithm).update(bytes).digest('hex');
let exporterSha;
let result;

const nodes = [
    [1, -89.4, 43.07],
    [2, -89.399, 43.07],
    [3, -89.398, 43.07],
    [4, -89.399, 43.069],
    [5, -89.399, 43.07],
    [6, -89.399, 43.071],
    [7, -89.397, 43.071],
    [8, -89.398, 43.072],
    [9, -93.1, 43.07],
    [10, -86, 43.07], // endpoints outside the buffered area
    [11, -89.2, 43.07],
    [12, -89.1, 43.07], // exact tile borders
    [13, -120, 35],
    [14, -119.9, 35], // wholly outside coverage
].map(([id, lon, lat]) => ({ type: 'node', id, lon, lat }));

const ways = [
    [0, [1, 2], { highway: 'road' }],
    [
        100,
        [1, 2, 3],
        {
            highway: 'primary',
            name: 'Main',
            maxspeed: '35 mph',
            'maxspeed:backward': '25 mph',
        },
    ],
    [101, [4, 5, 6], { highway: 'primary', layer: '1', name: 'Overpass' }],
    [102, [3, 7], { highway: 'primary_link', oneway: 'yes', maxspeed: '50' }],
    [
        103,
        [7, 8, 3, 7],
        { highway: 'residential', junction: 'roundabout', maxspeed: 'signals' },
    ],
    [
        104,
        [8, 6],
        {
            highway: 'service',
            tunnel: 'culvert',
            layer: '-1',
            'oneway:motorcar': '-1',
            maxspeed: '60',
            'maxspeed:motorcar:backward': '20 mph',
        },
    ],
    [105, [1, 6], { highway: 'residential', access: 'private' }],
    [
        106,
        [1, 6],
        {
            highway: 'residential',
            access: 'private',
            motorcar: 'yes',
            maxspeed: '0',
            oneway: 'yes',
            'oneway:motorcar': 'no',
        },
    ],
    [107, [1, 6], { highway: 'residential', motorcar: 'no', vehicle: 'yes' }],
    [108, [1, 6], { highway: 'pedestrian' }],
    [109, [1, 6], { highway: 'service', area: 'yes' }],
    [110, [1, 6], { building: 'yes' }],
    [111, [9, 10], { highway: 'primary', maxspeed: '55 mph' }],
    [112, [11, 12], { highway: 'motorway', maxspeed: '70 mph' }],
    [113, [13, 14], { highway: 'residential' }],
    [114, [2, 2, 3], { highway: 'road', maxspeed: '30;50' }],
    [115, [2, 5, 6], { highway: 'road' }], // coincident different IDs: reject, do not weld
    [
        116,
        [1, 2],
        {
            highway: 'living_street',
            'maxspeed:motorcar': '',
            maxspeed: '35 mph',
        },
    ],
].map(([id, nds, tags]) => ({ type: 'way', id, nodes: nds, tags }));

function runExport(name, elements) {
    const source = path.join(temporary, `${name}.osm.pbf`);
    const output = path.join(temporary, name);
    const fixture = `${source}.json`;
    writeFileSync(fixture, JSON.stringify(elements));
    execFileSync('java', [
        '-cp',
        `${temporary}${path.delimiter}${jar}`,
        'CorridorPbfFixture',
        fixture,
        source,
    ]);
    const args = [
        source,
        output,
        `${output}-scratch`,
        release,
        hash(readFileSync(source), 'md5'),
        graphSha,
        exporterSha,
    ];
    const process = spawnSync(
        'java',
        [
            '-cp',
            `${exporter}${path.delimiter}${jar}`,
            'RoadCorridorExporter',
            ...args,
        ],
        { encoding: 'utf8', timeout: 30000 },
    );
    return { ...process, args, output, source };
}

before(() => {
    assert.ok(
        jar,
        'Set GRAPHHOPPER_TEST_JAR to the pinned GraphHopper 11.0 jar',
    );
    assert.equal(hash(readFileSync(jar)), graphSha);
    execFileSync('bash', [
        path.join(operation, 'compile-exporter.sh'),
        jar,
        exporter,
    ]);
    exporterSha = hash(readFileSync(exporter));
    execFileSync('javac', [
        '--release',
        '17',
        '-cp',
        jar,
        '-d',
        temporary,
        fileURLToPath(new URL('./CorridorPbfFixture.java', import.meta.url)),
    ]);
    result = runExport('first', [...nodes, ...ways]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
});
after(() => rmSync(temporary, { recursive: true, force: true }));

function readPackage(output) {
    const manifest = JSON.parse(
        readFileSync(path.join(output, 'manifest.json')),
    );
    const records = new Map();
    for (const tile of manifest.tiles) {
        const bytes = readFileSync(path.join(output, tile.key));
        assert.equal(hash(bytes), tile.sha256);
        assert.equal(bytes.length, tile.size_bytes);
        const decoded = gunzipSync(bytes);
        assert.equal(decoded.length, tile.uncompressed_size_bytes);
        const roads = decoded.toString().trim().split('\n').map(JSON.parse);
        assert.equal(roads.length, tile.record_count);
        for (const road of roads) {
            if (records.has(road.id))
                assert.deepEqual(road, records.get(road.id));
            records.set(road.id, road);
        }
    }
    assert.equal(records.size, manifest.record_count);
    validateRoadCorridorWays([...records.values()]);
    return { manifest, records };
}

test('actual GraphHopper reader output matches the current PHP corridor normalizer', () => {
    const { records, manifest } = readPackage(result.output);
    // Exercise production normalization directly; no handwritten expected parser.
    const php = String.raw`
        require $argv[1].'/app/Services/SpeedLimits/MaxspeedParser.php';
        require $argv[1].'/app/Services/Roads/OpenStreetMapRoadGraphLookup.php';
        $lookup = new App\Services\Roads\OpenStreetMapRoadGraphLookup(new App\Services\SpeedLimits\MaxspeedParser);
        $elements = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
        $nodes = (new ReflectionMethod($lookup, 'normalizeNodeCoordinates'))->invoke($lookup, $elements);
        $method = new ReflectionMethod($lookup, 'normalizeWay');
        $ways = [];
        foreach ($elements as $element) {
            $way = $method->invoke($lookup, $element, $nodes);
            if ($way !== null && $way['osm_way_id'] !== 113) {
                $way['continuity_id'] = $way['id'];
                $ways[] = $way;
            }
        }
        echo json_encode($ways, JSON_THROW_ON_ERROR);
    `;
    const reference = JSON.parse(
        execFileSync('php', ['-r', php, root], {
            input: JSON.stringify([...nodes, ...ways]),
            encoding: 'utf8',
        }),
    );
    assert.deepEqual(
        [...records.values()].sort((a, b) => a.osm_way_id - b.osm_way_id),
        reference,
    );
    assert.equal(manifest.source.md5, hash(readFileSync(result.source), 'md5'));
    assert.equal(manifest.exporter.semantics, 'retained-source-osm-ways');
    assert.equal(manifest.invalid_source_geometry_count, 1);
});

test('long crossing roads and border ways are complete and repeat identically across tiles', () => {
    const { manifest, records } = readPackage(result.output);
    assert.deepEqual(records.get('osm-way-111').node_ids, [9, 10]);
    assert.deepEqual(records.get('osm-way-111').coordinates, [
        [-93.1, 43.07],
        [-86, 43.07],
    ]);
    assert.ok(manifest.tiles.length > 60);
    assert.ok(!records.has('osm-way-113'));
    assert.notEqual(
        records.get('osm-way-100').node_ids[1],
        records.get('osm-way-101').node_ids[1],
    );
    for (const id of ['-893_430', '-892_430', '-891_430']) {
        const tile = manifest.tiles.find((tile) => tile.id === id);
        assert.ok(tile, id);
        assert.ok(
            gunzipSync(readFileSync(path.join(result.output, tile.key)))
                .toString()
                .includes('osm-way-112'),
            id,
        );
    }
});

test('identical source and build versions produce identical compressed tiles and manifest', () => {
    const repeated = runExport('second', [...nodes, ...ways]);
    assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
    const first = readPackage(result.output).manifest;
    const second = readPackage(repeated.output).manifest;
    // Source filename is provenance and is deliberately different for this test.
    second.source.name = first.source.name;
    assert.deepEqual(second, first);
});

test('empty coverage and reused output paths fail without publishing a new manifest', () => {
    const empty = runExport('empty', [
        ...nodes,
        ways.find((way) => way.id === 113),
    ]);
    assert.notEqual(empty.status, 0);
    assert.equal(existsSync(path.join(empty.output, 'manifest.json')), false);
    const repeated = spawnSync(
        'java',
        [
            '-cp',
            `${exporter}${path.delimiter}${jar}`,
            'RoadCorridorExporter',
            ...result.args,
        ],
        { encoding: 'utf8' },
    );
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /fresh paths/);
});

test('wrong source checksum is rejected before output creation', () => {
    const args = [...result.args];
    args[1] = path.join(temporary, 'bad-checksum');
    args[2] = path.join(temporary, 'bad-checksum-scratch');
    args[4] = '0'.repeat(32);
    const failed = spawnSync(
        'java',
        [
            '-cp',
            `${exporter}${path.delimiter}${jar}`,
            'RoadCorridorExporter',
            ...args,
        ],
        { encoding: 'utf8' },
    );
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Source checksum mismatch/);
    assert.equal(existsSync(args[1]), false);
});

test('publisher validates tiles first, publishes manifest last and never deploys', () => {
    const bin = path.join(temporary, 'bin');
    mkdirSync(bin);
    const log = path.join(temporary, 'aws.log');
    writeFileSync(
        path.join(bin, 'aws'),
        '#!/bin/bash\nprintf "%s\\n" "$*" >> "$AWS_TEST_LOG"\nif [[ "$*" == *list-objects-v2* ]]; then echo "${AWS_TEST_EXISTING:-0}"; fi\nif [[ "$*" == "s3 cp "* && "${AWS_TEST_FAIL_TILE:-0}" == 1 ]]; then exit 1; fi\n',
        { mode: 0o755 },
    );
    const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AWS_TEST_LOG: log,
    };
    execFileSync(
        'bash',
        [
            path.join(operation, 'publish-corridor.sh'),
            result.output,
            'test-bucket',
            release,
        ],
        { env },
    );
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    assert.match(
        calls.at(-1),
        /s3api put-object .*manifest.json .*--if-none-match \*/,
    );
    assert.ok(
        calls.every((call) =>
            /^(s3 cp|s3api (list-objects-v2|put-object)) /.test(call),
        ),
    );
    for (const failure of [
        { AWS_TEST_FAIL_TILE: '1' },
        { AWS_TEST_EXISTING: '1' },
    ]) {
        writeFileSync(log, '');
        const failed = spawnSync(
            'bash',
            [
                path.join(operation, 'publish-corridor.sh'),
                result.output,
                'test-bucket',
                release,
            ],
            { env: { ...env, ...failure }, encoding: 'utf8' },
        );
        assert.notEqual(failed.status, 0);
        assert.ok(!readFileSync(log, 'utf8').includes('s3api put-object'));
    }
    writeFileSync(log, '');
    const { manifest } = readPackage(result.output);
    writeFileSync(path.join(result.output, manifest.tiles[0].key), 'corrupt');
    const failed = spawnSync(
        'bash',
        [
            path.join(operation, 'publish-corridor.sh'),
            result.output,
            'test-bucket',
            release,
        ],
        { env, encoding: 'utf8' },
    );
    assert.notEqual(failed.status, 0);
    assert.equal(readFileSync(log, 'utf8'), '');
});

test('artifact audit validates every tile and rejects wrong provenance and counts', () => {
    const audit = runExport('audit', [...nodes, ...ways]);
    assert.equal(audit.status, 0, audit.stdout + audit.stderr);
    const report = validateRoadCorridorArtifact(audit.output, {
        release_id: release,
    });
    assert.ok(report.ways > 0);
    assert.ok(report.compressed_bytes > 0);
    assert.ok(report.roundabouts > 0);
    assert.throws(() =>
        validateRoadCorridorArtifact(audit.output, {
            source_md5: '0'.repeat(32),
        }),
    );
    const manifestPath = path.join(audit.output, 'manifest.json');
    const original = readFileSync(manifestPath);
    try {
        const changed = JSON.parse(original);
        changed.record_count++;
        writeFileSync(manifestPath, JSON.stringify(changed));
        assert.throws(() => validateRoadCorridorArtifact(audit.output));
    } finally {
        writeFileSync(manifestPath, original);
    }
});
