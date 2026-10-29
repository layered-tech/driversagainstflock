import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getOCRAssertionFailure } from '../android-auto-e2e.mjs';
import {
    getAndroidAutoKeyboardDismissPoint,
    getAndroidAutoKeyboardPoints,
} from '../android-auto-navigation-suite.mjs';
import {
    makeRoutePixelProbe,
    routeOverviewFailure,
} from '../automotive-route-overview.mjs';

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
            for (const name of [
                'android-auto-route-overview',
                'carplay-route-overview',
            ]) {
                const fixture = JSON.parse(
                    readFileSync(
                        new URL(`./fixtures/${name}.json`, import.meta.url),
                    ),
                );
                assert.equal(
                    routeOverviewFailure(fixture.snapshot, fixture.baseline),
                    null,
                );
                const probe = makeRoutePixelProbe(
                    fixture.snapshot,
                    fixture.appBounds,
                );
                const probeFile = join(directory, 'route-probe.json');
                writeFileSync(probeFile, JSON.stringify(probe));
                const pixels = JSON.parse(
                    execFileSync(
                        binary,
                        [
                            '--route-pixels',
                            fileURLToPath(
                                new URL(
                                    `./fixtures/${name}.png`,
                                    import.meta.url,
                                ),
                            ),
                            probeFile,
                        ],
                        { encoding: 'utf8' },
                    ),
                );
                assert.ok(
                    pixels.matched / pixels.total > 0.55,
                    `${name} route must be visibly drawn`,
                );
                assert.ok(pixels.span > 60);
                const missing = JSON.parse(
                    execFileSync(
                        binary,
                        [
                            '--route-pixels',
                            fileURLToPath(
                                new URL(
                                    './fixtures/android-auto-pewaukee-puck.png',
                                    import.meta.url,
                                ),
                            ),
                            probeFile,
                        ],
                        { encoding: 'utf8' },
                    ),
                );
                assert.ok(
                    missing.matched / missing.total < 0.55,
                    'A puck-only map cannot satisfy the route line proof',
                );
                if (name.startsWith('android')) {
                    // Dashboard occludes the full Mapbox canvas; it does not resize it.
                    const wrong = makeRoutePixelProbe(fixture.snapshot, {
                        ...fixture.appBounds,
                        width: 770,
                    });
                    writeFileSync(probeFile, JSON.stringify(wrong));
                    const offset = JSON.parse(
                        execFileSync(
                            binary,
                            [
                                '--route-pixels',
                                fileURLToPath(
                                    new URL(
                                        `./fixtures/${name}.png`,
                                        import.meta.url,
                                    ),
                                ),
                                probeFile,
                            ],
                            { encoding: 'utf8' },
                        ),
                    );
                    assert.equal(offset.matched, 0);
                }
            }
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
            const carplay = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--observations',
                        fileURLToPath(
                            new URL(
                                './fixtures/carplay-upcoming.png',
                                import.meta.url,
                            ),
                        ),
                    ],
                    {
                        encoding: 'utf8',
                        timeout: 30000,
                        env: { ...process.env, DAF_E2E_OCR_CARPLAY: '1' },
                    },
                ),
            );
            const keyboard = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--observations',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-search-keyboard.png',
                                import.meta.url,
                            ),
                        ),
                    ],
                    {
                        encoding: 'utf8',
                        env: { ...process.env, DAF_E2E_OCR_KEYBOARD: '1' },
                    },
                ),
            );
            const points = getAndroidAutoKeyboardPoints(
                { height: 720, textBounds: keyboard },
                'walmart',
            );
            for (const [index, [x, y]] of [
                [185, 507],
                [149, 562],
                [708, 562],
                [605, 618],
                [149, 562],
                [325, 507],
                [395, 507],
            ].entries()) {
                assert.ok(
                    Math.abs(points[index].x - x) < 25,
                    `keyboard x for ${'walmart'[index]}`,
                );
                assert.ok(
                    Math.abs(points[index].y - y) < 25,
                    `keyboard y for ${'walmart'[index]}`,
                );
            }
            assert.ok(
                carplay.some(({ text }) => text.toLowerCase() === 'ok'),
                'CarPlay OK button must be recognized',
            );
            assert.ok(carplay.some(({ text }) => text.includes('ahead')));
            const fullscreenKeyboard = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--observations',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-search-keyboard-fullscreen.png',
                                import.meta.url,
                            ),
                        ),
                    ],
                    {
                        encoding: 'utf8',
                        env: { ...process.env, DAF_E2E_OCR_KEYBOARD: '1' },
                    },
                ),
            );
            const fullscreenPoints = getAndroidAutoKeyboardPoints(
                { height: 720, textBounds: fullscreenKeyboard },
                'walmart',
            );
            for (const [index, [x, y]] of [
                [395, 508],
                [359, 562],
                [919, 562],
                [815, 620],
                [359, 562],
                [535, 508],
                [605, 508],
            ].entries()) {
                assert.ok(
                    Math.abs(fullscreenPoints[index].x - x) < 25,
                    `fullscreen x for ${'walmart'[index]}`,
                );
                assert.ok(
                    Math.abs(fullscreenPoints[index].y - y) < 25,
                    `fullscreen y for ${'walmart'[index]}`,
                );
            }
            const destinations = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--observations',
                        fileURLToPath(
                            new URL(
                                './fixtures/carplay-destinations.png',
                                import.meta.url,
                            ),
                        ),
                    ],
                    {
                        encoding: 'utf8',
                        timeout: 30000,
                        env: { ...process.env, DAF_E2E_OCR_CARPLAY: '1' },
                    },
                ),
            );
            const portraitKeyboard = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--observations',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-search-keyboard-portrait.png',
                                import.meta.url,
                            ),
                        ),
                    ],
                    {
                        encoding: 'utf8',
                        env: { ...process.env, DAF_E2E_OCR_KEYBOARD: '1' },
                    },
                ),
            );
            const portraitPoints = getAndroidAutoKeyboardPoints(
                { height: 1080, textBounds: portraitKeyboard },
                'walmart',
            );
            for (const [textBounds, height, x, y] of [
                [keyboard, 720, 115, 674],
                [fullscreenKeyboard, 720, 325, 676],
                [portraitKeyboard, 1080, 622, 912],
            ]) {
                const hide = getAndroidAutoKeyboardDismissPoint({
                    textBounds,
                    height,
                });
                assert.ok(
                    Math.abs(hide.x - x) < 25,
                    'Hide-key x must match the recorded native keyboard',
                );
                assert.ok(
                    Math.abs(hide.y - y) < 25,
                    'Hide-key y must match the recorded native keyboard',
                );
            }
            const sparseKeyboard = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--observations',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-search-keyboard-sparse.png',
                                import.meta.url,
                            ),
                        ),
                    ],
                    {
                        encoding: 'utf8',
                        env: { ...process.env, DAF_E2E_OCR_KEYBOARD: '1' },
                    },
                ),
            );
            const sparseHide = getAndroidAutoKeyboardDismissPoint({
                textBounds: sparseKeyboard,
                height: 720,
            });
            assert.ok(Math.abs(sparseHide.x - 325) < 25);
            assert.ok(Math.abs(sparseHide.y - 674) < 25);
            for (const [index, [x, y]] of [
                [691, 757],
                [655, 808],
                [1192, 808],
                [1094, 860],
                [655, 808],
                [825, 757],
                [893, 757],
            ].entries()) {
                assert.ok(
                    Math.abs(portraitPoints[index].x - x) < 25,
                    `portrait x for ${'walmart'[index]}`,
                );
                assert.ok(
                    Math.abs(portraitPoints[index].y - y) < 25,
                    `portrait y for ${'walmart'[index]}`,
                );
            }
            for (const label of ['Home', 'Work', 'Recents', 'Favorites']) {
                assert.ok(
                    destinations.some(({ text }) => text === label),
                    `CarPlay saved-place label ${label} must be recognized`,
                );
            }
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
            for (const layout of ['dashboard', 'fullscreen']) {
                const fixture = fileURLToPath(
                    new URL(
                        `./fixtures/android-auto-portrait-${layout}.png`,
                        import.meta.url,
                    ),
                );
                const proof = JSON.parse(
                    execFileSync(
                        binary,
                        ['--host-layout', fixture, '466', '1024', '32', '36'],
                        { encoding: 'utf8', timeout: 30000 },
                    ),
                );
                assert.equal(proof.layout, layout);
                const puck = JSON.parse(
                    execFileSync(
                        binary,
                        [
                            '--puck-pixels',
                            fixture,
                            '650',
                            layout === 'dashboard' ? '500' : '650',
                            '700',
                            layout === 'dashboard' ? '300' : '350',
                        ],
                        { encoding: 'utf8', timeout: 30000 },
                    ),
                );
                assert.equal(puck.visible, true, `portrait ${layout} arrow`);
                const wrongCrop = JSON.parse(
                    execFileSync(binary, ['--host-layout', fixture], {
                        encoding: 'utf8',
                        timeout: 30000,
                    }),
                );
                assert.equal(wrongCrop.layout, 'unknown');
            }
            const portraitSuite = JSON.parse(
                readFileSync(
                    new URL(
                        '../../.android-auto/suite-portrait.json',
                        import.meta.url,
                    ),
                    'utf8',
                ),
            );
            const crop = portraitSuite.hostLayoutCrop;
            const thanksObservations = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--observations',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-portrait-thanks.png',
                                import.meta.url,
                            ),
                        ),
                    ],
                    { encoding: 'utf8', timeout: 30000 },
                ),
            );
            assert.equal(
                getOCRAssertionFailure(
                    thanksObservations.map(({ text }) => text).join('\n'),
                    {
                        contains: ['Thanks', 'Ok'],
                    },
                ),
                null,
            );
            const okButton = thanksObservations.find(
                ({ text }) => text.toLowerCase() === 'ok',
            );
            assert.ok(okButton.x > 410 && okButton.x < 790);
            assert.ok(okButton.y > 87 && okButton.y < 151);
            const insetDashboard = JSON.parse(
                execFileSync(
                    binary,
                    [
                        '--host-layout',
                        fileURLToPath(
                            new URL(
                                './fixtures/android-auto-portrait-dashboard-insets.png',
                                import.meta.url,
                            ),
                        ),
                        ...[crop.x, crop.y, crop.width, crop.height].map(
                            String,
                        ),
                    ],
                    { encoding: 'utf8', timeout: 30000 },
                ),
            );
            assert.equal(
                insetDashboard.layout,
                'dashboard',
                'current portrait host insets',
            );
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
                assert.ok(target.width > 0);
                assert.ok(target.height > 0);
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
