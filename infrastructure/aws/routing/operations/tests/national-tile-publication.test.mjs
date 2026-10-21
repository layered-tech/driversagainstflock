import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hash } from '../corridor/v1.2.0/regional-catalogs.mjs';
import { awsStore } from '../corridor/v1.2.0/object-store.mjs';

test('national object store invokes the bundled verifier with the exact artifact paths', () => {
    let call;
    const store = awsStore('bucket', '/readback', (...args) => {
        call = args;
    });
    store.putTilesVerified('/output', '/readback', 'release/');
    assert.equal(call[0], 'python3');
    assert.ok(call[1][0].endsWith('/v1.2.0/publish-tiles.py'));
    assert.deepEqual(call[1].slice(1), [
        'bucket',
        '/output',
        '/readback',
        'release/',
    ]);
});

for (const mode of ['success', 'existing', 'corrupt', 'upload-failed']) {
    test(`parallel national tile publisher: ${mode}`, (t) => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'national-tile-publication-'),
        );
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        mkdirSync(path.join(directory, 'tiles'));
        const tiles = [];
        for (let i = 0; i < 20; i++) {
            const bytes = Buffer.from(`tile ${i}`),
                sha256 = hash(bytes),
                id = `${i}_0`,
                key = `tiles/${id}-${sha256}.jsonl.gz`;
            writeFileSync(path.join(directory, key), bytes);
            tiles.push({ id, key, sha256, size_bytes: bytes.length });
        }
        writeFileSync(
            path.join(directory, 'manifest.json'),
            JSON.stringify({ tiles }),
        );
        const bin = path.join(directory, 'bin');
        mkdirSync(bin);
        writeFileSync(
            path.join(bin, 'aws'),
            `#!/usr/bin/env python3
import os,sys,shutil
from pathlib import Path
args=sys.argv[1:]
key=args[args.index('--key')+1].removeprefix('release/')
if 'put-object' in args:
 if args[args.index('--if-none-match')+1]!='*': sys.exit(97)
 if os.environ['TEST_TILE_MODE']=='existing': print('(PreconditionFailed)',file=sys.stderr); sys.exit(254)
 if os.environ['TEST_TILE_MODE']=='upload-failed': print('AccessDenied',file=sys.stderr); sys.exit(254)
else:
 target=Path(args[-1])
 if os.environ['TEST_TILE_MODE']=='corrupt': target.write_text('corrupt')
 else: shutil.copyfile(Path(os.environ['TEST_TILE_ROOT'])/key,target)
`,
            { mode: 0o755 },
        );
        const readback = path.join(directory, 'readback');
        const result = spawnSync(
            'python3',
            [
                fileURLToPath(
                    new URL(
                        '../corridor/v1.2.0/publish-tiles.py',
                        import.meta.url,
                    ),
                ),
                'bucket',
                directory,
                readback,
                'release/',
            ],
            {
                env: {
                    ...process.env,
                    PATH: `${bin}:${process.env.PATH}`,
                    TEST_TILE_MODE: mode,
                    TEST_TILE_ROOT: directory,
                },
                encoding: 'utf8',
                timeout: 15000,
            },
        );
        assert.ifError(result.error);
        if (mode === 'success' || mode === 'existing') {
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.match(result.stdout, /verified=20 total=20/);
            for (const tile of tiles)
                assert.equal(
                    hash(readFileSync(path.join(readback, tile.key))),
                    tile.sha256,
                );
        } else {
            assert.notEqual(result.status, 0);
            assert.match(
                result.stderr,
                mode === 'corrupt'
                    ? /Readback checksum mismatch/
                    : /AccessDenied/,
            );
        }
    });
}
