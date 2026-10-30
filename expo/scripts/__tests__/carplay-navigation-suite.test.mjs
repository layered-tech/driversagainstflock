import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    CarPlayRunner,
    findCarPlaySearchResult,
    matchesCarPlayText,
} from '../carplay-e2e.mjs';
import {
    buildCarPlayNavigationSuite,
    carPlayStateMatches,
    getCarPlayIconPoint,
    getCarPlayKeyboardPoints,
    getCarPlayNavigationUIFailure,
} from '../carplay-navigation-suite.mjs';

test('primary-place taps wait for native acceptance and retry a lost input without submitting an accepted request twice', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'route-choices' });
    let taps = 0;
    runner.capture = () => ({ width: 1720, height: 1376, observations: [] });
    runner.displayInput = () => {
        taps++;
        if (taps === 2)
            runner.metroOutput += '[CarPlay] primary-location-selected';
    };
    runner.until = async (predicate) => {
        for (let attempt = 0; attempt < 4; attempt++)
            if (await predicate()) return;
        assert.fail('No native acceptance');
    };
    await runner.executeStep({
        type: 'tapIcon',
        name: 'home',
        waitForMetro: '[CarPlay] primary-location-selected',
    });
    assert.equal(taps, 2);
    for (const scenario of runner.suite)
        for (const step of scenario.steps)
            if (step.type === 'tapIcon' && ['home', 'work'].includes(step.name))
                assert.equal(
                    step.waitForMetro,
                    '[CarPlay] primary-location-selected',
                );
});

test('navigation panel taps require the opened panel and retry a missed header tap', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    let taps = 0;
    runner.capture = () => ({
        width: 1720,
        height: 1376,
        observations:
            taps < 2
                ? [
                      { text: 'Turn right', y: 309 },
                      { text: '10:45 arrival', y: 1261 },
                  ]
                : [{ text: 'Map layer' }, { text: "Map's Time of Day" }],
    });
    runner.carPlayState = { isNavigating: true, maneuverText: 'Turn right' };
    runner.displayInput = () => {
        taps++;
    };
    runner.until = async (predicate) => {
        for (let attempt = 0; attempt < 3; attempt++)
            if (await predicate()) return;
        assert.fail('The native panel did not open');
    };
    await runner.executeStep({
        type: 'tapIcon',
        name: 'options',
        expectText: ['Map layer', "Map's Time of Day"],
    });
    assert.equal(taps, 2);
});

test('map-screen Options taps verify the panel after a style change and retry a lost click', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    let taps = 0;
    runner.carPlayState = { isNavigating: false };
    runner.capture = () => ({
        width: 1720,
        height: 1376,
        observations:
            taps < 2
                ? [{ text: '1:14' }]
                : [{ text: 'Map layer' }, { text: "Map's Time of Day" }],
    });
    runner.displayInput = () => {
        taps++;
    };
    runner.until = async (predicate) => {
        for (let attempt = 0; attempt < 4; attempt++)
            if (await predicate()) return;
        assert.fail('Map Options did not open');
    };
    const scenario = buildCarPlayNavigationSuite().find(({ name }) =>
        name.includes('switches Standard and Satellite'),
    );
    const options = scenario.steps.filter(
        ({ type, name }) => type === 'tapIcon' && name === 'options',
    );
    assert.equal(options.length, 3);
    assert.ok(
        options.every(({ expectText }) => expectText.includes('Map layer')),
    );
    await runner.executeStep(options[0]);
    assert.equal(taps, 2);
});

test('guidance OCR tolerates the WI highway abbreviation glyph but still requires the correct road number', () => {
    const shot = {
        height: 1376,
        observations: [
            { text: 'Turn left onto State', y: 174 },
            { text: 'Highway 164, Wl 164', y: 227 },
            { text: '10:46 arrival', y: 1261 },
            { text: '23 min 13.5 mi', y: 1317 },
        ],
    };
    const maneuver = 'Turn left onto State Highway 164, WI 164';
    assert.equal(getCarPlayNavigationUIFailure(shot, maneuver), null);
    assert.match(
        getCarPlayNavigationUIFailure(
            {
                ...shot,
                observations: shot.observations.map((item) => ({
                    ...item,
                    text: item.text.replace('Wl 164', 'Wl 165'),
                })),
            },
            maneuver,
        ),
        /turn instruction/,
    );
});

