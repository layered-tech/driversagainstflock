import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('../android-auto.sh', import.meta.url));

test('landscape DHU layouts place the driver controls on the right', () => {
    for (const name of ['android-auto-dhu.ini', 'android-auto-dhu-2.1.ini']) {
        const config = readFileSync(
            new URL(`../../config/${name}`, import.meta.url),
            'utf8',
        );
        const general = config
            .slice(config.indexOf('[general]'))
            .split(/\n\[/)[0];
        assert.match(general, /^driverposition = right$/m);
    }
    for (const name of [
        'android-auto-dhu-portrait.ini',
        'android-auto-dhu-portrait-2.1.ini',
    ]) {
        const config = readFileSync(
            new URL(`../../config/${name}`, import.meta.url),
            'utf8',
        );
        assert.doesNotMatch(config, /^driverposition\s*=/m);
    }
});

test('landscape configs use only the main display for both DHU versions', () => {
    const basic = readFileSync(
        new URL('../../config/android-auto-dhu.ini', import.meta.url),
        'utf8',
    );
    const maps = readFileSync(
        new URL('../../config/android-auto-dhu-2.1.ini', import.meta.url),
        'utf8',
    );
    for (const config of [basic, maps]) {
        assert.doesNotMatch(
            config,
            /\[display:|(?:instrumentcluster|navcluster|phonecluster)\s*=\s*true/,
        );
        assert.match(
            config,
            /\[general\]\ninputmode = touch\ntouch = true\nresolution = 1280x720/,
        );
    }
    for (const path of ['../../package.json', '../../../package.json']) {
        const { scripts } = JSON.parse(
            readFileSync(new URL(path, import.meta.url), 'utf8'),
        );
        assert.match(
            scripts['android:auto'],
            /android-auto\.sh 2\.0 landscape$/,
        );
        assert.match(
            scripts['android:auto:2.1'],
            /android-auto\.sh 2\.1 landscape$/,
        );
    }
});

test('launches each version with its config and rejects mismatches before ADB', () => {
    const root = mkdtempSync(join(tmpdir(), 'dhu-launcher-'));
    const log = join(root, 'calls');
    const executable = (path, source) => {
        writeFileSync(path, `#!/bin/bash\n${source}\n`);
        chmodSync(path, 0o755);
    };
    try {
        executable(join(root, 'adb'), 'echo "adb $*" >> "$DHU_TEST_LOG"');
        for (const version of ['2.0', '2.1']) {
            mkdirSync(join(root, version));
            executable(
                join(root, version, 'desktop-head-unit'),
                `if [[ "$1" == --version ]]; then echo "Version: ${version}-mac-arm64"; else echo "${version} $*" >> "$DHU_TEST_LOG"; fi`,
            );
        }
        const run = (version, ...extra) =>
            spawnSync('bash', [launcher, version, ...extra], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    ANDROID_AUTO_DHU_ROOT: root,
                    DHU_TEST_LOG: log,
                    PATH: `${root}:${process.env.PATH}`,
                },
            });
        assert.equal(run('2.0', 'portrait').status, 0);
        assert.equal(run('2.1', 'portrait').status, 0);
        assert.equal(run('2.0', 'landscape').status, 0);
        assert.equal(run('2.1', 'landscape').status, 0);
        const calls = readFileSync(log, 'utf8');
        assert.match(calls, /2\.0 -c .*android-auto-dhu\.ini/);
        assert.match(calls, /2\.1 -c .*android-auto-dhu-2\.1\.ini/);
        assert.match(calls, /adb forward tcp:5277 tcp:5277/);
        assert.match(calls, /2\.0 -c .*android-auto-dhu-portrait\.ini/);
        assert.match(calls, /2\.1 -c .*android-auto-dhu-portrait-2\.1\.ini/);
        assert.equal(run('2.1', 'portrait', '--check').status, 0);
        assert.equal(readFileSync(log, 'utf8'), calls);
        executable(
            join(root, '2.1', 'desktop-head-unit'),
            'echo "Version: 2.0-mac-arm64"',
        );
        const mismatch = run('2.1', 'portrait');
        assert.equal(mismatch.status, 1);
        assert.match(mismatch.stderr, /Expected DHU 2.1/);
        assert.equal(readFileSync(log, 'utf8'), calls);
        rmSync(join(root, '2.1', 'desktop-head-unit'));
        assert.match(run('2.1', 'portrait').stderr, /DHU 2.1 not found/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
