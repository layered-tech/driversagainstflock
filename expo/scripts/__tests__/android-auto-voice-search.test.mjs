import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    loadSuite,
    loadVoiceSearchMatrix,
    Runner,
} from '../android-auto-e2e.mjs';
import { selectAndroidAutoSuite } from '../android-auto-navigation-suite.mjs';

test('the continuous matrix schedules every voice journey in both layouts and orientations', () => {
    const env = { ANDROID_AUTO_E2E_SUITE: 'voice-search' };
    const matrix = loadVoiceSearchMatrix(env);
    for (const orientation of ['Portrait', 'Landscape']) {
        for (const layout of ['Dashboard', 'Fullscreen']) {
            assert.equal(
                matrix.tests.filter((test) =>
                    test.name.startsWith(`${orientation} ${layout}:`),
                ).length,
                6,
            );
        }
    }
    assert.equal(matrix.tests[12].name, 'Portrait disconnect');
    assert.equal(matrix.tests[13].steps[0].type, 'connectLandscape');
    assert.equal(matrix.tests.at(-1).name, 'Landscape disconnect');
    assert.throws(
        () =>
            loadVoiceSearchMatrix({
                ...env,
                ANDROID_AUTO_E2E_RESTART_DURING_SEARCH: '1',
            }),
        /restarts disabled/,
    );
});

test('switching head units preserves the process and uses the landscape touch coordinates', async () => {
    const runner = Object.create(Runner.prototype);
    runner.suite = loadVoiceSearchMatrix({
        ANDROID_AUTO_E2E_SUITE: 'voice-search',
    });
    const tests = runner.suite.tests;
    const events = [];
    runner.startDhu = async () => events.push('DHU');
    runner.focusCarMap = async () => events.push('map');
    runner.serviceRunning = () => true;
    runner.waitFor = async (predicate) => assert.equal(predicate(), true);
    runner.assertAutoPlayState = async () => events.push('state');
    runner.report = () => {};
    let pid = '123';
    runner.adb = (args) => {
        assert.deepEqual(args, ['shell', 'pidof', runner.suite.appId]);
        return { stdout: pid };
    };
    runner.verifyAppProcess('portrait');
    await runner.runStep({ type: 'connectLandscape' });
    runner.verifyAppProcess('landscape');
    assert.deepEqual(events, ['DHU', 'map', 'state']);
    assert.equal(runner.suite.touchOffset, undefined);
    assert.equal(runner.suite.tests, tests);
    pid = '234';
    assert.throws(
        () => runner.verifyAppProcess('replaced'),
        /expected 123, found 234/,
    );
    pid = '';
    assert.throws(() => runner.verifyAppProcess('closed'), /no process/);
});

test('focused voice checks keep the installed app data and existing logs', () => {
    const runner = Object.create(Runner.prototype);
    runner.environment = { ANDROID_AUTO_E2E_SUITE: 'voice-search' };
    runner.suite = {
        appId: 'test.app',
        location: { longitude: -88, latitude: 43 },
    };
    const commands = [];
    runner.adb = (args) => {
        commands.push(args);
        return { stdout: '12345.000000000\n' };
    };
    runner.prepareDevice();
    assert.equal(runner.logcatStart, '12345.000000000');
    assert.ok(
        !commands.some((args) =>
            ['clear', '-c', 'force-stop'].some((command) =>
                args.includes(command),
            ),
        ),
    );
});

test('normal voice setup and teardown preserve the phone process', async () => {
    const runner = Object.create(Runner.prototype);
    runner.environment = { ANDROID_AUTO_E2E_SUITE: 'voice-search' };
    runner.suite = {
        appId: 'test.app',
        metro: { host: '10.0.2.2', port: 8091 },
    };
    runner.metroOutput = '';
    runner.report = () => {};
    runner.serviceRunning = () => false;
    const commands = [];
    runner.adb = (args) => commands.push(args);
    runner.openDevelopmentClient(1);
    await runner.cleanup();
    assert.deepEqual(
        commands.map((args) => args.slice(0, 3)),
        [['shell', 'am', 'start']],
    );
    runner.openDevelopmentClient(1, true);
    assert.deepEqual(commands[1], ['shell', 'am', 'force-stop', 'test.app']);
});