test('map panning enters the native Pan interface and measures movement after it opens', () => {
    const steps = buildCarPlayNavigationSuite()[0].steps;
    const pan = steps.findIndex(
        ({ type, name }) => type === 'tapIcon' && name === 'pan',
    );
    const ready = steps.findIndex(
        ({ type, name }) => type === 'screenshot' && name === 'pan-mode-ready',
    );
    const drag = steps.findIndex(({ type }) => type === 'dragDisplay');
    const moved = steps.findIndex(({ type }) => type === 'assertMapMoved');
    const recenter = steps.findIndex(
        ({ type, name }) => type === 'tapIcon' && name === 'recenter',
    );
    assert.ok(pan >= 0 && ready > pan && drag > ready);
    assert.equal(steps[moved].before, 'pan-mode-ready');
    assert.ok(
        steps
            .slice(moved + 1, recenter)
            .some(({ type }) => type === 'hostBack'),
    );
    assert.deepEqual(
        getCarPlayIconPoint({ width: 1720, height: 1376 }, 'pan'),
        getCarPlayIconPoint({ width: 1720, height: 1376 }, 'recenter'),
    );
});

test('stationary cases cover controls, map appearance, Dashboard shortcuts, searches, and navigation startup', () => {
    const suite = buildCarPlayNavigationSuite();
    assert.equal(suite.length, 13);
    assert.ok(
        suite.every(({ stationary, drive }) => stationary && drive === null),
    );
    assert.ok(
        !suite
            .flatMap(({ steps }) => steps)
            .some(({ type }) =>
                [
                    'routeCheckpoint',
                    'replayRoute',
                    'resetLiveGpsDrive',
                ].includes(type),
            ),
    );
    for (const query of ['Walmart', 'Walmart Delafield']) {
        const voice = suite.find(
            ({ name }) =>
                name === `Voice search for ${query} opens route choices`,
        );
        assert.equal(
            voice.steps.find(({ type }) => type === 'armVoiceTranscript')
                .transcript,
            query,
        );
        assert.ok(
            voice.steps.some(
                ({ type, text }) =>
                    type === 'tapOcr' && text === 'Voice search',
            ),
        );
        assert.ok(
            voice.steps.some(
                ({ type, expected }) =>
                    type === 'assertCarPlayState' &&
                    expected.previewVisible === true,
            ),
        );
    }
    assert.ok(
        suite.at(-1).steps.some(({ type }) => type === 'armVoiceTranscript'),
        'startup must work independently of the preceding voice case',
    );
});

test('stationary-only execution never starts, waits for or clears a GPX drive', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'carplay-stationary-'));
    try {
        const runner = new CarPlayRunner({
            CARPLAY_E2E_SUITE: 'navigation',
            CARPLAY_E2E_ARTIFACTS_DIR: directory,
        });
        const commands = [];
        runner.prepare = async () =>
            mkdirSync(runner.directory, { recursive: true });
        runner.startDrive =
            runner.finishDrive =
            runner.resetDrive =
                async () =>
                    assert.fail(
                        'Stationary UI checks must not invoke the GPX driver',
                    );
        runner.carPlayCommand = async (command) => commands.push(command);
        runner.executeStep = async () => {};
        runner.cleanup = async () => {};
        runner.report = () => {};
        await runner.execute();
        assert.equal(runner.results.length, 13);
        assert.deepEqual(commands, ['seed', ...Array(13).fill('reset')]);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('Dashboard E2E cases use real shortcut taps and verify destination panels', () => {
    const suite = buildCarPlayNavigationSuite().filter(({ name }) =>
        name.startsWith('Dashboard:'),
    );
    assert.equal(suite.length, 3);
    for (const [scenario, label, panel] of [
        [suite[0], 'Search', 'Destinations'],
        [suite[1], 'Home', 'Home'],
        [suite[2], 'Work', 'Work'],
    ]) {
        const open = scenario.steps.findIndex(
            ({ type }) => type === 'openDashboard',
        );
        const tap = scenario.steps.findIndex(
            ({ type, text }) => type === 'tapOcr' && text === label,
        );
        assert.ok(open >= 0 && tap > open);
        assert.ok(
            scenario.steps
                .slice(tap + 1)
                .some(
                    ({ type, contains }) =>
                        type === 'assertOcr' && contains.includes(panel),
                ),
        );
        assert.ok(
            scenario.steps.some(
                ({ expected }) => expected?.isNavigating === false,
            ),
        );
    }
    const updates = suite[2].steps
        .filter(({ type }) => type === 'setPrimaryLocations')
        .map(({ locations }) => locations);
    assert.deepEqual(updates, ['both', 'work', 'none', 'work', 'both']);
    assert.ok(
        suite[1].steps.some(
            ({ type, contains, notContains }) =>
                type === 'assertOcr' &&
                contains.includes('Home') &&
                notContains.includes('Work'),
        ),
    );
});

test('opening Dashboard uses Home only when its shortcuts are not already visible', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    const dashboard = {
        height: 1376,
        observations: [{ text: 'Search', y: 1100 }],
    };
    const shots = [
        { height: 1376, observations: [{ text: 'Destinations', y: 65 }] },
        dashboard,
        dashboard,
    ];
    const commands = [];
    runner.capture = () => shots.shift();
    runner.run = (_, args) => commands.push(args);
    await runner.executeStep({ type: 'openDashboard' });
    await runner.executeStep({ type: 'openDashboard' });
    assert.deepEqual(commands, [['home']]);
});

