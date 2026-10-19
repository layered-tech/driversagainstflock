import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const code = require('@babel/core').transformSync(
    readFileSync(new URL('../road-corridor-pilot.js', import.meta.url), 'utf8'),
    {
        babelrc: false,
        configFile: false,
        plugins: [require('@babel/plugin-transform-modules-commonjs')],
    },
).code;

function harness() {
    const files = new Map();
    let requests = 0,
        services = 0,
        offline = false;
    const bytes = gzipSync(
        JSON.stringify({
            id: 'road',
            coordinates: [
                [-89.45, 43.05],
                [-89.449, 43.05],
            ],
        }) + '\n',
    );
    const tile = {
        id: '-895_430',
        key: 'tiles/tile.gz',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size_bytes: bytes.length,
        uncompressed_size_bytes: require('node:zlib').gunzipSync(bytes).length,
        record_count: 1,
    };
    const catalog = {
        release: 'test',
        coverage: [
            [
                [
                    [-91, 42],
                    [-88, 42],
                    [-88, 45],
                    [-91, 45],
                    [-91, 42],
                ],
            ],
        ],
        tiles: [tile],
    };
    class Directory {
        constructor(...parts) {
            this.uri = parts.join('/');
        }
        create() {}
    }
    class File {
        constructor(directory, name) {
            this.uri = directory.uri + '/' + name;
        }
        get exists() {
            return files.has(this.uri);
        }
        async bytes() {
            return files.get(this.uri);
        }
        write(bytes) {
            files.set(this.uri, bytes);
        }
        delete() {
            files.delete(this.uri);
        }
        move(file) {
            files.set(file.uri, files.get(this.uri));
            files.delete(this.uri);
            this.uri = file.uri;
        }
    }
    const deps = {
        'expo-file-system': { Directory, File, Paths: { document: 'docs' } },
        'expo-crypto': {
            CryptoDigestAlgorithm: { SHA256: 'sha256' },
            digest: async (_, value) =>
                createHash('sha256').update(value).digest(),
        },
        fflate: require('fflate'),
        '../../assets/map/wisconsin-corridor.json': catalog,
        './api': {
            normalizeRoadCorridorWay: (value) => value,
            getRoadCorridor: async () => {
                services++;
                return [{ id: 'service' }];
            },
        },
        './config': { buildApiURL: () => 'sign' },
        './road-corridor-pilot-core': null,
    };
    return import('../road-corridor-pilot-core.js').then((core) => {
        deps['./road-corridor-pilot-core'] = core;
        const module = { exports: {} };
        new Function('require', 'module', 'exports', 'fetch', code)(
            (name) => deps[name],
            module,
            module.exports,
            async (url) => {
                requests++;
                if (offline) throw new Error('offline');
                return {
                    ok: true,
                    json: async () => ({ url: 'https://tiles.test/tile' }),
                    arrayBuffer: async () => bytes,
                };
            },
        );
        return {
            load: () =>
                module.exports.getPilotRoadCorridor({
                    location: { longitude: -89.45, latitude: 43.05 },
                    radiusMeters: 100,
                }),
            files,
            offline: () => {
                offline = true;
            },
            counts: () => ({ requests, services }),
        };
    });
}

test('verified gzip downloads survive offline reuse; corrupt cache cannot feed matcher', async () => {
    const h = await harness();
    const downloaded = await h.load();
    assert.equal(downloaded.corridorSource.source, 'download');
    assert.equal(h.files.size, 1);
    assert.ok([...h.files.keys()].every((key) => !key.endsWith('.partial')));
    h.offline();
    assert.equal((await h.load()).corridorSource.source, 'download');
    assert.deepEqual(h.counts(), { requests: 2, services: 1 });
    for (const key of h.files.keys())
        h.files.set(key, new Uint8Array(h.files.get(key).length));
    assert.equal((await h.load()).corridorSource.source, 'service');
    assert.equal(h.files.size, 0);
});
