import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test(
    'watch widget sources satisfy the watchOS SDK protocols',
    {
        skip:
            process.platform !== 'darwin' &&
            'Requires the watchOS simulator SDK',
    },
    (t) => {
        const sdk = spawnSync(
            'xcrun',
            ['--sdk', 'watchsimulator', '--show-sdk-path'],
            {
                encoding: 'utf8',
                timeout: 15_000,
            },
        );
        if (sdk.status !== 0) {
            t.skip('Requires Xcode with the watchOS simulator SDK');
            return;
        }
        const directory = mkdtempSync(
            join(tmpdir(), 'watch-widgets-typecheck-'),
        );
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
        const result = spawnSync(
            'xcrun',
            [
                'swiftc',
                '-typecheck',
                '-parse-as-library',
                '-application-extension',
                '-swift-version',
                '5',
                '-target',
                `${architecture}-apple-watchos10.0-simulator`,
                '-sdk',
                sdk.stdout.trim(),
                '-module-cache-path',
                join(directory, 'module-cache'),
                ...[
                    'Shared/WatchSnapshot.swift',
                    'Shared/WatchDesign.swift',
                    'Widgets/WatchWidgets.swift',
                ].map((source) =>
                    fileURLToPath(
                        new URL(`../../../watch-os/${source}`, import.meta.url),
                    ),
                ),
            ],
            { encoding: 'utf8', timeout: 120_000 },
        );
        assert.equal(
            result.status,
            0,
            result.error?.message ?? `${result.stdout}\n${result.stderr}`,
        );
    },
);
