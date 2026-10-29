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
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    assertReportProof,
    buildCarPlaySuite,
    CarPlayRunner,
    findCarPlayAction,
    getCarPlayAppLaunchPoint,
    getCarPlayMetroArgs,
    getCarPlayTap,
    GPX_FILE,
    matchesCarPlayText,
    selectUSBDevice,
} from '../carplay-e2e.mjs';

const android = JSON.parse(
    readFileSync(new URL('../../.android-auto/suite.json', import.meta.url)),
);

test('native display screenshots map OCR taps inside the host toolbar and control margins', () => {
    const shot = {
        width: 1350,
        height: 1080,
        windowWidth: 927,
        windowHeight: 994,
        toolbarHeight: 52,
        displayInset: 10,
    };
    const tap = getCarPlayTap(shot, { x: 675, y: 540 });
    assert.equal(tap.x, 0.5);
    assert.ok(Math.abs(tap.y - (62 + (907 * 0.8) / 2) / 994) < 1e-9);
    assert.throws(() => getCarPlayTap(shot, { x: -1, y: 2 }), /outside/);
});

test('Metro uses one transport selector because Expo rejects offline plus LAN flags', () => {
    const args = getCarPlayMetroArgs(8092);
    assert.equal(
        args.filter((arg) =>
            [
                '--offline',
                '--lan',
                '--localhost',
                '--tunnel',
                '--host',
            ].includes(arg),
        ).length,
        1,
    );
    assert.equal(args[args.indexOf('--port') + 1], '8092');
    assert.ok(args.includes('--dev-client'));
});

test('the upcoming warning cannot pass by matching ALPR in diagnostic overlays', () => {
    const step = buildCarPlaySuite(android)[0].steps.find(
        (step) => step.type === 'assertOcr',
    );
    assert.equal(
        matchesCarPlayText(
            [
                { text: 'ALPR confirmation observing' },
                { text: 'Upcoming alerts No upcoming candidates on path' },
            ],
            step,
        ),
        false,
    );
    assert.equal(
        matchesCarPlayText(
            [
                { text: '1 mile ahead' },
                { text: 'ALPR - on your route' },
                { text: 'OK' },
            ],
            step,
        ),
        true,
    );
});

test('a focused native rerun can select the dismiss scenario without unrelated drives', () => {
    const runner = new CarPlayRunner({
        CARPLAY_E2E_SCENARIO: 'Dismiss restores',
    });
    assert.equal(runner.suite.length, 1);
    assert.match(runner.suite[0].name, /Dismiss/);
    assert.throws(
        () => new CarPlayRunner({ CARPLAY_E2E_SCENARIO: 'missing test' }),
        /No CarPlay scenario/,
    );
});

test('initial bundle launch can restart the process while drive reset links keep it alive', () => {
    const runner = new CarPlayRunner({});
    runner.udid = 'phone';
    const commands = [];
    runner.run = (binary, args) => commands.push([binary, ...args]);
    runner.launchURL('exp+driversagainstflock://expo-development-client/', {
        restart: true,
    });
    runner.launchURL('driversagainstflock://e2e-mocks?liveGpsDrive=reset');
    assert.ok(commands[0].includes('--terminate-existing'));
    assert.ok(!commands[1].includes('--terminate-existing'));
});

test('setup opens DAF from the CarPlay launcher instead of waiting on a background map root', () => {
    const shot = {
        height: 1080,
        observations: [
            { text: 'Phone' },
            { text: 'Messages' },
            { text: 'DevlDriv&sAg...', x: 274, y: 722 },
        ],
    };
    assert.deepEqual(getCarPlayAppLaunchPoint(shot), { x: 274, y: 635.6 });
    assert.equal(
        getCarPlayAppLaunchPoint({
            observations: [{ text: 'State Highway 164' }],
        }),
        null,
    );
});

test('visual assertions reuse a fresh checkpoint without an extra capture', async () => {
    const runner = new CarPlayRunner({});
    runner.screenshots.set('thanks', {
        capturedAt: Date.now(),
        observations: [{ text: 'Thanks!' }, { text: 'Ok' }],
    });
    runner.capture = () =>
        assert.fail('A matching fresh checkpoint needs no extra capture');
    await runner.assertText({
        screenshot: 'thanks',
        contains: ['Thanks', 'Ok'],
    });
});

test('Dismiss recognizes the native CarPlay combined button and the observed OCR divider', () => {
    for (const text of [
        'Dismiss',
        'Still there? / Dismiss',
        'Still there? l Dismiss',
    ]) {
        assert.equal(
            findCarPlayAction([{ text, x: 384, y: 913 }], 'Dismiss').x,
            384,
        );
    }
    assert.throws(
        () => findCarPlayAction([{ text: 'Not there' }], 'Dismiss'),
        /Expected one/,
    );
});
const report = (values = {}) =>
    '[E2E] presence-report-queued ' +
    JSON.stringify({
        count: 1,
        osmNodeId: 12634608635,
        response: 'not_there',
        platform: 'carplay',
        ...values,
    }) +
    '\n';