for (const mapUnavailable of [false, true]) {
    test(`after a failed voice journey the next setup keeps the session when the map is ${mapUnavailable ? 'unavailable' : 'available'}`, async () => {
        const runner = Object.create(Runner.prototype);
        runner.runDirectory = mkdtempSync(join(tmpdir(), 'daf-voice-search-'));
        runner.environment = { ANDROID_AUTO_E2E_SUITE: 'voice-search' };
        runner.suite = {
            tests: [
                {
                    name: 'first',
                    group: 'voice-search',
                    steps: [{ type: 'failed' }],
                },
                {
                    name: 'retry',
                    group: 'voice-search',
                    stationary: true,
                    steps: [],
                },
                { name: 'disconnect', steps: [] },
            ],
        };
        runner.results = [];
        runner.metroOutput = '';
        runner.report = () => {};
        const recovery = [];
        runner.prepareStationaryScenario = async () => {
            recovery.push('prepare');
            if (mapUnavailable) throw new Error('Map unavailable');
        };
        runner.stopDhu = async () => recovery.push('disconnect');
        runner.connectCarApp = async () => recovery.push('connect');
        runner.captureScreenshot = async () => {};
        runner.runStep = async () => {
            throw new Error('No destination');
        };
        try {
            await assert.rejects(
                runner.runSuite(),
                /Voice-search scenarios failed: first/,
            );
            assert.deepEqual(recovery, ['prepare']);
            assert.deepEqual(
                JSON.parse(
                    readFileSync(
                        join(runner.runDirectory, 'results.json'),
                        'utf8',
                    ),
                ),
                [
                    { name: 'first', passed: false, error: 'No destination' },
                    mapUnavailable
                        ? {
                              name: 'retry',
                              passed: false,
                              error: 'Map unavailable',
                          }
                        : { name: 'retry', passed: true },
                    { name: 'disconnect', passed: true },
                ],
            );
        } finally {
            rmSync(runner.runDirectory, { recursive: true, force: true });
        }
    });
}

test('voice recognition journeys run in both layouts, keeping each retry in the same search session', () => {
    for (const orientation of ['suite.json', 'suite-portrait.json']) {
        const suite = loadSuite(
            new URL(`../../.android-auto/${orientation}`, import.meta.url)
                .pathname,
        );
        const { tests } = selectAndroidAutoSuite(suite, {
            ANDROID_AUTO_E2E_SUITE: 'voice-search',
        });
        assert.equal(tests.at(-1).name, 'disconnect');
        for (const layout of ['dashboard', 'fullscreen']) {
            const journeys = tests.filter(
                (test) => test.layout === layout && test.stationary,
            );
            assert.deepEqual(
                journeys.map(({ steps }) =>
                    steps
                        .filter(({ type }) => type === 'dictateSearch')
                        .map(({ query, outcome }) => query ?? outcome),
                ),
                [
                    ['Walmart'],
                    ['Taco Bell'],
                    ['silence'],
                    ['cancel'],
                    ['Walmart', 'Taco Bell'],
                    ['Taco Bell', 'Walmart'],
                ],
            );
            for (const { steps } of journeys) {
                assert.ok(
                    !steps.some(({ type }) =>
                        [
                            'resetUI',
                            'recognizedSearch',
                            'restartAppWhileSearching',
                        ].includes(type),
                    ),
                );
                const attempts = steps.filter(
                    ({ type }) => type === 'dictateSearch',
                );
                if (attempts.length === 2) {
                    const between = steps.slice(
                        steps.indexOf(attempts[0]) + 1,
                        steps.indexOf(attempts[1]),
                    );
                    assert.ok(between.some(({ type }) => type === 'hostBack'));
                    assert.ok(
                        between.some(({ contains }) =>
                            contains?.includes('Recents'),
                        ),
                    );
                    assert.ok(
                        steps.some(
                            ({ previousQuery }) =>
                                previousQuery === attempts[0].query,
                        ),
                    );
                }
                if (attempts.at(-1).query) {
                    assert.ok(
                        steps.some(
                            ({ text, match }) =>
                                match === 'result' &&
                                text === attempts.at(-1).query,
                        ),
                    );
                    assert.ok(
                        steps.some(
                            ({ expected }) => expected?.previewVisible === true,
                        ),
                    );
                } else {
                    assert.equal(
                        steps.at(-2).type,
                        'assertNoVoiceSearchResults',
                    );
                }
            }
        }
    }
});