test('Map Options selections confirm saved values, settings summaries and rendered map changes', () => {
    const suite = buildCarPlayNavigationSuite();
    const layer = suite.find(({ name }) =>
        name.startsWith('Map Options: switches'),
    );
    const light = suite.find(({ name }) =>
        name.startsWith('Map Options: changes'),
    );
    assert.ok(layer);
    assert.ok(light);
    assert.deepEqual(
        layer.steps
            .filter(
                ({ type, text }) =>
                    type === 'tapOcr' &&
                    ['Standard', 'Standard Satellite'].includes(text),
            )
            .map(({ text }) => text),
        ['Standard', 'Standard Satellite', 'Standard'],
    );
    for (const [scenario, field, values] of [
        [layer, 'mapLayer', ['standard', 'standard-satellite', 'standard']],
        [
            light,
            'mapLightPresetPreference',
            ['day', 'night', 'dawn', 'dusk', 'auto'],
        ],
    ]) {
        assert.deepEqual(
            scenario.steps
                .filter(
                    ({ type, expected }) =>
                        type === 'assertCarPlayState' && expected[field],
                )
                .map(({ expected }) => expected[field]),
            values,
        );
        assert.equal(
            scenario.steps.filter(
                ({ type, screenshot }) =>
                    type === 'assertOcr' && screenshot.endsWith('-summary'),
            ).length,
            values.length,
        );
        assert.ok(
            scenario.steps.some(
                ({ type }) => type === 'assertMapAppearanceChanged',
            ),
        );
    }
    assert.deepEqual(
        light.steps
            .filter(
                ({ type, expected }) =>
                    type === 'assertCarPlayState' &&
                    expected.appliedMapLightPreset,
            )
            .map(({ expected }) => expected.appliedMapLightPreset),
        ['day', 'night', 'dawn', 'dusk'],
    );
});

test('map appearance confirmation waits for a visible change in the map crop', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    runner.screenshots.set('before', {
        image: '/tmp/before.png',
        width: 1720,
        height: 1376,
    });
    let captures = 0;
    runner.capture = () => ({ image: `/tmp/after-${++captures}.png` });
    const differences = [0, 0.08];
    runner.run = (_, args) => {
        assert.equal(args[0], '--mean-pixel-difference');
        assert.equal(args[1], '/tmp/before.png');
        assert.equal(args.length, 7);
        return JSON.stringify(differences.shift());
    };
    runner.until = async (predicate) => {
        assert.equal(await predicate(), false);
        assert.equal(await predicate(), true);
    };
    await runner.executeStep({
        type: 'assertMapAppearanceChanged',
        before: 'before',
        after: 'after',
    });
    assert.equal(captures, 2);
});

test('native map state checks reject missing guidance, wrong lock mode and empty route choices', () => {
    assert.equal(
        carPlayStateMatches(
            { previewVisible: true, routeChoiceCount: 2 },
            { previewVisible: true, routeChoiceCount: { minimum: 1 } },
        ),
        true,
    );
    assert.equal(
        carPlayStateMatches(
            { routeChoiceCount: 0 },
            { routeChoiceCount: { minimum: 1 } },
        ),
        false,
    );
    assert.equal(
        carPlayStateMatches(
            { maneuverText: ' ' },
            { maneuverText: { nonempty: true } },
        ),
        false,
    );
    assert.equal(
        carPlayStateMatches(
            { trackingState: 'recenter' },
            { trackingState: 'active' },
        ),
        false,
    );
    assert.equal(
        carPlayStateMatches(
            { isNavigating: true, maneuverText: 'Turn right' },
            { isNavigating: true, maneuverText: { nonempty: true } },
        ),
        true,
    );
    assert.throws(
        () => new CarPlayRunner({ CARPLAY_E2E_SUITE: 'invalid' }),
        /must be all/,
    );
});