test('CarPlay reuses only the five Android ALPR scenarios with their actions and timing', () => {
    const suite = buildCarPlaySuite(android);
    assert.equal(suite.length, 5);
    assert.ok(GPX_FILE.endsWith('/.android-auto/route-pewaukee.gpx'));
    const steps = suite.flatMap((scenario) => scenario.steps);
    assert.deepEqual(
        steps.filter((step) => step.type === 'tapOcr').map((step) => step.text),
        ['Dismiss', 'Not there', 'Ok'],
    );
    assert.ok(
        steps.some(
            (step) => step.type === 'routeCheckpoint' && step.atMs === 108000,
        ),
    );
    assert.ok(
        steps.some((step) => step.type === 'assertConfirmationCameraStable'),
    );
    assert.equal(
        steps.filter((step) => step.type === 'resetLiveGpsDrive').length,
        0,
    );
    assert.ok(
        !steps.some((step) =>
            ['phoneSleep', 'disconnect', 'carLayout', 'deepLink'].includes(
                step.type,
            ),
        ),
    );
    assert.throws(() => buildCarPlaySuite({ tests: [] }), /Missing Android/);
});

test('requires a wired iPhone and never falls back to a network or ambiguous device', () => {
    const usb = {
        ConnectionType: 'USB',
        DeviceClass: 'iPhone',
        UniqueDeviceID: 'phone',
    };
    const wifi = { ...usb, ConnectionType: 'Network' };
    assert.equal(selectUSBDevice([usb, wifi]), 'phone');
    assert.throws(() => selectUSBDevice([wifi]), /USB/);
    assert.throws(
        () => selectUSBDevice([usb, { ...usb, UniqueDeviceID: 'other' }]),
        /select/,
    );
    assert.equal(
        selectUSBDevice([usb, { ...usb, UniqueDeviceID: 'other' }], 'other'),
        'other',
    );
});

test('CarPlay Ok requires native user dismissal rather than the Android button callback or timer expiry', () => {
    const steps = buildCarPlaySuite(android).at(-1).steps;
    const ok = steps.find(
        (step) => step.type === 'tapOcr' && step.text === 'Ok',
    );
    assert.equal(
        ok.waitForMetro,
        '[E2E] presence:native-thanks-dismissed:user',
    );
    const restored = steps.findLast((step) => step.type === 'assertOcr');
    assert.ok(restored.contains.includes('SPEED'));
    assert.ok(restored.notContains.includes('Thanks'));
    assert.deepEqual(steps.at(-1), {
        type: 'assertPresenceReports',
        count: 1,
        osmNodeId: 12634608635,
    });
});

test('report checks reject wrong canonical node, duplicate reports and Android platform payloads', () => {
    assertReportProof('', 0, 12634608635);
    assertReportProof(report(), 1, 12634608635);
    assertReportProof(report({ count: 4 }), 1, 12634608635, 3);
    for (const output of [
        report({ platform: 'android_auto' }),
        report({ osmNodeId: 1 }),
        report({ response: 'still_there' }),
        report() + report({ count: 2 }),
    ]) {
        assert.throws(
            () => assertReportProof(output, 1, 12634608635),
            /Unexpected/,
        );
    }
    assert.throws(
        () => assertReportProof(report(), 0, 12634608635),
        /Unexpected/,
    );
});

test('reset refuses development bundles before any confirmation action can run', async () => {
    for (const environment of ['development', 'production', 'e2e']) {
        const runner = new CarPlayRunner({});
        runner.launchURL = (url) => {
            assert.match(url, /liveGpsDrive=reset/);
            runner.metroOutput +=
                '[E2E] live-gps-drive-state ' +
                JSON.stringify({ environment, queuedReports: 2 }) +
                '\n[E2E] live-gps-drive-reset';
        };
        if (environment === 'e2e') assert.equal(await runner.resetDrive(), 2);
        else
            await assert.rejects(runner.resetDrive(), /isolated report outbox/);
    }
});

test('route checkpoints observe progress without sending any GPS command', async () => {
    const runner = new CarPlayRunner({});
    runner.gpsMessages = [{ progress: true, atMs: 78000 }];
    runner.gpsRequest = () =>
        assert.fail('Checkpoints must never move the phone');
    await runner.executeStep({ type: 'routeCheckpoint', atMs: 78000 });
    await assert.rejects(
        runner.executeStep({ type: 'replayRoute', fromMs: 45000, toMs: 78000 }),
        /Unsupported/,
    );
});