test('the optional app-restart regression runs only before standalone destination searches', () => {
    const suite = loadSuite(
        new URL('../../.android-auto/suite.json', import.meta.url).pathname,
    );
    const { tests } = selectAndroidAutoSuite(suite, {
        ANDROID_AUTO_E2E_SUITE: 'voice-search',
        ANDROID_AUTO_E2E_RESTART_DURING_SEARCH: '1',
    });
    const restarted = tests.filter(({ steps }) =>
        steps.some((step) => step.type === 'restartAppWhileSearching'),
    );
    assert.equal(restarted.length, 4);
    for (const { steps } of restarted) {
        const restart = steps.findIndex(
            (step) => step.type === 'restartAppWhileSearching',
        );
        assert.ok(
            steps
                .slice(0, restart)
                .some((step) => step.contains?.includes('Where to?')),
        );
        const attempts = steps
            .slice(restart + 1)
            .filter((step) => step.type === 'dictateSearch');
        assert.equal(attempts.length, 1);
        assert.ok(['Walmart', 'Taco Bell'].includes(attempts[0].query));
    }
});

test('between-drive voice search selects both spoken destinations from the car', () => {
    const suite = loadSuite(
        new URL('../../.android-auto/suite-portrait.json', import.meta.url)
            .pathname,
    );
    const environment = { ANDROID_AUTO_E2E_SUITE: 'between-drives' };
    const { tests } = selectAndroidAutoSuite(suite, environment);
    assert.deepEqual(
        tests.slice(0, -1).map((test) => test.layout),
        ['dashboard', 'fullscreen'],
    );
    for (const { steps } of tests.slice(0, -1)) {
        const split = steps.findIndex(
            (step) => step.type === 'reconnectAfterAppExit',
        );
        assert.equal(steps[0].type, 'recordFirstDriveProcesses');
        assert.equal(steps.at(-1).type, 'verifyDriveProcesses');
        for (const [leg, query] of [
            [steps.slice(0, split), 'Walmart'],
            [steps.slice(split + 1), 'Taco Bell'],
        ]) {
            assert.equal(
                leg.find((step) => step.type === 'dictateSearch').query,
                query,
            );
            assert.equal(
                leg.find((step) => step.type === 'assertVoiceSearchRow').query,
                query,
            );
            assert.equal(
                leg.find(
                    (step) => step.type === 'tapOcr' && step.match === 'result',
                ).text,
                query,
            );
            assert.ok(
                leg.some(
                    (step) =>
                        step.contains?.includes('Start') &&
                        step.contains.includes(query),
                ),
            );
            assert.ok(
                !leg.some(
                    (step) =>
                        step.type === 'assertAutoPlayState' ||
                        step.type === 'recognizedSearch',
                ),
            );
        }
    }
    const runner = Object.create(Runner.prototype);
    runner.environment = environment;
    assert.equal(runner.preservesAppData, true);
});

test('cold search locates the visible magnifier when the shortcut count changes', async () => {
    const runner = Object.create(Runner.prototype);
    const bounds = { x: 80, y: 10, width: 770, height: 700 };
    runner.captureScreenshot = () => ({ imagePath: 'map.png', textBounds: [] });
    let reveals = 0;
    runner.runStep = (step) => {
        assert.equal(step.type, 'tapMap');
        reveals++;
    };
    runner.waitFor = async (predicate) => {
        assert.equal(await predicate(), false);
        assert.equal(await predicate(), true);
    };
    const locations = [null, { x: 736, y: 48 }];
    runner.run = (_command, args) => {
        assert.equal(args[0], '--find-icon');
        assert.equal(args[1], 'map.png');
        assert.ok(args[2].endsWith('search-control.png'));
        assert.deepEqual(args.slice(3), ['80', '10', '770', '96']);
        return { stdout: JSON.stringify(locations.shift()) };
    };
    assert.deepEqual(await runner.parkedSearchPoint(bounds), { x: 736, y: 48 });
    assert.equal(reveals, 1);
});

