import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getOCRAssertionFailure } from '../android-auto-e2e.mjs';

test(
    'host OCR recognizes Android Auto navigation and speed labels',
    { skip: process.platform !== 'darwin' },
    () => {
        const directory = mkdtempSync(join(tmpdir(), 'daf-ocr-test-'));
        try {
            const binary = join(directory, 'android-auto-ocr');
            execFileSync(
                'xcrun',
                [
                    'swiftc',
                    '-module-cache-path',
                    join(directory, 'swift-cache'),
                    '-O',
                    fileURLToPath(
                        new URL('../android-auto-ocr.swift', import.meta.url),
                    ),
                    '-o',
                    binary,
                ],
                { timeout: 30000 },
            );
            const text = execFileSync(
                binary,
                [
                    fileURLToPath(
                        new URL(
                            './fixtures/android-auto-pewaukee-puck.png',
                            import.meta.url,
                        ),
                    ),
                ],
                { encoding: 'utf8', timeout: 30000 },
            );
            assert.equal(
                getOCRAssertionFailure(text, {
                    contains: ['SPEED', 'LIMIT'],
                }),
                null,
            );
            for (const [fixture, expected] of [
                ['android-auto-pewaukee-puck.png', 'dashboard'],
                ['android-auto-dashboard-loading.png', 'dashboard'],
                ['android-auto-dashboard-night.png', 'dashboard'],
                ['android-auto-fullscreen.png', 'fullscreen'],
            ]) {
                const proof = JSON.parse(
                    execFileSync(
                        binary,
                        [
                            '--host-layout',
                            fileURLToPath(
                                new URL(
                                    `./fixtures/${fixture}`,
                                    import.meta.url,
                                ),
                            ),
                        ],
                        { encoding: 'utf8', timeout: 30000 },
                    ),
                );
                assert.equal(proof.layout, expected, fixture);
            }
            const visible = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--puck-pixels',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-pewaukee-puck.png',
                                import.meta.url,
                            ),
                        ),
                        '360',
                        '500',
                        '340',
                        '115',
                    ],
                    { encoding: 'utf8', timeout: 30000 },
                ),
            );
            assert.equal(
                visible.visible,
                true,
                'fresh DHU capture shows the puck',
            );
            const emptyRoad = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--puck-pixels',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-pewaukee-puck.png',
                                import.meta.url,
                            ),
                        ),
                        '360',
                        '450',
                        '60',
                        '115',
                    ],
                    { encoding: 'utf8', timeout: 30000 },
                ),
            );
            assert.equal(
                emptyRoad.visible,
                false,
                'a visible road without the puck cannot pass',
            );
            const missingPuck = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--puck-pixels',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-missing-puck.png',
                                import.meta.url,
                            ),
                        ),
                        '360',
                        '500',
                        '410',
                        '200',
                    ],
                    { encoding: 'utf8', timeout: 30000 },
                ),
            );
            assert.equal(
                missingPuck.visible,
                false,
                'the real missing-puck screenshot only has an accuracy circle',
            );
            const confirmation = fileURLToPath(
                new URL(
                    './fixtures/android-auto-confirmation.png',
                    import.meta.url,
                ),
            );
            for (const text of ['Dismiss', 'Not there']) {
                const target = JSON.parse(
                    execFileSync(
                        binary,
                        ['--text-bounds', confirmation, text],
                        { encoding: 'utf8', timeout: 30000 },
                    ),
                );
                assert.ok(target.text.includes(text));
                assert.ok(target.x > 100 && target.x < 440);
                assert.ok(target.y > 90 && target.y < 260);
            }
            assert.throws(
                () =>
                    execFileSync(
                        binary,
                        ['--text-bounds', confirmation, 'Thanks!'],
                        {
                            encoding: 'utf8',
                            timeout: 30000,
                            stdio: ['ignore', 'pipe', 'pipe'],
                        },
                    ),
                /Text was not found/,
            );
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    },
);