test('drive completion requires the final point and every fix in the complete file', async () => {
    for (const completion of [
        { atMs: 78000, fixes: 79 },
        { atMs: 147000, fixes: 147 },
        { atMs: 147000, fixes: 148 },
    ]) {
        const runner = new CarPlayRunner({});
        runner.gpsMessages = [
            { ready: true, durationMs: 147000, points: 148 },
            { completed: true, ...completion },
        ];
        let closed = false;
        runner.report = () => {};
        runner.closeGPS = async () => {
            closed = true;
        };
        if (completion.atMs === 147000 && completion.fixes === 148) {
            await runner.finishDrive();
            assert.equal(closed, true);
        } else {
            await assert.rejects(runner.finishDrive(), /entire file/);
            assert.equal(closed, false);
        }
    }
});

test('screenshots use devicectl for the CarPlay display without driving the Mac UI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'carplay-capture-test-'));
    try {
        const runner = new CarPlayRunner({});
        runner.udid = 'phone';
        const image = join(directory, 'capture.png');
        runner.run = (command, args) => {
            assert.equal(command, 'xcrun');
            assert.deepEqual(args, [
                'devicectl',
                'device',
                'capture',
                'screenshot',
                '--device',
                'phone',
                '--display-unique-id',
                'VideoStream.Main',
                '--destination',
                image,
            ]);
            const png = Buffer.alloc(24);
            Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
            png.writeUInt32BE(1720, 16);
            png.writeUInt32BE(1376, 20);
            writeFileSync(image, png);
        };
        assert.deepEqual(runner.takeDisplayScreenshot(image), {
            width: 1720,
            height: 1376,
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('ALPR scenarios wait for each complete drive, including focused runs', async () => {
    for (const filter of [undefined, 'Not there queues']) {
        const root = mkdtempSync(join(tmpdir(), 'carplay-whole-route-'));
        try {
            const runner = new CarPlayRunner({
                CARPLAY_E2E_ARTIFACTS_DIR: root,
                CARPLAY_E2E_SUITE: 'alpr',
                ...(filter ? { CARPLAY_E2E_SCENARIO: filter } : {}),
            });
            const events = [];
            runner.prepare = runner.cleanup = async () => {};
            runner.report = () => {};
            runner.resetDrive = async () => events.push('reset');
            runner.startDrive = async (name) => events.push(`start:${name}`);
            runner.finishDrive = async () => events.push('finish');
            runner.executeStep = async () => {};
            await runner.execute();
            assert.deepEqual(
                events,
                filter
                    ? ['reset', 'start:not-there', 'finish']
                    : [
                          'reset',
                          'start:pass-and-expiry',
                          'finish',
                          'reset',
                          'start:dismiss',
                          'finish',
                          'reset',
                          'start:not-there',
                          'finish',
                      ],
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
});

test('native actions use fresh OCR, exact labels and scaled coordinates, then require callback proof', async () => {
    const runner = new CarPlayRunner({});
    runner.report = () => {};
    runner.hostBinary = 'host';
    runner.capture = () => ({
        width: 2000,
        height: 1000,
        observations: [{ text: 'Not there', x: 1000, y: 750 }],
    });
    runner.run = (binary, args) => {
        assert.equal(binary, 'host');
        assert.deepEqual(args, ['tap', '0.5', '0.75']);
        runner.metroOutput +=
            '[E2E] presence:native-not-there-pressed\n[E2E] presence:native-thanks-presented';
        return 'native click';
    };
    await runner.tapText({
        screenshot: 'confirmation',
        text: 'Not there',
        waitForMetro: '[E2E] presence:native-not-there-pressed',
        waitForPresentation: '[E2E] presence:native-thanks-presented',
    });
    runner.capture = () => ({
        observations: [{ text: 'Not there' }, { text: 'Not there' }],
    });
    await assert.rejects(runner.tapText({ text: 'Not there' }), /Expected one/);
});

test('expiry requires a stable native camera proof and unknown steps fail closed', async () => {
    const runner = new CarPlayRunner({});
    runner.cameraOffset = 0;
    await assert.rejects(
        runner.executeStep({ type: 'assertConfirmationCameraStable' }),
        /Missing native/,
    );
    runner.metroOutput =
        '[E2E] presence-camera-released ' +
        JSON.stringify({
            samples: 24,
            offTargetSamples: 0,
            maximumCenterOffsetMeters: 1,
            maximumZoomDelta: 0.1,
        });
    await runner.executeStep({ type: 'assertConfirmationCameraStable' });
    await assert.rejects(
        runner.executeStep({ type: 'autoDrive' }),
        /Unsupported/,
    );
});

test('a failed scenario records failure and restores GPS instead of continuing to negative actions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'carplay-runner-test-'));
    try {
        const runner = new CarPlayRunner({ CARPLAY_E2E_ARTIFACTS_DIR: root });
        let cleaned = 0,
            steps = 0;
        runner.prepare = async () =>
            mkdirSync(runner.directory, { recursive: true });
        runner.report = () => {};
        runner.resetDrive = runner.startDrive = async () => {};
        runner.capture = () => {};
        runner.executeStep = async () => {
            steps += 1;
            throw new Error('No upcoming alert');
        };
        runner.cleanup = async () => {
            cleaned += 1;
        };
        await assert.rejects(runner.execute(), /No upcoming alert/);
        assert.equal(steps, 1);
        assert.equal(cleaned, 1);
        const results = JSON.parse(
            readFileSync(join(runner.directory, 'results.json')),
        );
        assert.equal(results.length, 1);
        assert.equal(results[0].passed, false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('cleanup clears GPS on the same session and is safe to call twice', async () => {
    const runner = new CarPlayRunner({});
    let closes = 0;
    runner.gps = {
        exitCode: null,
        stdin: {
            destroyed: false,
            end: (line) => {
                assert.deepEqual(JSON.parse(line), { command: 'close' });
                closes += 1;
                runner.gpsMessages.push({ closed: true });
            },
        },
    };
    await runner.cleanup();
    await runner.cleanup();
    assert.equal(closes, 1);
});

test('a failed assertion lets the started GPX finish before restoring GPS', async () => {
    const root = mkdtempSync(join(tmpdir(), 'carplay-failed-drive-'));
    try {
        const runner = new CarPlayRunner({ CARPLAY_E2E_ARTIFACTS_DIR: root });
        const events = [];
        runner.suite = [
            { name: 'failure', drive: 'complete-route', steps: [{}] },
        ];
        runner.prepare = runner.resetDrive = async () => {};
        runner.report = runner.capture = () => {};
        runner.startDrive = async () => {
            runner.gps = {};
            events.push('start');
        };
        runner.executeStep = async () => {
            events.push('assert');
            throw new Error('Missing action');
        };
        runner.finishDrive = async () => {
            events.push('finish');
            runner.gps = null;
        };
        runner.cleanup = async () => {
            events.push('cleanup');
        };
        await assert.rejects(runner.execute(), /Missing action/);
        assert.deepEqual(events, ['start', 'assert', 'finish', 'cleanup']);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('a disconnected GPS worker falls back to a fresh clear command and propagates cleanup failure', async () => {
    for (const clearFails of [false, true]) {
        const runner = new CarPlayRunner({});
        runner.udid = 'phone';
        runner.gps = { exitCode: 1, kill: () => {} };
        let cleared = false;
        runner.pmd = (args) => {
            assert.deepEqual(args, [
                'developer',
                'dvt',
                'simulate-location',
                'clear',
                '--userspace',
                '--udid',
                'phone',
            ]);
            cleared = true;
            if (clearFails) throw new Error('GPS could not be restored');
        };
        if (clearFails)
            await assert.rejects(runner.cleanup(), /could not be restored/);
        else await runner.cleanup();
        assert.equal(cleared, true);
    }
});

test('the GPX backend validates complete file playback, timing, skipped points and disconnect handling without a device', () => {
    const result = spawnSync(
        'python3',
        [
            '-B',
            fileURLToPath(new URL('./carplay-gpx.test.py', import.meta.url)),
        ],
        { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, result.error?.message || result.stderr);
});

test('CarPlay host input targets its window and process without desktop cursor or focus operations', () => {
    const source = readFileSync(
        new URL('../carplay-e2e-host.swift', import.meta.url),
        'utf8',
    );
    assert.match(source, /NSEvent\.mouseEvent/);
    assert.match(source, /windowNumber: Int\(windowNumber\)/);
    assert.match(source, /\.mouseEventWindowUnderMousePointer/);
    assert.match(source, /CGEventSetWindowLocation/);
    assert.match(source, /refusing desktop cursor fallback/);
    assert.match(source, /event\.postToPid\(app\.processIdentifier\)/);
    assert.doesNotMatch(
        source,
        /\.post\(tap:|\.activate\(|kAXRaiseAction|kAXMainAttribute|kAXFrontmostAttribute|\.mouseMoved|CGWarpMouseCursorPosition|CGAssociateMouseAndMouseCursorPosition/,
    );
});

test('CarPlay startup opens the app from its Dashboard card instead of treating the read-only map as the full app', () => {
    const shot = {
        width: 1720,
        height: 1376,
        observations: [
            { text: 'Search', x: 399, y: 1175 },
            { text: 'Home', x: 687, y: 1175 },
            { text: 'Not Playing', x: 1324, y: 1165 },
        ],
    };
    assert.deepEqual(getCarPlayAppLaunchPoint(shot), { x: 946, y: 344 });
});
