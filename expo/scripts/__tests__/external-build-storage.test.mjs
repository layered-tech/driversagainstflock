import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
    test('reject internal build roots', () => {
        for (const script of [
            'eas-local-build.sh',
            'expo-export-external.sh',
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
        const exportResult = runScript('expo-export-external.sh', [
            '--output-dir',
            '/Volumes/PfeiferDev/other-export',
        ]);
        const xcodeResult = runScript('xcodebuild-external.sh', [
            '-derivedDataPath',
            '/Volumes/PfeiferDev/other-derived-data',
        ]);

        assert.equal(exportResult.status, 1);
        assert.match(exportResult.stderr, /controls --output-dir/);
        assert.equal(xcodeResult.status, 1);
        assert.match(xcodeResult.stderr, /controls -derivedDataPath/);
    });
});
