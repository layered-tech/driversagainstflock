import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    androidAutoKeyboardIsVisible,
    autoPlayStateMatches,
    buildAndroidAutoNavigationSuite,
    findAndroidAutoInputDisplay,
    findAndroidAutoText,
    getAndroidAutoControlPoint,
    getAndroidAutoKeyboardPoints,
    getAndroidAutoNavigationUIFailure,
    selectAndroidAutoSuite,
} from '../android-auto-navigation-suite.mjs';
import {
    getOCRAssertionFailure,
    loadSuite,
    Runner,
} from '../android-auto-e2e.mjs';
import { buildCarPlayNavigationSuite } from '../carplay-navigation-suite.mjs';

const suitePath = new URL('../../.android-auto/suite.json', import.meta.url)
    .pathname;
const legacy = loadSuite(suitePath);

test('navigation controls reveal the Android header after slow screenshot processing before tapping', async () => {
    const runner = Object.create(Runner.prototype);
    runner.suite = { mapApiMocks: false };
    runner.metroOutput = '';
    let headerVisible = false,
        accepted = false;
    runner.autoPlayCommand = async () => ({ isNavigating: true });
    runner.currentMapCrop = () => ({ x: 300, y: 200, width: 300, height: 200 });
    runner.currentAppBounds = () => ({ x: 0, y: 0, width: 1000, height: 700 });
    runner.captureScreenshot = async () => {
        headerVisible = false; // OCR can outlast Android Auto's header timeout.
        return { ocr: '', textBounds: [] };
    };
    runner.tapDhu = ({ x, y }) => {
        if (x === 450 && y === 300) headerVisible = true;
        else {
            assert.ok(
                headerVisible,
                'Header expired while the screenshot was being processed',
            );
            accepted = true;
        }
    };
    await runner.runStep({ type: 'tapControl', name: 'options' });
    assert.ok(accepted);
});

test('a late ALPR warning cannot silently consume the navigation options tap', async () => {
    const runner = Object.create(Runner.prototype);
    runner.suite = { mapApiMocks: false };
    runner.metroOutput = '';
    let warning = false,
        opened = false,
        attempts = 0,
        dismissed = 0;
    runner.autoPlayCommand = async () => ({ isNavigating: true });
    runner.currentMapCrop = () => ({ x: 300, y: 200, width: 300, height: 200 });
    runner.currentAppBounds = () => ({ x: 0, y: 0, width: 1000, height: 700 });
    runner.captureScreenshot = async () => ({
        ocr: opened
            ? "Map layer Map's Time of Day"
            : warning
              ? 'ALPR ahead OK'
              : 'Turn right',
        textBounds: warning ? [{ text: 'OK', x: 100, y: 100 }] : [],
    });
    runner.tapDhu = ({ x, y }) => {
        if (x === 450 && y === 300) return;
        if (x === 100 && y === 100) {
            warning = false;
            dismissed++;
            return;
        }
        attempts++;
        if (attempts === 1) warning = true;
        else if (!warning) opened = true;
    };
    runner.waitFor = async (predicate) => {
        for (let attempt = 0; attempt < 4; attempt++)
            if (await predicate()) return;
        assert.fail('The requested native panel never opened');
    };
    await runner.runStep({
        type: 'tapControl',
        name: 'options',
        expectText: ['Map layer', "Map's Time of Day"],
    });
    assert.ok(opened);
    assert.equal(dismissed, 1);
    assert.equal(attempts, 2);
});

test('stationary UI GPS is on the recorded road and separated from both saved-place endpoints', () => {
    const path = JSON.parse(
        readFileSync(
            new URL('../../.android-auto/route-pewaukee.json', import.meta.url),
        ),
    ).routes[0].overview_path;
    const point = legacy.stationaryLocation;
    assert.ok(point, 'Stationary UI cases need a separate start point');
    assert.ok(
        path.some(
            ({ lat, lng }) =>
                Math.abs(lat - point.latitude) < 0.000001 &&
                Math.abs(lng - point.longitude) < 0.000001,
        ),
    );
    for (const end of [path[0], path.at(-1)])
        assert.ok(Math.abs(end.lat - point.latitude) > 0.005);
});

