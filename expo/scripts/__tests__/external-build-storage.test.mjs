import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const runScript = (script, args = [], environment = {}) =>
    spawnSync('bash', [resolve(scriptsDirectory, script), ...args], {
        encoding: 'utf8',
        env: {
            ...process.env,
            ...environment,
        },
    });

describe('external build storage wrappers', () => {
    test('limits local Gradle concurrency while preserving other JVM options', () => {
        const fixtureDirectory = mkdtempSync(
            resolve(tmpdir(), 'daf-eas-wrapper-'),
        );

        try {
            const binDirectory = resolve(fixtureDirectory, 'bin');
            mkdirSync(binDirectory);
            copyFileSync(
                resolve(scriptsDirectory, 'eas-local-build.sh'),
                resolve(fixtureDirectory, 'eas-local-build.sh'),
            );
            writeFileSync(
                resolve(fixtureDirectory, 'external-build-storage.sh'),
                'require_external_build_root() { :; }\nreject_internal_temp_arguments() { :; }\n',
            );
            writeFileSync(
                resolve(binDirectory, 'eas'),
                '#!/bin/sh\nprintf "%s\\n" "$GRADLE_OPTS"\nprintf "%s\\n" "$@"\n',
                { mode: 0o755 },
            );

            for (const gradleOptions of ['', '-Dfile.encoding=UTF-8']) {
                const result = spawnSync(
                    'bash',
                    [
                        resolve(fixtureDirectory, 'eas-local-build.sh'),
                        '-p',
                        'android',
                    ],
                    {
                        encoding: 'utf8',
                        env: {
                            ...process.env,
                            PATH: `${binDirectory}:${process.env.PATH}`,
                            DAF_EAS_LOCAL_BUILD_ROOT: fixtureDirectory,
                            GRADLE_OPTS: gradleOptions,
                        },
                    },
                );

                assert.equal(result.status, 0, result.stderr);
                const [options, ...args] = result.stdout.trim().split('\n');
                assert.equal(
                    options,
                    `${gradleOptions} -Dorg.gradle.workers.max=1`.trim(),
                );
                assert.deepEqual(args, ['build', '--local', '-p', 'android']);
            }
        } finally {
            rmSync(fixtureDirectory, { recursive: true, force: true });
        }
    });

    test('reject internal build roots', () => {
        for (const script of [
            'android-auto-e2e.sh',
            'eas-local-build.sh',
            'maestro-test.sh',
            'xcodebuild-external.sh',
        ]) {
            const result = runScript(script, [], {
                DAF_EAS_LOCAL_BUILD_ROOT: '/private/tmp/daf-build-test',
            });

            assert.equal(result.status, 1, script);
            assert.match(result.stderr, /mounted external volume/, script);
        }
    });

    test('reject external roots that traverse back to internal storage', () => {
        const result = runScript('xcodebuild-external.sh', [], {
            DAF_EAS_LOCAL_BUILD_ROOT:
                '/Volumes/PfeiferDev/../../private/tmp/daf-build-test',
        });

        assert.equal(result.status, 1);
        assert.match(result.stderr, /cannot contain relative path segments/);
    });

    test('reject internal temporary output arguments', () => {
        const easResult = runScript('eas-local-build.sh', [
            '--config',
            '/private/tmp/eas.json',
        ]);
        const xcodeResult = runScript('xcodebuild-external.sh', [
            '-archivePath',
            '/var/folders/internal/app.xcarchive',
        ]);

        assert.equal(easResult.status, 1);
        assert.match(
            easResult.stderr,
            /Internal temporary paths are forbidden/,
        );
        assert.equal(xcodeResult.status, 1);
        assert.match(
            xcodeResult.stderr,
            /Internal temporary paths are forbidden/,
        );
    });

    test('keeps wrapper-owned output paths from being overridden', () => {
        const xcodeResult = runScript('xcodebuild-external.sh', [
            '-derivedDataPath',
            '/Volumes/PfeiferDev/other-derived-data',
        ]);

        assert.equal(xcodeResult.status, 1);
        assert.match(xcodeResult.stderr, /controls -derivedDataPath/);
    });
});