test('the car reconnect requires an observed app exit and an unchanged projection process', async () => {
    const runner = Object.create(Runner.prototype);
    const app = 'test.app';
    const projection = 'com.google.android.projection.gearhead:projection';
    runner.suite = { appId: app };
    let hostPid = '43';
    let appPid = '12';
    let disconnected = false;
    runner.processId = (name) => {
        assert.ok([app, projection].includes(name));
        return name === app ? appPid : hostPid;
    };
    runner.adb = (args) => {
        if (args[1] === 'date') return { stdout: '123.45' };
        assert.equal(disconnected, true);
        if (args[1] === 'run-as') {
            assert.deepEqual(args, [
                'shell',
                'run-as',
                app,
                'kill',
                '-9',
                '12',
            ]);
            appPid = '';
            return { status: 0 };
        }
        if (args[1] === 'am')
            assert.deepEqual(args, [
                'shell',
                'am',
                'kill',
                '--user',
                'current',
                app,
            ]);
        else
            assert.deepEqual(args, [
                'shell',
                'input',
                'keyevent',
                'KEYCODE_HOME',
            ]);
    };
    runner.serviceRunning = () => !disconnected;
    runner.report = () => {};
    runner.stopDhu = () => {
        disconnected = true;
    };
    runner.startDhu = () => {
        assert.equal(appPid, '');
        disconnected = false;
        appPid = '34';
    };
    runner.focusCarMap = runner.setCarLayout = () => {};
    runner.waitFor = async (predicate) => assert.equal(await predicate(), true);
    await runner.runStep({ type: 'recordFirstDriveProcesses' });
    await runner.reconnectAfterAppExit();
    assert.equal(runner.driveProcesses.secondApp, '34');
    hostPid = '44';
    assert.throws(() => runner.verifyDriveProcesses(), /Unexpected process/);
    hostPid = '43';
    for (const wrongPid of ['12', '', '56']) {
        appPid = wrongPid;
        assert.throws(
            () => runner.verifyDriveProcesses(),
            /Unexpected process/,
        );
    }
});

function voiceRunner({ noSpeech = false, dismissedByTap = false } = {}) {
    const runner = Object.create(Runner.prototype);
    runner.suite = { mapApiMocks: false };
    runner.carLayout = 'dashboard';
    runner.currentAppBounds = () => ({ x: 80, y: 10, width: 770, height: 700 });
    runner.metroOutput = '';
    let listening = true;
    runner.commands = [];
    runner.tapDhu = (point) => {
        if (point.x === 720 && point.y === 50) return;
        runner.commands.push(point);
        listening = false;
    };
    runner.captureScreenshot = async () => ({
        layoutProof: listening
            ? { gridDots: 0, dashboardButtons: 0, layout: 'unknown' }
            : { gridDots: 9, dashboardButtons: 0, layout: 'dashboard' },
    });
    runner.adb = ([command]) => ({
        stdout:
            command === 'shell'
                ? '1795801436.123456789'
                : 'RecognitionService#onMicrophoneOpened\nSent microphone open request\n' +
                  (listening
                      ? ''
                      : 'RecognitionService#onMicrophoneCloseRequested\nmakeBackground for component VoicePlateCarService\n' +
                        (dismissedByTap
                            ? 'Session Cancel Trigger: SCRIM_CLICKED\n'
                            : '') +
                        (noSpeech
                            ? '#onRecognitionFinished no speech - erroring\n'
                            : '')),
    });
    runner.sendDhu = (command) => {
        runner.commands.push(command);
        listening = false;
    };
    runner.waitFor = async (predicate, description) => {
        if (description.includes('close its microphone')) listening = false;
        assert.ok(await predicate(), description);
    };
    return runner;
}

