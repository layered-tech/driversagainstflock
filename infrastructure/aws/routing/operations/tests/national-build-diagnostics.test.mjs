import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { test } from 'node:test';

const helper = fileURLToPath(
    new URL('../national-build-diagnostics.sh', import.meta.url),
);

function run(t, exitCode, uploadFails = false, waitForUpload = false) {
    const directory = mkdtempSync(path.join(tmpdir(), 'national-diagnostics-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const bin = path.join(directory, 'bin');
    mkdirSync(bin);
    writeFileSync(
        path.join(bin, 'aws'),
        `#!/usr/bin/env python3
import os,shutil,sys
args=sys.argv[1:]
with open(os.environ['DIAGNOSTIC_TEST_EVENTS'],'a') as log: log.write('upload '+args[1]+'\\n')
if os.environ.get('DIAGNOSTIC_TEST_UPLOAD_FAILS')=='1': sys.exit(55)
destination=os.environ['DIAGNOSTIC_TEST_UPLOAD']
if args[1]=='sync':
 shutil.copytree(args[2],destination,dirs_exist_ok=True)
 if not os.path.exists(destination+'/first-build.log'): shutil.copyfile(args[2]+'/build.log',destination+'/first-build.log')
elif args[1]=='cp': shutil.copyfile(args[2],destination+'/published-build.log')
`,
        { mode: 0o755 },
    );
    for (const command of ['free', 'df', 'ps', 'journalctl']) {
        writeFileSync(
            path.join(bin, command),
            `#!/bin/bash\necho '${command} diagnostic evidence'\n`,
            { mode: 0o755 },
        );
    }
    const diagnostics = path.join(directory, 'diagnostics');
    const driver = path.join(directory, 'driver.sh');
    writeFileSync(
        driver,
        `#!/bin/bash
set -Eeuo pipefail
source "$1"
start_build_diagnostics "$2" /tmp s3://test-bucket/release 1
finish() {
    local code=$?
    trap - EXIT ERR
    set +e
    finish_build_diagnostics "$code" exporting-validating-publishing test-release
    echo shutdown >> "$DIAGNOSTIC_TEST_EVENTS"
    exit "$code"
}
trap finish EXIT
echo 'export stdout'
echo 'export stderr' >&2
if [[ "$4" == 1 ]]; then sleep 2; fi
echo 'final stage'
if [[ "$3" == 0 ]]; then
    java -version
else
    bash -c 'echo "Exception: simulated exporter failure" >&2; exit "$1"' bash "$3"
fi
`,
    );
    const result = spawnSync(
        'bash',
        [
            driver,
            helper,
            diagnostics,
            String(exitCode),
            waitForUpload ? '1' : '0',
        ],
        {
            env: {
                ...process.env,
                PATH: `${bin}:${process.env.PATH}`,
                DIAGNOSTIC_TEST_EVENTS: path.join(directory, 'events'),
                DIAGNOSTIC_TEST_UPLOAD: path.join(directory, 'uploaded'),
                DIAGNOSTIC_TEST_UPLOAD_FAILS: uploadFails ? '1' : '0',
            },
            encoding: 'utf8',
            timeout: 15000,
        },
    );
    assert.ifError(result.error);
    return { directory, diagnostics, result };
}

test('failure saves stderr, failed command, exit code, and resource evidence before cleanup', (t) => {
    const { directory, result } = run(t, 23);
    assert.equal(result.status, 23, result.stdout + result.stderr);
    const uploaded = path.join(directory, 'uploaded');
    const log = readFileSync(
        path.join(uploaded, 'published-build.log'),
        'utf8',
    );
    assert.match(log, /export stdout/);
    assert.match(log, /export stderr/);
    assert.match(log, /Exception: simulated exporter failure/);
    const report = JSON.parse(
        readFileSync(path.join(uploaded, 'failure.json')),
    );
    assert.equal(report.exit_code, 23);
    assert.equal(report.phase, 'exporting-validating-publishing');
    assert.match(report.failed_command, /bash -c/);
    assert.ok(report.failed_line > 0);
    const resources = readFileSync(
        path.join(uploaded, 'resources.log'),
        'utf8',
    );
    assert.match(resources, /free diagnostic evidence/);
    assert.match(resources, /df diagnostic evidence/);
    assert.match(
        readFileSync(path.join(uploaded, 'kernel.log'), 'utf8'),
        /journalctl diagnostic evidence/,
    );
    assert.ok(
        readFileSync(path.join(directory, 'events'), 'utf8').endsWith(
            'upload cp\nshutdown\n',
        ),
    );
});

test('failed diagnostic uploads preserve the build exit code and still allow cleanup', (t) => {
    const { directory, diagnostics, result } = run(t, 23, true);
    assert.equal(result.status, 23, result.stdout + result.stderr);
    assert.ok(existsSync(path.join(diagnostics, 'failure.json')));
    assert.match(result.stderr, /diagnostic upload failed/i);
    assert.ok(
        readFileSync(path.join(directory, 'events'), 'utf8').endsWith(
            'shutdown\n',
        ),
    );
});

test('periodic uploads preserve progress before the build exits', (t) => {
    const { directory, result } = run(t, 23, false, true);
    assert.equal(result.status, 23, result.stdout + result.stderr);
    const firstLog = readFileSync(
        path.join(directory, 'uploaded', 'first-build.log'),
        'utf8',
    );
    assert.match(firstLog, /export stdout/);
    assert.doesNotMatch(firstLog, /final stage/);
});

test('success drains the log and uses valid JVM diagnostic flags without reporting failure', (t) => {
    const { directory, result } = run(t, 0);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const uploaded = path.join(directory, 'uploaded');
    assert.equal(existsSync(path.join(uploaded, 'failure.json')), false);
    assert.match(
        readFileSync(path.join(uploaded, 'published-build.log'), 'utf8'),
        /openjdk|java version/i,
    );
    assert.ok(existsSync(path.join(uploaded, 'java-gc.log')));
});