test('icon hit points follow captured display dimensions and avoid the system sidebar', () => {
    const shot = { width: 1720, height: 1376 };
    for (const name of [
        'search',
        'options',
        'home',
        'work',
        'overview',
        'exit',
        'steps',
        'recenter',
    ]) {
        const point = getCarPlayIconPoint(shot, name);
        assert.ok(point.x > 148 && point.x < shot.width);
        assert.ok(point.y > 0 && point.y < shot.height);
    }
    assert.throws(() => getCarPlayIconPoint(shot, 'missing'), /Unknown/);
});

test('navigation targets Cancel, Options, Overview and Steps in the new header slots', () => {
    const shot = { width: 1720, height: 1376 };
    for (const [name, position] of Object.entries({
        exit: 0.146,
        options: 0.245,
        overview: 0.846,
        steps: 0.946,
    })) {
        assert.equal(getCarPlayIconPoint(shot, name).x, shot.width * position);
    }
});

test('keyboard scenario checks native autocomplete before submitting into the package results list', () => {
    const scenario = buildCarPlayNavigationSuite().find(({ name }) =>
        name.startsWith('Keyboard search'),
    );
    const typing = scenario.steps.findIndex(
        ({ type }) => type === 'enterSearchText',
    );
    const submit = scenario.steps.findIndex(
        ({ type }) => type === 'submitSearch',
    );
    assert.equal(scenario.steps[typing].submit, false);
    assert.ok(
        scenario.steps
            .slice(typing + 1, submit)
            .some(
                ({ marker }) =>
                    marker === '[CarPlay] search-autocomplete-updated',
            ),
    );
    assert.ok(
        scenario.steps
            .slice(submit + 1)
            .some(({ contains }) => contains?.includes('Destination')),
    );
    assert.equal(
        getCarPlayKeyboardPoints({ width: 1720, height: 1376 }, 'Walmart', {
            submit: false,
        }).length,
        7,
    );
});

test('search pin assertions reject matches beyond the rendered list limit', () => {
    assert.equal(
        carPlayStateMatches({ pins: 6 }, { pins: { minimum: 1, maximum: 6 } }),
        true,
    );
    assert.equal(
        carPlayStateMatches({ pins: 20 }, { pins: { minimum: 1, maximum: 6 } }),
        false,
    );
});

test('icon taps capture geometry before revealing the header so screenshots cannot consume its timeout', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    const events = [];
    runner.carPlayState = { isNavigating: true, maneuverText: 'Turn right' };
    runner.displayInput = (command, points) => events.push({ command, points });
    runner.capture = () => {
        events.push('capture');
        return { width: 1720, height: 1376 };
    };
    await runner.executeStep({ type: 'tapIcon', name: 'exit' });
    assert.equal(events[0], 'capture');
    assert.deepEqual(events[1], { command: 'tap', points: [[0.65, 0.035]] });
    assert.equal(events[2].points[0][0], 0.146);
});

test('icon taps do not toggle an already visible navigation header away', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    runner.carPlayState = { isNavigating: true, maneuverText: 'Turn right' };
    runner.capture = () => ({
        width: 1720,
        height: 1376,
        observations: [{ text: 'Turn right', y: 309 }],
    });
    const taps = [];
    runner.displayInput = (_command, points) => taps.push(points);
    await runner.executeStep({ type: 'tapIcon', name: 'overview' });
    assert.equal(taps.length, 1);
    assert.equal(taps[0][0][0], 0.846);
    assert.ok(taps[0][0][1] > 0 && taps[0][0][1] < 0.1);
});

test('keyword input taps the native QWERTY keys and search key instead of injecting a search command', () => {
    const points = getCarPlayKeyboardPoints(
        { width: 1720, height: 1376 },
        'Walmart',
    );
    assert.equal(points.length, 8);
    assert.ok(Math.abs(points[0].x - 421) < 2);
    assert.ok(Math.abs(points[0].y - 929) < 2);
    assert.ok(Math.abs(points[1].x - 348) < 2);
    assert.ok(Math.abs(points.at(-1).x - 1514) < 2);
    assert.ok(
        points.every(({ x, y }) => x > 200 && x < 1650 && y > 850 && y < 1376),
    );
    assert.throws(
        () => getCarPlayKeyboardPoints({ width: 1720, height: 1376 }, '1'),
        /Unsupported/,
    );
    for (const step of buildCarPlayNavigationSuite()
        .flatMap(({ steps }) => steps)
        .filter(({ match }) => match === 'result')) {
        assert.equal(step.requireUserSelection, true);
        assert.equal(step.waitForMetro, '[CarPlay] search-result-selected');
    }
});