test('DHU voice recordings contain mono 16 kHz PCM speech or digital silence', () => {
    for (const name of ['walmart', 'taco-bell', 'silence']) {
        const wav = readFileSync(
            new URL(`../../.android-auto/voice/${name}.wav`, import.meta.url),
        );
        assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
        assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
        assert.equal(wav.readUInt16LE(20), 1); // PCM
        assert.equal(wav.readUInt16LE(22), 1);
        assert.equal(wav.readUInt32LE(24), 16000);
        assert.equal(wav.readUInt16LE(34), 16);
        assert.equal(wav.toString('ascii', 36, 40), 'data');
        const samples = wav.subarray(44);
        assert.ok(samples.length >= 32000);
        assert.equal(
            samples.some((byte) => byte !== 0),
            name !== 'silence',
        );
    }
});

test('an old final transcript, a new partial transcript, or a longer query cannot satisfy dictation', async () => {
    const runner = voiceRunner();
    runner.metroOutput =
        '[Android Auto] search-results-presented {"query":"Walmart","resultCount":1}\n';
    const send = runner.sendDhu;
    runner.sendDhu = (command) => {
        send(command);
        runner.metroOutput +=
            '[Android Auto] search-autocomplete-updated {"query":"Walmart","resultCount":1}\n';
        runner.metroOutput +=
            '[Android Auto] search-results-presented {"query":"Walmart Delafield","resultCount":1}\n';
    };
    await assert.rejects(
        runner.runStep({ type: 'dictateSearch', query: 'Walmart' }),
        /Last app callback was search-results-presented for "Walmart Delafield"/,
    );
});

test('silence plays a silent recording and cancellation dismisses the listening overlay', async () => {
    for (const [outcome, command] of [
        ['silence', 'mic play .android-auto/voice/silence.wav'],
        ['cancel', { x: 104, y: 360 }],
    ]) {
        const runner = voiceRunner({
            noSpeech: true,
            dismissedByTap: outcome === 'cancel',
        });
        await runner.runStep({ type: 'dictateSearch', outcome });
        assert.deepEqual(runner.commands, command ? [command] : []);
        await runner.runStep({ type: 'assertNoVoiceSearchResults' });
        runner.metroOutput +=
            '[Android Auto] search-results-presented {"query":"old destination","resultCount":1}\n';
        await assert.rejects(
            runner.runStep({ type: 'assertNoVoiceSearchResults' }),
            /Unexpected search/,
        );
    }
});

test('saved places behind the closing voice overlay cannot satisfy a no-speech journey', async () => {
    const runner = voiceRunner({ noSpeech: true });
    runner.captureScreenshot = async () => ({
        ocr: 'Where to? Recents Favorites',
        layoutProof: { gridDots: 0, dashboardButtons: 0, layout: 'unknown' },
    });
    await assert.rejects(
        runner.runStep({ type: 'dictateSearch', outcome: 'silence' }),
        /dashboard layout to return/,
    );
});

for (const hostError of [
    'Remote call ON_SEARCH_TEXT_CHANGED failed',
    'ANR API: ON_SEARCH_SUBMITTED',
]) {
    test(`a recovered car screen still fails on ${hostError}`, async () => {
        const runner = voiceRunner({ noSpeech: true });
        runner.report = () => {};
        const adb = runner.adb;
        runner.adb = (args) => {
            const result = adb(args);
            if (args[0] === 'logcat')
                result.stdout += '\nE CarApp.H.Tem: Error: ' + hostError;
            return result;
        };
        await assert.rejects(
            runner.dictateSearch({ outcome: 'silence' }),
            /Android Auto host callback/,
        );
    });
}

