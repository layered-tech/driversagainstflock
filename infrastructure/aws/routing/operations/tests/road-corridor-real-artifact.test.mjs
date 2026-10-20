import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createReadStream,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { assertRoadCorridorGraphParity } from '../road-corridor-contract.mjs';
import { validateRoadCorridorArtifact } from '../validate-road-corridor.mjs';
import { createDirectedRoadGraph } from '../../../../../expo/components/map/road-graph.js';
import { createRoadMatcher } from '../../../../../expo/components/map/road-matching.js';

const directory = process.env.ROAD_CORRIDOR_ARTIFACT;
const source = process.env.ROAD_CORRIDOR_SOURCE;
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const require = createRequire(path.join(root, 'expo/package.json'));

async function graphFromResponse(ways) {
    const code = require('@babel/core').transformSync(
        readFileSync(path.join(root, 'expo/components/map/api.js'), 'utf8'),
        {
            babelrc: false,
            configFile: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        },
    ).code;
    const module = { exports: {} };
    const dependencies = {
        '../../lib/crashlytics': { addCrashlyticsLog() {} },
        './api-mocks': { mapApiMocksAreEnabled: () => false },
        './config': { buildApiURL: () => 'https://corridor.test' },
        './geo': {
            getStoredNumber: (value) => (value == null ? null : Number(value)),
            normalizeLongitude: (value) => value,
        },
    };
    new Function('require', 'module', 'exports', 'fetch', code)(
        (name) => dependencies[name] ?? {},
        module,
        module.exports,
        async () => ({
            ok: true,
            json: async () => ({ ok: true, result: { ways } }),
        }),
    );
    return createDirectedRoadGraph(
        await module.exports.getRoadCorridor({
            location: { latitude: 43.07, longitude: -89.4 },
        }),
    );
}

test(
    'real source snapshot preserves PHP normalization, mobile graph and matching',
    { skip: !directory || !source },
    async () => {
        const report = validateRoadCorridorArtifact(directory);
        const manifest = JSON.parse(
            readFileSync(path.join(directory, 'manifest.json')),
        );
        const md5 = createHash('md5');
        const sha256 = createHash('sha256');
        for await (const chunk of createReadStream(source)) {
            md5.update(chunk);
            sha256.update(chunk);
        }
        assert.equal(md5.digest('hex'), manifest.source.md5);
        if (manifest.source.sha256)
            assert.equal(sha256.digest('hex'), manifest.source.sha256);
        const selected = new Map();
        const categories = new Map();
        for (const tile of manifest.tiles) {
            const ways = gunzipSync(
                readFileSync(path.join(directory, tile.key)),
            )
                .toString()
                .trimEnd()
                .split('\n')
                .map(JSON.parse);
            selected.set(ways[0].id, ways[0]);
            for (const way of ways) {
                const category = `${way.road_class}:${way.direction}:${way.is_roundabout}:${way.tunnel}:${way.layer}:${way.speed_limit_mph === null}`;
                if (
                    (categories.get(category) ?? 0) >= 3 ||
                    selected.has(way.id)
                )
                    continue;
                categories.set(category, (categories.get(category) ?? 0) + 1);
                selected.set(way.id, way);
            }
        }
        const temporary = mkdtempSync(path.join(tmpdir(), 'corridor-real-'));
        try {
            const ids = path.join(temporary, 'ids');
            const xml = path.join(temporary, 'sample.osm');
            writeFileSync(
                ids,
                [...selected.values()]
                    .map((way) => `w${way.osm_way_id}`)
                    .join('\n'),
            );
            execFileSync(
                'osmium',
                ['getid', '-r', '-i', ids, source, '-o', xml],
                { timeout: 120000 },
            );
            const elements = execFileSync(
                'python3',
                [
                    '-c',
                    `import sys,json,xml.etree.ElementTree as ET
items=[]
for e in ET.parse(sys.argv[1]).getroot():
 if e.tag not in ('node','way'): continue
 o={'type':e.tag,'id':int(e.attrib['id'])}
 if e.tag=='node': o.update(lat=float(e.attrib['lat']),lon=float(e.attrib['lon']))
 else: o.update(nodes=[int(n.attrib['ref']) for n in e.findall('nd')],tags={t.attrib['k']:t.attrib['v'] for t in e.findall('tag')})
 items.append(o)
print(json.dumps(items))`,
                    xml,
                ],
                { maxBuffer: 128 * 1024 * 1024 },
            );
            const php = String.raw`
require $argv[1].'/app/Services/SpeedLimits/MaxspeedParser.php';
require $argv[1].'/app/Services/Roads/OpenStreetMapRoadGraphLookup.php';
$lookup = new App\Services\Roads\OpenStreetMapRoadGraphLookup(new App\Services\SpeedLimits\MaxspeedParser);
$elements=json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$nodes=(new ReflectionMethod($lookup, 'normalizeNodeCoordinates'))->invoke($lookup,$elements);
$method=new ReflectionMethod($lookup, 'normalizeWay'); $ways=[];
foreach($elements as $element) { $way=$method->invoke($lookup,$element,$nodes); if($way!==null) { $way['continuity_id']=$way['id']; $ways[]=$way; } }
echo json_encode($ways, JSON_THROW_ON_ERROR);`;
            const baseline = JSON.parse(
                execFileSync(
                    'php',
                    ['-d', 'memory_limit=1G', '-r', php, root],
                    { input: elements, maxBuffer: 128 * 1024 * 1024 },
                ),
            );
            const candidate = [...selected.values()].sort(
                (a, b) => a.osm_way_id - b.osm_way_id,
            );
            baseline.sort((a, b) => a.osm_way_id - b.osm_way_id);
            assert.equal(candidate.length, baseline.length);
            for (let i = 0; i < candidate.length; i++)
                assert.deepEqual(
                    candidate[i],
                    baseline[i],
                    `source parity ${candidate[i].id}`,
                );
            const referenceGraph = await graphFromResponse(baseline);
            const candidateGraph = await graphFromResponse(candidate);
            assertRoadCorridorGraphParity(referenceGraph, candidateGraph);
            let observations = 0;
            for (
                let i = 0;
                i < referenceGraph.edges.length;
                i += Math.max(1, Math.floor(referenceGraph.edges.length / 500))
            ) {
                const edge = referenceGraph.edges[i];
                const observation = {
                    longitude: (edge.start[0] + edge.end[0]) / 2,
                    latitude: (edge.start[1] + edge.end[1]) / 2,
                    bearing: edge.bearing,
                    accuracy: 2,
                    speed: 15,
                    timestamp: 1000,
                };
                assert.deepEqual(
                    createRoadMatcher(candidateGraph).update(observation),
                    createRoadMatcher(referenceGraph).update(observation),
                );
                observations++;
            }
            const result = {
                ...report,
                sampled_ways: candidate.length,
                sampled_categories: categories.size,
                sampled_directed_edges: candidateGraph.edges.length,
                matched_observations: observations,
            };
            console.log(JSON.stringify(result));
            if (process.env.ROAD_CORRIDOR_REPORT)
                writeFileSync(
                    process.env.ROAD_CORRIDOR_REPORT,
                    JSON.stringify(result, null, 2) + '\n',
                );
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
    },
);