test('result selection reuses the current result row and ignores the map countdown destination', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    const shot = {
        width: 1720,
        height: 1376,
        capturedAt: Date.now(),
        observations: [
            { text: 'Walmart Supercenter', x: 1319, y: 289 },
            { text: 'Walmart', x: 500, y: 65 },
            { text: 'Walmart', x: 300, y: 330 },
        ],
    };
    assert.equal(findCarPlaySearchResult(shot, 'Walmart').x, 300);
    runner.screenshots.set('results', shot);
    runner.capture = () =>
        assert.fail(
            'A second screenshot can consume the single-result countdown',
        );
    runner.report = () => {};
    runner.run = (_, args) => {
        assert.deepEqual(args, ['tap', String(300 / 1720), String(330 / 1376)]);
        runner.metroOutput += '[CarPlay] search-result-selected';
        return '';
    };
    const step = {
        screenshot: 'results',
        text: 'Walmart',
        match: 'result',
        requireUserSelection: true,
        waitForMetro: '[CarPlay] search-result-selected',
    };
    await runner.tapText(step);
    runner.metroOutput += '[CarPlay] single-result-auto-advanced';
    await assert.rejects(runner.tapText(step), /auto-advanced/);
});

test('search assertions require the presented results list and reject loading text containing the query', () => {
    const scenario = buildCarPlayNavigationSuite().find(
        ({ name }) =>
            name === 'Voice search for Walmart Delafield opens route choices',
    );
    const index = scenario.steps.findIndex(
        ({ type, screenshot }) =>
            type === 'assertOcr' && screenshot === 'voice-results-1',
    );
    const step = scenario.steps[index];
    assert.equal(
        scenario.steps[index - 2].marker,
        '[Auto Play] search-results-fitted',
    );
    assert.equal(
        matchesCarPlayText([{ text: 'Searching for Walmart Delafield' }], step),
        false,
    );
    assert.equal(
        matchesCarPlayText(
            [{ text: 'Walmart Delafield' }, { text: 'Destination' }],
            step,
        ),
        false,
    );
    assert.equal(
        matchesCarPlayText(
            [
                { text: 'Search results' },
                { text: '1. Walmart Supercenter' },
                { text: 'Delafield, WI' },
            ],
            step,
        ),
        true,
    );
});

test('navigation UI needs the active turn and visible arrival, duration and distance estimates', () => {
    const observations = [
        { text: 'Turn right', y: 309 },
        { text: '10:06 arrival', y: 1261 },
        { text: '24 min 13.6 mi', y: 1317 },
    ];
    const shot = { height: 1376, observations };
    assert.equal(getCarPlayNavigationUIFailure(shot, 'Turn right'), null);
    assert.match(
        getCarPlayNavigationUIFailure(shot, 'Turn left'),
        /turn instruction/,
    );
    assert.match(
        getCarPlayNavigationUIFailure(
            {
                ...shot,
                observations: observations.filter(
                    ({ text }) => !text.includes('arrival'),
                ),
            },
            'Turn right',
        ),
        /arrival/,
    );
    assert.match(
        getCarPlayNavigationUIFailure(
            {
                ...shot,
                observations: [
                    ...observations.slice(0, 2),
                    { text: '13.6 mi', y: 1317 },
                ],
            },
            'Turn right',
        ),
        /duration/,
    );
    assert.match(
        getCarPlayNavigationUIFailure(
            {
                ...shot,
                observations: [
                    ...observations.slice(0, 2),
                    { text: '24 min', y: 1317 },
                ],
            },
            'Turn right',
        ),
        /distance/,
    );
});

test('result targeting accepts numbered map rows and excludes the map pins', () => {
    const shot = {
        width: 1720,
        height: 1376,
        observations: [
            { text: 'Walmart', x: 1300, y: 300 },
            { text: '1. Walmart', x: 320, y: 330 },
            { text: '2. Walmart Supercenter', x: 330, y: 570 },
        ],
    };
    assert.equal(findCarPlaySearchResult(shot, 'Walmart').y, 330);
    assert.equal(findCarPlaySearchResult(shot, 'Walmart', 1).y, 570);
});

test('navigation header detection accepts maneuver text wrapped across OCR lines', async () => {
    const runner = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'navigation' });
    runner.carPlayState = {
        isNavigating: true,
        maneuverText: 'Turn right onto Stonegate Court',
    };
    runner.capture = () => ({
        width: 1720,
        height: 1376,
        observations: [
            { text: 'Turn right onto', y: 309 },
            { text: 'Stonegate Court', y: 361 },
        ],
    });
    const taps = [];
    runner.displayInput = (_command, points) => taps.push(points);
    await runner.executeStep({ type: 'tapIcon', name: 'options' });
    assert.equal(taps.length, 1);
    assert.equal(taps[0][0][0], 0.245);
});