test('an ignored cancel tap cannot pass when the recognizer times out for silence', async () => {
    await assert.rejects(
        voiceRunner({ noSpeech: true }).runStep({
            type: 'dictateSearch',
            outcome: 'cancel',
        }),
        /did not acknowledge the tap/,
    );
    await assert.rejects(
        voiceRunner().runStep({ type: 'dictateSearch', outcome: 'silence' }),
        /without confirming the no-speech/,
    );
});

test('the cancel tap waits until the listening overlay reaches the head unit', async () => {
    const runner = voiceRunner({ noSpeech: true, dismissedByTap: true });
    const frames = [
        { gridDots: 9, dashboardButtons: 0 },
        { gridDots: 0, dashboardButtons: 1 },
        { gridDots: 0, dashboardButtons: 0 },
    ];
    const captureScreenshot = runner.captureScreenshot;
    runner.captureScreenshot = async (name) => {
        if (name !== 'voice-listening') return captureScreenshot(name);
        assert.deepEqual(runner.commands, []);
        return { layoutProof: frames.shift() };
    };
    runner.waitFor = async (predicate) => {
        for (let attempt = 0; attempt < 3; attempt++)
            if (await predicate()) return;
        assert.fail('The required evidence never arrived');
    };
    await runner.runStep({ type: 'dictateSearch', outcome: 'cancel' });
    assert.equal(frames.length, 0);
    assert.deepEqual(runner.commands, [{ x: 104, y: 360 }]);
});

test('audio waits for the car microphone without delaying playback for screenshots', async () => {
    const runner = voiceRunner();
    const send = runner.sendDhu;
    runner.sendDhu = (command) => {
        send(command);
        runner.metroOutput +=
            '[Android Auto] search-results-presented {"query":"Walmart","resultCount":1}\n';
    };
    const adb = runner.adb;
    let open = false;
    runner.adb = (args) => {
        const result = adb(args);
        if (!open)
            result.stdout = result.stdout.replace(
                'Sent microphone open request',
                '',
            );
        return result;
    };
    runner.waitFor = async (predicate, description) => {
        if (description.includes('begin listening')) {
            assert.equal(await predicate(), false);
            open = true;
        }
        assert.ok(await predicate(), description);
    };
    const capture = runner.captureScreenshot;
    runner.captureScreenshot = async (name, options) => {
        assert.notEqual(name, 'voice-listening');
        return capture(name, options);
    };
    await runner.dictateSearch({ query: 'Walmart' });
    assert.deepEqual(runner.commands, [
        'mic play .android-auto/voice/walmart.wav',
    ]);
});

test('a closed car microphone cannot launch a second voice session during playback', async () => {
    const runner = voiceRunner();
    const adb = runner.adb;
    let receivedOpen = false;
    runner.adb = (args) => {
        const result = adb(args);
        if (args[0] === 'logcat') {
            if (receivedOpen)
                result.stdout +=
                    '\nSent microphone close request, frames received 0';
            receivedOpen = true;
        }
        return result;
    };
    await assert.rejects(
        runner.dictateSearch({ query: 'Walmart' }),
        /closed before fixture playback/,
    );
    assert.deepEqual(runner.commands, []);
});

test('the dictated query in the search field cannot stand in for a selectable new result', async () => {
    const runner = voiceRunner();
    const field = { text: 'Taco Bell', x: 290, y: 50 };
    const row = { text: 'Taco Bell', x: 210, y: 160 };
    const frames = [
        { ocr: 'Taco Bell\nSearching...', textBounds: [field] },
        { ocr: 'Taco Bell', textBounds: [field] },
        { ocr: 'Taco Bell\nWalmart', textBounds: [field, row] },
        { ocr: 'Taco Bell\nTaco Bell', textBounds: [field, row] },
    ];
    runner.captureScreenshot = async () => frames.shift();
    runner.waitFor = async (predicate) => {
        assert.equal(await predicate(), false);
        await assert.rejects(predicate(), /No visible Android Auto result/);
        assert.equal(await predicate(), false);
        assert.deepEqual(await predicate(), row);
    };
    await runner.runStep({
        type: 'assertVoiceSearchRow',
        query: 'Taco Bell',
        previousQuery: 'Walmart',
    });
});