test('map panning waits for rendered movement after the follow state changes', () => {
    const steps = buildAndroidAutoNavigationSuite()[0].steps;
    const pan = steps.find(({ type }) => type === 'assertMapAppearanceChanged');
    assert.deepEqual(pan, {
        type: 'assertMapAppearanceChanged',
        before: 'map-locked',
        after: 'map-panned',
    });
    assert.ok(
        steps.some(({ expected }) => expected?.trackingState === 'recenter'),
    );
});

test('Android Auto mirrors shared CarPlay feature scenarios using Android native controls', () => {
    const android = buildAndroidAutoNavigationSuite();
    const carplay = buildCarPlayNavigationSuite();
    for (const scenario of carplay.filter(
        ({ name }) =>
            !name.startsWith('Dashboard:') && !name.startsWith('shows native'),
    )) {
        assert.ok(
            android.some(({ name }) => name === scenario.name),
            scenario.name,
        );
    }
    assert.equal(android.length, 13);
    const steps = android.flatMap(({ steps }) => steps);
    assert.ok(android.every(({ stationary }) => stationary));
    assert.ok(
        !steps.some(({ type }) =>
            [
                'replayRoute',
                'autoDrive',
                'deepLink',
                'assertCarPlayState',
                'openDashboard',
            ].includes(type),
        ),
    );
    for (const query of ['Walmart', 'Walmart Delafield']) {
        const voice = android.find(
            ({ name }) =>
                name === `Voice search for ${query} opens route choices`,
        );
        assert.equal(
            voice.steps.find(({ type }) => type === 'recognizedSearch').query,
            query,
        );
        assert.ok(
            voice.steps.some(
                ({ waitForMetro }) =>
                    waitForMetro === '[Android Auto] search-result-selected',
            ),
        );
        assert.ok(
            voice.steps.some(
                ({ expected }) => expected?.routeChoiceCount?.minimum === 1,
            ),
        );
    }
    const keyboard = android.find(({ name }) => name.startsWith('Keyboard'));
    assert.ok(
        keyboard.steps.some(
            ({ type, text }) =>
                type === 'enterSearchText' && text === 'Walmart',
        ),
    );
    assert.ok(!keyboard.steps.some(({ type }) => type === 'recognizedSearch'));
});

test('all and UI groups cover both layouts in landscape and portrait and disconnect last', () => {
    const portrait = loadSuite(
        new URL('../../.android-auto/suite-portrait.json', import.meta.url)
            .pathname,
    );
    for (const source of [legacy, portrait]) {
        assert.equal(source.mapApiMocks, false);
        for (const [group, count] of [
            ['all', 43],
            ['alpr', 17],
            ['navigation', 27],
        ]) {
            const selected = selectAndroidAutoSuite(source, {
                ANDROID_AUTO_E2E_SUITE: group,
            });
            assert.equal(selected.tests.length, count);
            assert.equal(selected.tests.at(-1).name, 'disconnect');
            for (const layout of ['dashboard', 'fullscreen']) {
                assert.equal(
                    selected.tests.filter(
                        (test) => test.stationary && test.layout === layout,
                    ).length,
                    group === 'alpr' ? 0 : 13,
                );
            }
        }
    }
});

test('scenario selection rejects typos and preserves all live GPS steps', () => {
    assert.throws(
        () =>
            selectAndroidAutoSuite(legacy, { ANDROID_AUTO_E2E_SUITE: 'typo' }),
        /must be/,
    );
    assert.throws(
        () =>
            selectAndroidAutoSuite(legacy, {
                ANDROID_AUTO_E2E_SCENARIO: 'missing',
            }),
        /No Android/,
    );
    const filtered = selectAndroidAutoSuite(legacy, {
        ANDROID_AUTO_E2E_SUITE: 'navigation',
        ANDROID_AUTO_E2E_SCENARIO: 'KEYBOARD',
    });
    assert.equal(filtered.tests.length, 3);
    const selected = selectAndroidAutoSuite(legacy).tests;
    for (const test of legacy.tests)
        assert.deepEqual(
            selected.find(({ name }) => name === test.name),
            test,
        );
});

