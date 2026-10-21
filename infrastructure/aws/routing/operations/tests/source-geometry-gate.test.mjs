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
import { test } from 'node:test';

const runner = readFileSync(
    new URL('../build-national-source.sh', import.meta.url),
    'utf8',
);
const stage = runner.slice(
    runner.indexOf('readonly OUTPUT='),
    runner.indexOf('status published'),
);
for (const mode of ['approve', 'deny', 'timeout', 'zero']) {
    test(`geometry review gate: ${mode}`, (t) => {
        const directory = mkdtempSync(path.join(tmpdir(), 'geometry-gate-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const output = path.join(directory, 'output/national-corridor-test');
        mkdirSync(output, { recursive: true });
        mkdirSync(path.join(directory, 'diagnostics'));
        writeFileSync(path.join(output, 'source-geometry.jsonl'), 'evidence\n');
        writeFileSync(
            path.join(output, 'manifest.json'),
            JSON.stringify({
                invalid_source_geometry_count: mode === 'zero' ? 0 : 1,
            }),
        );
        const script = `set -Eeuo pipefail
ROOT="$1"; MOUNT="$1"; RELEASE=test; PBF_MD5=test; BUCKET=test; MODE="$2"
status() { echo "STATUS:$1"; }
upload_build_diagnostics() { return 0; }
sleep() {
    if [[ "$MODE" == approve ]]; then echo reviewed > "$ROOT/geometry-review.json"; fi
    if [[ "$MODE" == deny ]]; then echo 'Exporter problem; review denied' > "$ROOT/geometry-review.denied"; fi
}
node() { echo "PUBLISH:$*"; }
${stage}`;
        const result = spawnSync('bash', ['-c', script, '_', directory, mode], {
            encoding: 'utf8',
            timeout: 5000,
        });
        assert.ifError(result.error);
        if (mode === 'approve' || mode === 'zero') {
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.match(
                result.stdout,
                /STATUS:validating-publishing\nPUBLISH:/,
            );
            if (mode === 'approve')
                assert.match(result.stdout, /STATUS:awaiting-geometry-review/);
            else assert.doesNotMatch(result.stdout, /awaiting-geometry-review/);
        } else {
            assert.notEqual(result.status, 0);
            assert.doesNotMatch(result.stdout, /PUBLISH:/);
            assert.match(
                result.stderr,
                mode === 'deny' ? /review denied/ : /timed out/,
            );
        }
    });
}