test('suite listing and shell wrapper need no adb connection or writable external storage', () => {
    for (const entry of ['android-auto-e2e.mjs', 'android-auto-e2e.sh']) {
        const command = entry.endsWith('.sh') ? 'bash' : process.execPath;
        const output = execFileSync(
            command,
            [new URL(`../${entry}`, import.meta.url).pathname, '--list'],
            {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    ANDROID_AUTO_E2E_SUITE: 'navigation',
                    ANDROID_AUTO_E2E_SCENARIO: 'Keyboard',
                    DAF_EAS_LOCAL_BUILD_ROOT: '/missing-storage',
                },
            },
        );
        assert.match(output, /Dashboard: Keyboard search/);
        assert.match(output, /Fullscreen: Keyboard search/);
        assert.equal(output.trim().split('\n').length, 3);
        const help = execFileSync(
            command,
            [new URL(`../${entry}`, import.meta.url).pathname, '--help'],
            { encoding: 'utf8' },
        );
        assert.match(help, /Android display input/);
        assert.doesNotMatch(help, /Accessibility/);
    }
});

test('map options verify persisted selections, applied light and actual rendered changes', () => {
    const suite = buildAndroidAutoNavigationSuite();
    const layers = suite.find(({ name }) =>
        name.startsWith('Map Options: switches'),
    );
    assert.deepEqual(
        layers.steps
            .filter(({ expected }) => expected?.mapLayer)
            .map(({ expected }) => expected.mapLayer),
        ['standard', 'standard-satellite', 'standard'],
    );
    assert.equal(
        layers.steps.filter(({ type }) => type === 'assertMapAppearanceChanged')
            .length,
        2,
    );
    const light = suite.find(({ name }) =>
        name.startsWith('Map Options: changes'),
    );
    assert.deepEqual(
        light.steps
            .filter(({ expected }) => expected?.mapLightPresetPreference)
            .map(({ expected }) => expected.mapLightPresetPreference),
        ['day', 'night', 'dawn', 'dusk', 'auto'],
    );
    assert.deepEqual(
        light.steps
            .filter(({ expected }) => expected?.appliedMapLightPreset)
            .map(({ expected }) => expected.appliedMapLightPreset),
        ['day', 'night', 'dawn', 'dusk'],
    );
});

test('saved places update the open native search list before selecting Work', () => {
    const scenario = buildAndroidAutoNavigationSuite().find(({ name }) =>
        name.startsWith('saved-place changes'),
    );
    assert.deepEqual(
        scenario.steps
            .filter(({ type }) => type === 'setPrimaryLocations')
            .map(({ locations }) => locations),
        ['work', 'none', 'work'],
    );
    assert.ok(
        scenario.steps.some(({ notContains }) => notContains?.includes('Home')),
    );
    assert.ok(
        scenario.steps.some(
            ({ text, type }) => type === 'tapOcr' && text === 'Work',
        ),
    );
    assert.ok(
        scenario.steps.some(
            ({ expected }) => expected?.previewVisible === true,
        ),
    );
});

test('range and guidance assertions fail on missing, empty, NaN and out-of-range state', () => {
    const expected = {
        isNavigating: true,
        maneuverText: { nonempty: true },
        routeChoiceCount: { minimum: 1, maximum: 6 },
    };
    const actual = {
        isNavigating: true,
        maneuverText: 'Turn right',
        routeChoiceCount: 2,
    };
    assert.equal(autoPlayStateMatches(actual, expected), true);
    for (const patch of [
        { maneuverText: ' ' },
        { maneuverText: undefined },
        { routeChoiceCount: 0 },
        { routeChoiceCount: 7 },
        { routeChoiceCount: NaN },
        { routeChoiceCount: undefined },
        { isNavigating: false },
    ]) {
        assert.equal(
            autoPlayStateMatches({ ...actual, ...patch }, expected),
            false,
        );
    }
});

test('native action selection distinguishes Standard from Satellite and ignores loading text', () => {
    const shot = {
        textBounds: [
            { text: 'Standard Satellite', x: 100, y: 100 },
            { text: 'Standard', x: 100, y: 200 },
            { text: 'Walmart', x: 250, y: 60 },
            { text: 'Searching for Walmart', x: 100, y: 300 },
            { text: 'Walmart Supercenter', x: 100, y: 400 },
        ],
    };
    assert.equal(
        findAndroidAutoText(shot, { text: 'Standard', exact: true }).y,
        200,
    );
    assert.equal(
        findAndroidAutoText(shot, { text: 'Walmart', match: 'result' }).y,
        400,
    );
    assert.throws(
        () => findAndroidAutoText(shot, { text: 'Standard' }),
        /Expected one/,
    );
    assert.throws(
        () => findAndroidAutoText(shot, { text: 'Missing', exact: true }),
        /Expected one/,
    );
});

test('native control coordinates follow header changes and both host orientations', () => {
    const portrait = loadSuite(
        new URL('../../.android-auto/suite-portrait.json', import.meta.url)
            .pathname,
    );
    for (const suite of [legacy, portrait])
        for (const { appBounds: bounds } of Object.values(suite.layouts)) {
            for (const state of [
                { home: true, work: true },
                { home: false, work: true },
                { isNavigating: true },
            ]) {
                for (const name of [
                    'search',
                    'options',
                    'overview',
                    'recenter',
                    ...(state.home ? ['home'] : []),
                    ...(state.work ? ['work'] : []),
                    ...(state.isNavigating ? ['steps'] : []),
                ]) {
                    const point = getAndroidAutoControlPoint(
                        bounds,
                        name,
                        state,
                    );
                    assert.ok(
                        point.x > bounds.x && point.x < bounds.x + bounds.width,
                    );
                    assert.ok(
                        point.y > bounds.y &&
                            point.y < bounds.y + bounds.height,
                    );
                }
            }
            assert.throws(
                () =>
                    getAndroidAutoControlPoint(bounds, 'home', { home: false }),
                /Unavailable/,
            );
        }
});

test('portrait Dashboard controls hit the native buttons observed in the DHU capture', () => {
    const portrait = loadSuite(
        new URL('../../.android-auto/suite-portrait.json', import.meta.url)
            .pathname,
    );
    for (const [name, top, bottom] of [
        ['options', 37, 102],
        ['recenter', 680, 743],
    ]) {
        const point = getAndroidAutoControlPoint(
            portrait.layouts.dashboard.appBounds,
            name,
            { home: true, work: true, recenterControlVisible: true },
        );
        assert.ok(point.x >= 1453 && point.x <= 1519, `${name} x=${point.x}`);
        assert.ok(point.y >= top && point.y <= bottom, `${name} y=${point.y}`);
    }
});

test('native keyboard input targets OCR keys and rejects absent keys instead of injecting search', () => {
    const keyboard = {
        height: 720,
        textBounds: [
            { text: 'Walmart', x: 300, y: 100, width: 200 },
            { text: 'q w e r t y u i o p', x: 600, y: 400, width: 600 },
            { text: 'asdfghjkl', x: 600, y: 470, width: 540 },
            { text: 'zxcvbnm', x: 600, y: 540, width: 420 },
        ],
    };
    const points = getAndroidAutoKeyboardPoints(keyboard, 'Walmart');
    assert.equal(points.length, 7);
    assert.equal(points[0].x, 390);
    assert.equal(points[0].y, 400);
    assert.equal(points[1].y, 470);
    assert.throws(
        () => getAndroidAutoKeyboardPoints(keyboard, '1'),
        /not visible/,
    );
    assert.throws(
        () =>
            getAndroidAutoKeyboardPoints(
                { height: 720, textBounds: keyboard.textBounds.slice(0, 1) },
                'Walmart',
            ),
        /not visible/,
    );
});

test('missing top-row keyboard glyphs are recovered only from two aligned middle and bottom rows', () => {
    const shot = {
        height: 720,
        textBounds: [
            { text: 'w', x: 395, y: 507 },
            { text: 'a', x: 359, y: 562 },
            { text: 's', x: 430, y: 562 },
            { text: 'z', x: 394, y: 618 },
            { text: 'c', x: 535, y: 618 },
            { text: 'm', x: 815, y: 618 },
        ],
    };
    const [q] = getAndroidAutoKeyboardPoints(shot, 'q');
    assert.ok(Math.abs(q.x - 325) < 5);
    assert.ok(Math.abs(q.y - 507) < 5);
    assert.throws(
        () =>
            getAndroidAutoKeyboardPoints(
                {
                    ...shot,
                    textBounds: shot.textBounds.filter(
                        ({ text }) => text !== 's',
                    ),
                },
                'q',
            ),
        /not visible/,
    );
});

test('state requests ignore stale Metro samples and return only post-request state', async () => {
    const runner = Object.create(Runner.prototype);
    runner.suite = { appId: 'test.app' };
    runner.metroOutput = '[E2E] android-auto-state {"isNavigating":false}\n';
    runner.adb = (args) => {
        assert.match(args[1], /e2e-android-auto\?command=state/);
        assert.ok(!args[1].includes('e2e-mocks'));
        runner.metroOutput +=
            '\u001b[32m INFO [E2E] android-auto-state {"isNavigating":true}\u001b[0m\n';
    };
    runner.waitForMetroMarker = async (marker, offset) => {
        assert.ok(offset > 0);
        assert.ok(runner.metroOutput.slice(offset).includes(marker));
    };
    assert.equal((await runner.autoPlayCommand('state')).isNavigating, true);
});

test('appearance comparison retries until the rendered crop changes', async () => {
    const runner = Object.create(Runner.prototype);
    let captures = 0;
    runner.captureScreenshot = async () => {
        captures++;
    };
    runner.mapCropPixelDifference = () => (captures === 1 ? 0 : 0.1);
    runner.waitFor = async (predicate) => {
        assert.equal(await predicate(), false);
        assert.equal(await predicate(), true);
    };
    await runner.assertMapAppearanceChanged({ before: 'day', after: 'night' });
    assert.equal(captures, 2);
});

test('native drags use the active Android Auto display without macOS window input', async () => {
    const runner = Object.create(Runner.prototype);
    runner.currentAppBounds = () => ({
        x: 449,
        y: 10,
        width: 1022,
        height: 990,
    });
    runner.report = () => {};
    runner.displayDump = () =>
        'mBaseDisplayInfo=DisplayInfo{"com.google.android.projection.gearhead/kge", displayId 60, real 1022 x 990, state ON, type VIRTUAL, uniqueId "virtual:com.google.android.projection.gearhead,10145,com.google.android.projection.gearhead/kge,50"}';
    runner.adb = (args) =>
        assert.deepEqual(args, [
            'shell',
            'input',
            'touchscreen',
            '-d',
            '60',
            'swipe',
            '511',
            '396',
            '715',
            '594',
            '600',
        ]);
    runner.run = () =>
        assert.fail('Virtual-display input must not use a macOS helper');
    await runner.dragDisplay([0.5, 0.4], [0.7, 0.6]);
    await assert.rejects(runner.dragDisplay([-4, 0], [0.7, 0.6]), /outside/);
});

test('display selection rejects the phone, inactive surfaces, unrelated owners and ambiguous hosts', () => {
    const display =
        'mBaseDisplayInfo=DisplayInfo{"com.google.android.projection.gearhead/kge", displayId 60, real 1190 x 700, state ON, type VIRTUAL, uniqueId "virtual:com.google.android.projection.gearhead,10145,com.google.android.projection.gearhead/kge,50"}';
    assert.equal(findAndroidAutoInputDisplay(display).id, 60);
    for (const dump of [
        '',
        display.replace('state ON', 'state OFF'),
        display.replace('type VIRTUAL', 'type INTERNAL'),
        display.replace(
            'uniqueId "virtual:com.google.android.projection.gearhead,',
            'uniqueId "virtual:other,',
        ),
        display + '\n' + display,
    ]) {
        assert.throws(
            () => findAndroidAutoInputDisplay(dump),
            /Expected one active/,
        );
    }
});

test('each stationary scenario resets, seeds, verifies layout and records success or failure', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'daf-aa-suite-'));
    try {
        const runner = Object.create(Runner.prototype);
        const events = [];
        runner.runDirectory = directory;
        runner.results = [];
        runner.metroOutput = '';
        runner.screenshots = new Map();
        runner.suite = {
            location: { latitude: 43, longitude: -88 },
            stationaryLocation: { latitude: 43.5, longitude: -88.5 },
            tests: [
                {
                    name: 'first',
                    stationary: true,
                    layout: 'dashboard',
                    steps: [{ type: 'first' }],
                },
                {
                    name: 'second',
                    stationary: true,
                    layout: 'fullscreen',
                    steps: [{ type: 'fail' }],
                },
            ],
        };
        runner.report = () => {};
        runner.setEmulatorLocation = (fix) =>
            assert.deepEqual(fix, {
                latitude: 43.5,
                longitude: -88.5,
                velocityKnots: 0,
            });
        runner.sendDhu = (command) => assert.equal(command, 'restrict none');
        runner.autoPlayCommand = async (command) => events.push(command);
        runner.assertAutoPlayState = async () => events.push('state');
        runner.setCarLayout = async (layout) => events.push(layout);
        runner.runStep = async (step) => {
            events.push(step.type);
            if (step.type === 'fail') throw new Error('test failure');
        };
        runner.captureScreenshot = async () => events.push('failure capture');
        await assert.rejects(runner.runSuite(), /test failure/);
        assert.deepEqual(events, [
            'reset',
            'seed',
            'state',
            'dashboard',
            'first',
            'reset',
            'seed',
            'state',
            'fullscreen',
            'fail',
            'failure capture',
        ]);
        assert.deepEqual(
            JSON.parse(
                readFileSync(join(directory, 'results.json'), 'utf8'),
            ).map(({ passed }) => passed),
            [true, false],
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('native guidance requires estimates in the app footer, excluding the system clock and next-turn distance', () => {
    const bounds = { x: 80, y: 10, width: 1190, height: 700 };
    const state = { maneuverText: 'Turn right onto Main Street' };
    const maneuver = [
        { text: 'Turn right onto', x: 250, y: 60 },
        { text: 'Main Street', x: 250, y: 90 },
        { text: '0.7 mi', x: 170, y: 120 },
    ];
    const estimates = [
        { text: '3 min', x: 230, y: 640 },
        { text: '8:04 PM • 0.9 mi', x: 300, y: 670 },
    ];
    const shot = { textBounds: [...maneuver, ...estimates] };
    assert.equal(getAndroidAutoNavigationUIFailure(shot, state, bounds), null);
    for (const arrival of ['10:35AM . 12 mi', '10:35PM . 12 mi']) {
        assert.equal(
            getAndroidAutoNavigationUIFailure(
                {
                    textBounds: [
                        ...maneuver,
                        estimates[0],
                        { text: arrival, x: 268, y: 670 },
                    ],
                },
                state,
                bounds,
            ),
            null,
        );
    }
    assert.match(
        getAndroidAutoNavigationUIFailure(
            {
                textBounds: [
                    ...maneuver,
                    { text: '8:04', x: 40, y: 640 },
                    estimates[0],
                ],
            },
            state,
            bounds,
        ),
        /arrival/,
    );
    assert.match(
        getAndroidAutoNavigationUIFailure(
            { textBounds: [...maneuver, estimates[1]] },
            state,
            bounds,
        ),
        /duration/,
    );
    assert.match(
        getAndroidAutoNavigationUIFailure(
            {
                textBounds: [
                    ...maneuver,
                    estimates[0],
                    { text: '8:04 PM', x: 300, y: 670 },
                ],
            },
            state,
            bounds,
        ),
        /distance/,
    );
    assert.match(
        getAndroidAutoNavigationUIFailure(
            shot,
            { maneuverText: 'Turn left' },
            bounds,
        ),
        /turn instruction/,
    );
});

test('route startup verifies numbered map pins, native result selection and the host stop callback', () => {
    const scenario = buildAndroidAutoNavigationSuite().at(-1);
    assert.ok(
        scenario.steps.some(
            ({ expected }) => expected?.submittedSearchPinCount?.maximum === 6,
        ),
    );
    assert.ok(
        scenario.steps.some(
            ({ waitForMetro }) =>
                waitForMetro === '[Android Auto] search-map-results-presented',
        ),
    );
    assert.ok(
        scenario.steps.some(
            ({ marker }) => marker === '[Auto Play] search-results-fitted',
        ),
    );
    assert.ok(
        scenario.steps.some(
            ({ name, waitForMetro }) =>
                name === 'exit' &&
                waitForMetro === '[Android Auto] host-navigation-stopped',
        ),
    );
    assert.ok(!scenario.steps.some(({ type }) => type === 'resetUI'));
});

test('keyboard execution opens the native field and taps host keys without issuing a query command', async () => {
    const runner = Object.create(Runner.prototype);
    runner.suite = { mapApiMocks: false };
    const keys = [...new Set('walmart')].map((text, index) => ({
        text,
        x: 150 + index * 50,
        y: 500,
    }));
    const keyboard = { height: 720, textBounds: keys };
    const taps = [];
    runner.captureScreenshot = async (name) =>
        name === 'keyboard-field'
            ? { textBounds: [{ text: 'Where to?', x: 300, y: 80 }] }
            : keyboard;
    runner.tapDhu = (point) => taps.push(point);
    runner.waitFor = async (predicate) => assert.equal(await predicate(), true);
    runner.autoPlayCommand = () =>
        assert.fail('Keyboard input must use the native host');
    await runner.runStep({ type: 'enterSearchText', text: 'Walmart' });
    assert.equal(taps.length, 8);
    assert.equal(taps[0].y, 80);
    assert.deepEqual(
        taps
            .slice(1)
            .map(({ text }) => text)
            .join(''),
        'walmart',
    );
});

test('saved-place lists scroll to off-screen Work and return before selecting Recents', async () => {
    const steps = buildAndroidAutoNavigationSuite().find(
        ({ name }) => name === 'search opens Home Work Recents and Favorites',
    ).steps;
    const work = steps.findIndex(({ contains }) => contains?.includes('Work'));
    assert.ok(
        steps.findIndex(({ type }) => type === 'dismissSearchKeyboard') < work,
    );
    const select = steps.findIndex(
        ({ type, text }) => type === 'tapOcr' && text === 'Recents',
    );
    const scrolls = steps
        .map((step, index) => ({ ...step, index }))
        .filter(({ type }) => type === 'scrollList');
    assert.equal(scrolls.length, 2);
    assert.ok(
        scrolls[0].index < work &&
            scrolls[1].index > work &&
            scrolls[1].index < select,
    );
    assert.ok(scrolls[0].from[1] > scrolls[0].to[1]);
    assert.ok(scrolls[1].from[1] < scrolls[1].to[1]);
    const runner = Object.create(Runner.prototype);
    runner.suite = legacy;
    const drags = [];
    runner.dragDisplay = async (...points) => drags.push(points);
    for (const step of scrolls) await runner.runStep(step);
    assert.deepEqual(
        drags,
        scrolls.map(({ from, to }) => [from, to]),
    );
});

test('saved-list keyboard dismissal requires the active native car keyboard and waits for it to close', async () => {
    const keyboard =
        'mBaseDisplayInfo=DisplayInfo{"TouchInputMethod", displayId 548, real 1190 x 300, uniqueId "virtual:com.google.android.projection.gearhead,10145,TouchInputMethod,546", state ON, type VIRTUAL}';
    assert.equal(androidAutoKeyboardIsVisible(keyboard), true);
    assert.equal(
        androidAutoKeyboardIsVisible(keyboard.replace('state ON', 'state OFF')),
        false,
    );
    assert.equal(
        androidAutoKeyboardIsVisible(
            keyboard.replace('TouchInputMethod', 'AutoPlayRoot'),
        ),
        false,
    );
    assert.equal(
        androidAutoKeyboardIsVisible(
            keyboard.replace(
                'com.google.android.projection.gearhead,',
                'other.app,',
            ),
        ),
        false,
    );
    const runner = Object.create(Runner.prototype);
    runner.suite = legacy;
    const commands = [];
    let visible = true;
    runner.displayDump = () => (visible ? keyboard : '');
    runner.captureScreenshot = async () => ({
        height: 720,
        textBounds: [
            { text: 'q', x: 100, y: 500 },
            { text: 'a', x: 125, y: 550 },
            { text: 'z', x: 150, y: 600 },
        ],
    });
    runner.tapDhu = (point) => {
        commands.push(point);
        visible = false;
    };
    runner.waitFor = async (predicate) => assert.equal(await predicate(), true);
    runner.report = () => {};
    await runner.runStep({ type: 'dismissSearchKeyboard' });
    await runner.runStep({ type: 'dismissSearchKeyboard' });
    assert.deepEqual(
        commands,
        [{ x: 100, y: 650 }],
        'An absent keyboard must not pop the Search screen',
    );
});

test('covered map controls dismiss an actual upcoming ALPR warning before tapping the header', async () => {
    const runner = Object.create(Runner.prototype);
    runner.suite = legacy;
    const taps = [];
    runner.autoPlayCommand = async () => ({ home: true, work: true });
    runner.currentAppBounds = () => legacy.layouts.dashboard.appBounds;
    runner.currentMapCrop = () => ({ x: 200, y: 200, width: 400, height: 300 });
    runner.captureScreenshot = async () => ({
        ocr: '0.8 mi ahead\nALPR - on your route\nOK',
        textBounds: [{ text: 'OK', x: 252, y: 166 }],
    });
    runner.tapDhu = ({ x, y }) => taps.push({ x, y });
    runner.metroOutput = '';
    await runner.runStep({ type: 'tapControl', name: 'search' });
    assert.deepEqual(taps, [
        { x: 400, y: 350 },
        { x: 252, y: 166 },
        { x: 400, y: 350 },
        { x: 584, y: 48 },
    ]);
});

test('native result selection refreshes stale screenshots and waits for a fresh callback', async () => {
    const runner = Object.create(Runner.prototype);
    runner.screenshots = new Map([
        [
            'result',
            {
                capturedAt: 0,
                verifyLayout: false,
                textBounds: [{ text: 'Walmart', x: 100, y: 100 }],
            },
        ],
    ]);
    runner.metroOutput = 'older callback';
    runner.captureScreenshot = async (name, options) => {
        assert.equal(name, 'result');
        assert.equal(options.verifyLayout, false);
        return {
            textBounds: [{ text: 'Walmart Supercenter', x: 200, y: 300 }],
        };
    };
    runner.tapDhu = (target) => assert.equal(target.y, 300);
    runner.waitForMetroMarker = async (marker, offset) => {
        assert.equal(marker, '[Android Auto] search-result-selected');
        assert.equal(offset, 'older callback'.length);
    };
    await runner.tapOcrAction({
        screenshot: 'result',
        match: 'result',
        text: 'Walmart',
        waitForMetro: '[Android Auto] search-result-selected',
    });
});

test('Android native stop uses the trip estimate stop button and a post-tap host callback', async () => {
    const bounds = legacy.layouts.fullscreen.appBounds;
    assert.deepEqual(
        getAndroidAutoControlPoint(bounds, 'exit', { isNavigating: true }),
        { x: 144, y: 656 },
    );
    assert.throws(
        () =>
            getAndroidAutoControlPoint(bounds, 'exit', { isNavigating: false }),
        /Unavailable/,
    );
    const runner = Object.create(Runner.prototype);
    runner.suite = legacy;
    runner.captureScreenshot = async () => {};
    runner.carLayout = 'fullscreen';
    runner.metroOutput = 'old stop';
    runner.autoPlayCommand = async () => ({ isNavigating: true });
    runner.tapDhu = () => {};
    runner.waitForMetroMarker = async (marker, offset) => {
        assert.equal(marker, '[Android Auto] host-navigation-stopped');
        assert.equal(offset, 'old stop'.length);
    };
    await runner.runStep({
        type: 'tapControl',
        name: 'exit',
        waitForMetro: '[Android Auto] host-navigation-stopped',
    });
});

test('map choices cannot pass while the parent settings still shows Standard Satellite', () => {
    const layer = buildAndroidAutoNavigationSuite().find(({ name }) =>
        name.startsWith('Map Options: switches'),
    );
    const choices = layer.steps.find(
        ({ type, screenshot }) =>
            type === 'assertOcr' && screenshot === 'standard-choices',
    );
    const parent =
        "Map settings\nMap layer\nStandard Satellite\nMap's Time of Day\nAuto\nRain and snow effects";
    assert.notEqual(getOCRAssertionFailure(parent, choices), null);
    assert.equal(
        getOCRAssertionFailure(
            'Map layer\nStandard\nStandard Satellite',
            choices,
        ),
        null,
    );
});

test('stationary setup restores follow through the native control when a prior list gesture left the map panned', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'daf-aa-follow-'));
    try {
        const runner = Object.create(Runner.prototype);
        const events = [];
        runner.runDirectory = directory;
        runner.results = [];
        runner.metroOutput = '';
        runner.screenshots = new Map();
        runner.suite = {
            location: { latitude: 43, longitude: -88 },
            tests: [
                {
                    name: 'pan',
                    stationary: true,
                    layout: 'fullscreen',
                    steps: [{ type: 'pan-test' }],
                },
            ],
        };
        runner.report = () => {};
        runner.setEmulatorLocation = () => {};
        runner.sendDhu = () => {};
        runner.autoPlayCommand = async () => {};
        runner.assertAutoPlayState = async (expected) => {
            events.push(expected.trackingState || 'seed');
            return { trackingState: 'recenter' };
        };
        runner.setCarLayout = async () => events.push('layout');
        runner.runStep = async (step) => events.push(step.name || step.type);
        await runner.runSuite();
        assert.deepEqual(events, [
            'seed',
            'layout',
            'recenter',
            'active',
            'pan-test',
        ]);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
