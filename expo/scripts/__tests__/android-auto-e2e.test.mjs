import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    builtInDisplayHasState,
    childProcessIsRunning,
    DEFAULT_MAP_CROP,
    envFileHasNonEmptyValue,
    findNodeBounds,
    findNodeByResourceId,
    getConfirmationCameraStabilityAssertionFailure,
    getMapCropPixelDifferenceAssertionFailure,
    getMapSurfaceVisibilityAssertionFailure,
    getMapThemeContrastAssertionFailure,
    getOCRAssertionFailure,
    loadSuite,
    MINIMUM_MAP_CROP_PIXEL_DIFFERENCE,
    MINIMUM_MAP_THEME_LUMINANCE_DIFFERENCE,
    MINIMUM_VISIBLE_MAP_CROP_LUMINANCE,
    normalizeOCRText,
    parseAdbForwardList,
    Runner,
    tcpDumpHasListeningPort,
} from '../android-auto-e2e.mjs';

describe('Android Auto E2E helpers', () => {
    for (const reportsWereQueued of [false, true]) {
        test(`cleanup removes isolated report data only when this run queued reports (${reportsWereQueued})`, async () => {
            const runner = Object.create(Runner.prototype);
            const commands = [];
            runner.suite = { appId: 'test.app' };
            runner.preparedDevice = true;
            runner.startedApp = true;
            runner.metroOutput = reportsWereQueued
                ? '[E2E] presence-report-queued {"count":1}'
                : '';
            runner.adb = (args) => commands.push(args);
            runner.run = () => {};
            runner.report = () => {};
            runner.serviceRunning = () => false;
            runner.waitFor = async (predicate) =>
                assert.equal(await predicate(), true);
            for (const name of [
                'wakePhone',
                'stopDhu',
                'stopServer',
                'removeOwnedForward',
                'stopMetro',
            ])
                runner[name] = async () => {};
            await runner.cleanup();
            assert.equal(
                commands.filter((args) => args.includes('clear')).length,
                reportsWereQueued ? 1 : 0,
            );
            assert.deepEqual(commands[0], [
                'shell',
                'am',
                'force-stop',
                'test.app',
            ]);
            if (reportsWereQueued)
                assert.deepEqual(commands[1], [
                    'shell',
                    'pm',
                    'clear',
                    'test.app',
                ]);
        });
    }

    test('rejects camera flicker even when the final position has returned to the ALPR', () => {
        const stable = {
            samples: 20,
            offTargetSamples: 0,
            centerOffsetMeters: 0,
            maximumCenterOffsetMeters: 0,
            maximumZoomDelta: 0.25,
        };
        assert.equal(
            getConfirmationCameraStabilityAssertionFailure(stable),
            null,
        );
        assert.match(
            getConfirmationCameraStabilityAssertionFailure({
                ...stable,
                offTargetSamples: 1,
                maximumCenterOffsetMeters: 200,
            }),
            /moved away/,
        );
        assert.match(
            getConfirmationCameraStabilityAssertionFailure(null),
            /Missing/,
        );
        assert.match(
            getConfirmationCameraStabilityAssertionFailure({
                ...stable,
                samples: 0,
            }),
            /Missing/,
        );
    });

    test('confirmation stability also rejects DHU map frames that visibly switch views', () => {
        const runner = Object.create(Runner.prototype);
        runner.metroOutput =
            ' INFO  [E2E] presence-camera-released ' +
            JSON.stringify({
                samples: 20,
                offTargetSamples: 0,
                maximumCenterOffsetMeters: 0,
                maximumZoomDelta: 0.25,
            });
        runner.confirmationCameraFrames = ['a', 'b', 'c', 'd', 'e', 'f'];
        runner.report = () => {};
        runner.mapCropPixelDifference = () => 0.001;
        runner.assertConfirmationCameraStable('baseline');
        runner.mapCropPixelDifference = (_, name) =>
            name === 'c' ? 0.2 : 0.001;
        assert.throws(
            () => runner.assertConfirmationCameraStable('baseline'),
            /map moved/,
        );
        runner.confirmationCameraFrames = [];
        assert.throws(
            () => runner.assertConfirmationCameraStable('baseline'),
            /Missing continuous/,
        );
    });

    test('a displayed React Native error cannot pass a completed DHU suite', () => {
        const runner = Object.create(Runner.prototype);
        runner.metroOutput =
            " ERROR  Can't perform a React state update on a component that hasn't mounted yet.\n";
        runner.captureLogcat = () =>
            assert.fail('runtime error should fail first');
        assert.throws(
            () => runner.assertNoFatalCrash(),
            /React Native runtime error/,
        );
    });

    test('native action taps use current OCR bounds and require a new action callback', async () => {
        const runner = Object.create(Runner.prototype);
        const calls = [];
        runner.screenshots = new Map([
            ['confirmation', { imagePath: '/tmp/current-confirmation.png' }],
        ]);
        runner.ocrBinary = '/tmp/ocr';
        runner.metroOutput = 'old native action';
        runner.run = (binary, args) => {
            calls.push([binary, args]);
            return {
                stdout: JSON.stringify({ text: 'Not there', x: 257, y: 224 }),
            };
        };
        runner.sendDhu = (command) => calls.push(command);
        runner.waitForMetroMarker = async (...args) => calls.push(args);
        await runner.tapOcrAction({
            screenshot: 'confirmation',
            text: 'Not there',
            waitForMetro: '[E2E] presence:native-not-there-pressed',
            waitForPresentation: '[E2E] presence:native-thanks-presented',
        });
        assert.deepEqual(calls, [
            [
                '/tmp/ocr',
                ['--text-bounds', '/tmp/current-confirmation.png', 'Not there'],
            ],
            'tap 257 224',
            [
                '[E2E] presence:native-not-there-pressed',
                'old native action'.length,
                2000,
            ],
            [
                '[E2E] presence:native-thanks-presented',
                'old native action'.length,
                10000,
            ],
        ]);
    });

    test('native reports must be unique, negative and identify the actual mapped camera', () => {
        const runner = Object.create(Runner.prototype);
        runner.report = () => {};
        runner.metroOutput = '';
        runner.assertPresenceReports({ count: 0, osmNodeId: 12634608635 });
        const report = {
            count: 1,
            osmNodeId: 12634608635,
            response: 'not_there',
            platform: 'android_auto',
        };
        const log = (value) =>
            '[E2E] presence-report-queued ' + JSON.stringify(value) + '\n';
        runner.metroOutput = log(report);
        runner.assertPresenceReports({ count: 1, osmNodeId: 12634608635 });
        assert.throws(
            () =>
                runner.assertPresenceReports({
                    count: 0,
                    osmNodeId: 12634608635,
                }),
            /Unexpected/,
        );
        runner.metroOutput += log(report);
        assert.throws(
            () =>
                runner.assertPresenceReports({
                    count: 2,
                    osmNodeId: 12634608635,
                }),
            /Unexpected/,
        );
        for (const changes of [
            { osmNodeId: 'osm-node-135365' },
            { response: 'still_there' },
            { platform: 'carplay' },
        ]) {
            runner.metroOutput = log({ ...report, ...changes });
            assert.throws(
                () =>
                    runner.assertPresenceReports({
                        count: 1,
                        osmNodeId: 12634608635,
                    }),
                /Unexpected/,
            );
        }
    });

    test('short native banners use their configured OCR retry interval', async () => {
        const runner = Object.create(Runner.prototype);
        runner.screenshots = new Map([
            ['thanks', { imagePath: '/tmp/thanks.png', ocr: 'Thanks!' }],
        ]);
        let captures = 0;
        runner.captureScreenshot = async () => {
            captures += 1;
            return { imagePath: '/tmp/thanks.png', ocr: 'Thanks! Ok' };
        };
        const startedAt = Date.now();
        await runner.assertOcr('thanks', {
            contains: ['Thanks', 'Ok'],
            retryDelayMilliseconds: 0,
            timeout: 3000,
        });
        assert.equal(captures, 1);
        assert.ok(Date.now() - startedAt < 500);
    });

    test('every flow rejects the wrong host layout even if its map and puck remain visible', () => {
        const runner = Object.create(Runner.prototype);
        runner.screenshots = new Map([
            [
                'current',
                { ocr: 'SPEED LIMIT', layoutProof: { layout: 'dashboard' } },
            ],
        ]);
        runner.carLayout = 'dashboard';
        runner.assertScreenshotCarLayout('current');
        runner.carLayout = 'fullscreen';
        assert.throws(
            () => runner.assertScreenshotCarLayout('current'),
            /Expected fullscreen/,
        );
        runner.screenshots.set('current', {
            ocr: 'SPEED LIMIT',
            layoutProof: { layout: 'fullscreen' },
        });
        runner.assertScreenshotCarLayout('current');
        runner.carLayout = 'dashboard';
        assert.throws(
            () => runner.assertScreenshotCarLayout('current'),
            /Expected dashboard/,
        );
        runner.screenshots.set('current', {
            layoutProof: { layout: 'unknown' },
        });
        assert.throws(
            () => runner.assertScreenshotCarLayout('current'),
            /Expected dashboard/,
        );
    });

    for (const layout of ['dashboard', 'fullscreen']) {
        test(`recognizes ${layout} without other apps or media titles`, async () => {
            const runner = Object.create(Runner.prototype);
            runner.screenshots = new Map();
            runner.captureScreenshot = async (name) => {
                const screenshot = { ocr: '', layoutProof: { layout } };
                runner.screenshots.set(name, screenshot);
                return screenshot;
            };
            runner.sendDhu = () =>
                assert.fail('the requested host layout is already shown');
            runner.assertOcr = () =>
                assert.fail('host layout must not depend on app text');
            runner.ensureMapCropIsVisible = async () => {};
            runner.assertPuckIsVisible = async () => {};
            runner.report = () => {};
            await runner.setCarLayout(layout);
            assert.equal(runner.carLayout, layout);
        });

        test(`switches to ${layout} using host controls without media text`, async () => {
            const runner = Object.create(Runner.prototype);
            const commands = [];
            let currentLayout =
                layout === 'dashboard' ? 'fullscreen' : 'dashboard';
            runner.screenshots = new Map();
            runner.captureScreenshot = async (name) => {
                const screenshot = {
                    ocr: '',
                    layoutProof: { layout: currentLayout },
                };
                runner.screenshots.set(name, screenshot);
                return screenshot;
            };
            runner.sendDhu = (command) => {
                commands.push(command);
                currentLayout = layout;
            };
            runner.assertOcr = () =>
                assert.fail('host controls must not depend on media text');
            runner.ensureMapCropIsVisible = async () => {};
            runner.assertPuckIsVisible = async () => {};
            runner.report = () => {};
            await runner.setCarLayout(layout);
            assert.deepEqual(commands, [
                layout === 'dashboard' ? 'tap 40 675' : 'tap 40 260',
            ]);
            assert.equal(runner.carLayout, layout);
        });
    }

    test('portrait inherits all saved-road assertions and replaces only its display geometry', () => {
        const readSuite = (name) =>
            loadSuite(
                fileURLToPath(
                    new URL(`../../.android-auto/${name}`, import.meta.url),
                ),
            );
        const landscape = readSuite('suite.json');
        const portrait = readSuite('suite-portrait.json');
        assert.deepEqual(portrait.tests, landscape.tests);
        assert.equal(portrait.tests.length, 17);
        assert.equal(portrait.mapApiMocks, false);
        assert.deepEqual(portrait.location, landscape.location);
        assert.equal(
            portrait.dhuConfig,
            'config/android-auto-dhu-portrait.ini',
        );
        assert.deepEqual(portrait.touchOffset, { x: 439, y: 0 });
        assert.notDeepEqual(portrait.layouts, landscape.layouts);
    });

    test('portrait taps translate screenshot coordinates into the cropped touch display', async () => {
        const runner = Object.create(Runner.prototype);
        runner.suite = loadSuite(
            fileURLToPath(
                new URL(
                    '../../.android-auto/suite-portrait.json',
                    import.meta.url,
                ),
            ),
        );
        runner.carLayout = 'dashboard';
        const commands = [];
        runner.sendDhu = (command) => commands.push(command);
        runner.tapDhu({ x: 482, y: 1040 });
        runner.tapDhu({ x: 858, y: 1040 });
        runner.tapDhu({ x: 635, y: 123 });
        await runner.runStep({ type: 'tapMap' });
        assert.deepEqual(commands, [
            'tap 43 1040',
            'tap 419 1040',
            'tap 196 123',
            'tap 651 380',
        ]);
    });

    test('separates primary-only portrait and opt-in map cluster configurations', () => {
        const readConfig = (name) =>
            readFileSync(
                new URL(`../../config/${name}`, import.meta.url),
                'utf8',
            );
        const basic = readConfig('android-auto-dhu-portrait.ini');
        const maps = readConfig('android-auto-dhu-portrait-2.1.ini');

        assert.doesNotMatch(
            basic,
            /(?:instrumentcluster|navcluster|phonecluster)\s*=\s*true/,
        );
        assert.doesNotMatch(basic, /\[display:/);
        assert.match(maps, /\[display:cluster\]\ndisplaytype = cluster/);
        assert.match(
            maps,
            /resolution = 1280x720\ndpi = 160\nmarginheight = 220\ncropmargins = true/,
        );
        for (const config of [basic, maps]) {
            assert.match(
                config,
                /resolution = 1920x1080\ndpi = 160\nmarginwidth = 878\nnormalizedpi = true\ncropmargins = true/,
            );
        }
        for (const path of ['../../package.json', '../../../package.json']) {
            const { scripts } = JSON.parse(
                readFileSync(new URL(path, import.meta.url), 'utf8'),
            );
            assert.match(
                scripts['android:auto:portrait'],
                /android-auto\.sh 2\.0 portrait$/,
            );
            assert.match(
                scripts['android:auto:portrait:2.1'],
                /android-auto\.sh 2\.1 portrait$/,
            );
        }
    });

    test('finds semantic Android Auto menu nodes', () => {
        const xml = `
            <node text="" content-desc="More options" bounds="[1224,183][1344,327]" />
            <node text="Start head unit server" content-desc="" bounds="[804,675][1296,748]" />
        `;

        assert.deepEqual(findNodeBounds(xml, 'Start head unit server'), {
            bottom: 748,
            centerX: 1050,
            centerY: 712,
            left: 804,
            right: 1296,
            top: 675,
        });
        assert.equal(findNodeBounds(xml, 'Developer settings'), null);
    });

    test('finds the phone Scorecard value by React Native test ID', () => {
        const xml =
            '<node text="1" resource-id="com.anonymous.drivefree.dev:id/scorecard-stat-crossings" content-desc="" bounds="[0,0][10,10]" />';

        assert.equal(
            findNodeByResourceId(xml, 'scorecard-stat-crossings')?.text,
            '1',
        );
        assert.equal(findNodeByResourceId(xml, 'missing-scorecard-stat'), null);
    });

    test('normalizes OCR across host line wrapping', () => {
        assert.equal(
            normalizeOCRText('Turn right to avoid\nmonitored intersections'),
            'turn right to avoid monitored intersections',
        );
    });

    test('supports positive and negative OCR lifecycle assertions', () => {
        const ocr = 'Congress Avenue\nSPEED LIMIT';

        assert.equal(
            getOCRAssertionFailure(ocr, {
                contains: ['Congress Avenue'],
                notContains: ['Turn right'],
            }),
            null,
        );
        assert.equal(
            getOCRAssertionFailure(ocr, { contains: ['Search results'] }),
            'Missing "Search results"',
        );
        assert.equal(
            getOCRAssertionFailure(ocr, { notContains: ['speed limit'] }),
            'Unexpected "speed limit"',
        );
    });

    test('requires the day map crop to be visibly lighter than night', () => {
        assert.equal(getMapThemeContrastAssertionFailure(0.72, 0.51), null);
        assert.equal(getMapThemeContrastAssertionFailure(0.7, 0.55), null);
        assert.equal(
            getMapThemeContrastAssertionFailure(0.64, 0.5),
            'Expected day map crop to be at least 0.1500 lighter than night; received day=0.6400, night=0.5000, difference=0.1400',
        );
        assert.equal(
            getMapThemeContrastAssertionFailure(0.42, 0.58),
            'Expected day map crop to be at least 0.1500 lighter than night; received day=0.4200, night=0.5800, difference=-0.1600',
        );
        assert.equal(MINIMUM_MAP_THEME_LUMINANCE_DIFFERENCE, 0.15);
        assert.deepEqual(DEFAULT_MAP_CROP, {
            height: 220,
            width: 280,
            x: 430,
            y: 220,
        });
    });

    test('rejects empty map crops before comparing themes', () => {
        assert.equal(getMapSurfaceVisibilityAssertionFailure(0.08), null);
        assert.equal(
            getMapSurfaceVisibilityAssertionFailure(0),
            'Expected the map crop to be visible; received mean luminance=0.0000',
        );
        assert.equal(MINIMUM_VISIBLE_MAP_CROP_LUMINANCE, 0.01);
    });

    test('requires camera modes to materially change the map crop', () => {
        assert.equal(getMapCropPixelDifferenceAssertionFailure(0.08), null);
        assert.equal(
            getMapCropPixelDifferenceAssertionFailure(0.009),
            'Expected map crops to differ by at least 0.0100; received 0.0090',
        );
        assert.equal(MINIMUM_MAP_CROP_PIXEL_DIFFERENCE, 0.01);
    });

    test('analyzes the fixed map crop for directional day/night contrast', async () => {
        const analysisCalls = [];
        const reports = [];
        const runner = Object.create(Runner.prototype);
        runner.screenshots = new Map([
            ['day-mode', { imagePath: '/artifacts/day.png' }],
            ['night-mode', { imagePath: '/artifacts/night.png' }],
        ]);
        runner.run = (_command, args) => {
            analysisCalls.push(args);

            return {
                stdout: args[1].endsWith('day.png') ? '0.7219\n' : '0.5011\n',
            };
        };
        runner.ocrBinary = '/artifacts/android-auto-ocr';
        runner.report = (message) => reports.push(message);

        await runner.assertMapThemeContrast('day-mode', 'night-mode');

        assert.deepEqual(analysisCalls, [
            [
                '--mean-luminance',
                '/artifacts/day.png',
                '430',
                '220',
                '280',
                '220',
            ],
            [
                '--mean-luminance',
                '/artifacts/night.png',
                '430',
                '220',
                '280',
                '220',
            ],
        ]);
        assert.deepEqual(reports, [
            'Map theme contrast day-mode=0.7219 night-mode=0.5011 difference=0.2208',
        ]);
    });

    test('uses the suite map crop for both brightness and camera comparisons', () => {
        const calls = [];
        const runner = Object.create(Runner.prototype);
        runner.suite = { mapCrop: { x: 850, y: 300, width: 280, height: 220 } };
        runner.screenshots = new Map([
            ['before', { imagePath: '/before.png' }],
            ['after', { imagePath: '/after.png' }],
        ]);
        runner.run = (_command, args) => {
            calls.push(args);
            return { stdout: '0.25' };
        };
        runner.ocrBinary = '/ocr';
        assert.equal(runner.mapCropMeanLuminance('before'), 0.25);
        assert.equal(runner.mapCropPixelDifference('before', 'after'), 0.25);
        assert.deepEqual(calls, [
            ['--mean-luminance', '/before.png', '850', '300', '280', '220'],
            [
                '--mean-pixel-difference',
                '/before.png',
                '/after.png',
                '850',
                '300',
                '280',
                '220',
            ],
        ]);
    });

    test('recaptures the current theme until Mapbox visibly applies it', async () => {
        const captures = [];
        const reports = [];
        const runner = Object.create(Runner.prototype);
        let nightLuminance = 0.72;
        runner.mapCropMeanLuminance = (name) =>
            name === 'day-mode' ? 0.72 : nightLuminance;
        runner.captureScreenshot = async (name) => {
            captures.push(name);
            nightLuminance = 0.48;
        };
        runner.ensureMapCropIsVisible = async () => {};
        runner.report = (message) => reports.push(message);

        await runner.assertMapThemeContrast('day-mode', 'night-mode', {
            recapture: 'night-mode',
            retryDelayMilliseconds: 0,
        });

        assert.deepEqual(captures, ['night-mode']);
        assert.equal(reports.length, 2);
        assert.match(reports[0], /difference=0\.0000/);
        assert.match(reports[1], /difference=0\.2400/);
    });

    test('both display suites share applied theme markers and map contrast assertions', () => {
        const suite = JSON.parse(
            readFileSync(
                new URL('../../.android-auto/suite.json', import.meta.url),
                'utf8',
            ),
        );
        const portraitSuite = loadSuite(
            fileURLToPath(
                new URL(
                    '../../.android-auto/suite-portrait.json',
                    import.meta.url,
                ),
            ),
        );
        const idleThemeTest = suite.tests.find(
            ({ name }) =>
                name === 'switches between day and night presentation',
        );
        assert.deepEqual(suite.display, { height: 720, width: 1280 });
        assert.deepEqual(portraitSuite.display, {
            height: 1080,
            width: 1920,
        });
        assert.equal(portraitSuite.requiredMetroMarkers, undefined);
        assert.deepEqual(
            portraitSuite.tests[0].steps.find(
                ({ type }) => type === 'assertService',
            ),
            { type: 'assertService', running: true },
        );
        assert.equal(
            portraitSuite.tests
                .flatMap(({ steps }) => steps)
                .some(({ type }) => type === 'assertWakeLock'),
            false,
        );
        assert.equal(
            portraitSuite.dhuConfig,
            'config/android-auto-dhu-portrait.ini',
        );
        for (const themeTest of [idleThemeTest]) {
            assert.ok(themeTest);
            const themeCommands = themeTest.steps.filter(
                ({ command, type }) =>
                    type === 'dhu' && ['day', 'night'].includes(command),
            );
            assert.deepEqual(
                themeCommands.map(({ command }) => command),
                ['day', 'night', 'day'],
            );
            assert.deepEqual(
                themeCommands.map(({ waitForMetro }) => waitForMetro ?? null),
                [
                    null,
                    '[Android Auto] map-preset-night',
                    '[Android Auto] map-preset-day',
                ],
            );
            assert.equal(
                themeTest.steps.filter(
                    ({ type }) => type === 'assertMapThemeContrast',
                ).length,
                2,
            );
            const contrastSteps = themeTest.steps.filter(
                ({ type }) => type === 'assertMapThemeContrast',
            );
            assert.equal(contrastSteps[0].recapture, contrastSteps[0].night);
            assert.equal(contrastSteps[1].recapture, contrastSteps[1].day);
            assert.ok(
                themeTest.steps
                    .filter(
                        ({ name, type }) =>
                            type === 'screenshot' && /day|night/.test(name),
                    )
                    .every(({ requireVisibleMapCrop }) =>
                        Boolean(requireVisibleMapCrop),
                    ),
            );
        }
    });

    test('covers CHR-21 native presence actions and navigation guards', () => {
        const presenceSuite = JSON.parse(
            readFileSync(
                new URL(
                    '../../.android-auto/suite-presence.json',
                    import.meta.url,
                ),
                'utf8',
            ),
        );
        const reportTest = presenceSuite.tests.find(({ name }) =>
            name.includes('native negative action'),
        );
        const scenarioCommands = presenceSuite.tests.flatMap(({ steps }) =>
            steps
                .filter(
                    ({ requestType, type }) =>
                        type === 'deepLink' && requestType === 'presence',
                )
                .map(({ query }) => query),
        );

        assert.ok(reportTest);
        assert.deepEqual(
            reportTest.steps.find(({ type }) => type === 'dhu'),
            {
                type: 'dhu',
                command: 'tap 275 225',
                waitForMetro: '[ALPR presence] Report queued',
            },
        );
        assert.ok(scenarioCommands.includes('former-eligibility'));
        assert.ok(scenarioCommands.includes('navigation'));
        assert.ok(scenarioCommands.includes('navigation-near-maneuver'));
        assert.equal(
            scenarioCommands.filter((command) => command === 'reset').length,
            4,
        );

        const presenceScenarioSource = readFileSync(
            new URL(
                '../../components/map/alpr-presence-e2e.js',
                import.meta.url,
            ),
            'utf8',
        );

        assert.match(presenceScenarioSource, /\.resetLimits\(\)/);
        assert.match(presenceScenarioSource, /\[E2E\] presence-limits-reset/);
        assert.match(presenceScenarioSource, /\[E2E\] presence-reset-failed:/);
    });
    test('default command uses the saved road and removes synthetic location scenarios', () => {
        const suite = JSON.parse(
            readFileSync(
                new URL('../../.android-auto/suite.json', import.meta.url),
                'utf8',
            ),
        );
        const steps = suite.tests.flatMap(({ steps }) => steps);
        assert.equal(suite.mapApiMocks, false);
        assert.deepEqual(suite.location, {
            latitude: 43.12152,
            longitude: -88.24447,
        });
        for (const type of [
            'geoFix',
            'autoDrive',
            'scorecardDriveScenario',
            'deepLink',
            'assertPhoneScorecardCrossings',
        ]) {
            assert.equal(
                steps.some((step) => step.type === type),
                false,
                type,
            );
        }
        assert.equal(
            steps.filter((step) => step.type === 'replayRoute').length,
            20,
        );
        for (const layout of ['dashboard', 'fullscreen']) {
            const scenarios = suite.tests.filter(
                (scenario) => scenario.layout === layout,
            );
            const layoutSteps = scenarios.flatMap(({ steps }) => steps);
            assert.equal(scenarios.length, 8);
            assert.equal(
                layoutSteps.filter(({ type }) => type === 'assertPuckVisible')
                    .length,
                7,
            );
            assert.equal(
                layoutSteps.filter(
                    ({ type }) => type === 'assertConfirmationCameraStable',
                ).length,
                1,
            );
            for (const text of ['Dismiss', 'Not there', 'Ok']) {
                assert.equal(
                    layoutSteps.filter(
                        (step) => step.type === 'tapOcr' && step.text === text,
                    ).length,
                    1,
                    `${layout} ${text}`,
                );
            }
            const negativeAction = scenarios.find(({ steps }) =>
                steps.some(
                    (step) =>
                        step.type === 'tapOcr' && step.text === 'Not there',
                ),
            );
            assert.equal(
                negativeAction.steps.find(
                    (step) =>
                        step.type === 'tapOcr' && step.text === 'Not there',
                ).waitForPresentation,
                '[E2E] presence:native-thanks-presented',
            );
            const acknowledgement = negativeAction.steps.find(
                (step) =>
                    step.type === 'assertOcr' &&
                    step.contains.includes('Thanks'),
            );
            assert.equal(acknowledgement.retryDelayMilliseconds, 250);
            assert.equal(acknowledgement.timeout, 3000);
            assert.ok(
                negativeAction.steps.some(
                    (step) =>
                        step.type === 'assertOcr' &&
                        step.contains?.includes('Ok'),
                ),
            );
            assert.ok(
                negativeAction.steps.some(
                    (step) =>
                        step.type === 'assertOcr' &&
                        step.notContains?.includes('Thanks'),
                ),
            );
            assert.ok(
                negativeAction.steps.some(
                    (step) => step.type === 'assertPresenceReports',
                ),
            );
        }
        for (const path of ['../../package.json', '../../../package.json']) {
            const { scripts } = JSON.parse(
                readFileSync(new URL(path, import.meta.url), 'utf8'),
            );
            assert.match(scripts['e2e:android-auto'], /android-auto-e2e\.sh$/);
            assert.equal(scripts['e2e:android-auto:alpr-route'], undefined);
        }
        const launcher = readFileSync(
            new URL('../android-auto-e2e.sh', import.meta.url),
            'utf8',
        );
        assert.match(launcher, /\.android-auto\/suite\.json/);
    });

    test('requires saved-road GPS progress while the phone display is off', () => {
        const suite = JSON.parse(
            readFileSync(
                new URL('../../.android-auto/suite.json', import.meta.url),
                'utf8',
            ),
        );
        const phoneSleepTest = suite.tests.find(({ name }) =>
            name.includes('phone sleeps'),
        );

        assert.ok(phoneSleepTest);

        const stepIndex = (predicate) =>
            phoneSleepTest.steps.findIndex(predicate);
        const phoneSleepIndex = stepIndex(({ type }) => type === 'phoneSleep');
        const beforeProgressIndex = stepIndex(
            ({ name, type }) =>
                type === 'screenshot' &&
                name === 'phone-asleep-before-progress',
        );
        const replayIndex = stepIndex(({ type }) => type === 'replayRoute');
        const afterProgressIndex = stepIndex(
            ({ name, type }) =>
                type === 'screenshot' && name === 'phone-asleep',
        );
        const progressAssertionIndex = stepIndex(
            ({ first, second, type }) =>
                type === 'assertMapCropsDiffer' &&
                first === 'phone-asleep-before-progress' &&
                second === 'phone-asleep',
        );
        const phoneWakeIndex = stepIndex(({ type }) => type === 'phoneWake');
        const replayStep = phoneSleepTest.steps[replayIndex];

        assert.ok(phoneSleepIndex < beforeProgressIndex);
        assert.ok(beforeProgressIndex < replayIndex);
        assert.ok(replayIndex < afterProgressIndex);
        assert.ok(afterProgressIndex < progressAssertionIndex);
        assert.ok(progressAssertionIndex < phoneWakeIndex);
        assert.equal(replayStep.file, 'route-pewaukee.json');
        assert.equal(replayStep.fromMs, 108000);
        assert.equal(replayStep.toMs, 147000);
    });

    test('requires a non-empty Mapbox token without exposing its value', () => {
        assert.equal(
            envFileHasNonEmptyValue(
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.example-secret',
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
            ),
            true,
        );
        assert.equal(
            envFileHasNonEmptyValue(
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=""',
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
            ),
            false,
        );
        assert.equal(
            envFileHasNonEmptyValue(
                'EXPO_PUBLIC_OTHER=value',
                'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
            ),
            false,
        );
    });

    test('distinguishes running children from signal-terminated children', () => {
        assert.equal(
            childProcessIsRunning({ exitCode: null, signalCode: null }),
            true,
        );
        assert.equal(
            childProcessIsRunning({ exitCode: null, signalCode: 'SIGTERM' }),
            false,
        );
        assert.equal(
            childProcessIsRunning({ exitCode: 0, signalCode: null }),
            false,
        );
    });

    test('only recognizes a local TCP listener for the head-unit port', () => {
        const tcpDump = `
          sl  local_address rem_address   st tx_queue rx_queue
           0: 0000000000000000FFFF00000100007F:149D 0000000000000000FFFF00000100007F:CAFE 06 00000000:00000000
           1: 0000000000000000FFFF00000100007F:CAFE 0000000000000000FFFF00000100007F:149D 01 00000000:00000000
           2: 00000000000000000000000000000000:149D 00000000000000000000000000000000:0000 0A 00000000:00000000
        `;

        assert.equal(tcpDumpHasListeningPort(tcpDump, 5277), true);
        assert.equal(
            tcpDumpHasListeningPort(
                tcpDump.replace(
                    '00000000000000000000000000000000:149D',
                    '00000000000000000000000000000000:CAFE',
                ),
                5277,
            ),
            false,
        );
    });

    test('reads the physical phone display independently of car displays', () => {
        const displayDump = `
            DisplayDeviceInfo{"Built-in Screen": state OFF, committedState OFF, type INTERNAL}
            DisplayDeviceInfo{"GhostActivityDisplay": state ON, committedState ON, type VIRTUAL}
        `;

        assert.equal(builtInDisplayHasState(displayDump, 'OFF'), true);
        assert.equal(builtInDisplayHasState(displayDump, 'ON'), false);
    });

    test('parses ADB forwards so pre-existing ownership can be preserved', () => {
        assert.deepEqual(
            parseAdbForwardList(`
                emulator-5554 tcp:5277 tcp:5277
                emulator-5556 tcp:9876 localabstract:service
            `),
            [
                {
                    local: 'tcp:5277',
                    remote: 'tcp:5277',
                    serial: 'emulator-5554',
                },
                {
                    local: 'tcp:9876',
                    remote: 'localabstract:service',
                    serial: 'emulator-5556',
                },
            ],
        );
    });

    test('loads the app through the development-client URL before DHU connects', () => {
        const commands = [];
        const runner = Object.create(Runner.prototype);
        runner.metroOutput = 'existing output';
        runner.suite = {
            appId: 'com.example.dev',
            metro: { host: '10.0.2.2', port: 8091 },
        };
        runner.report = () => {};
        runner.adb = (args) => {
            commands.push(args);

            if (args.includes('force-stop')) {
                runner.metroOutput += ' stale shutdown output';
            }
        };

        const outputStart = runner.restartAppWithDevelopmentClient(1);

        assert.equal(outputStart, runner.metroOutput.length);
        assert.deepEqual(commands[0], [
            'shell',
            'am',
            'force-stop',
            'com.example.dev',
        ]);
        assert.deepEqual(commands[1], [
            'shell',
            'am',
            'start',
            '-W',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            'exp+driversagainstflock://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8091',
            'com.example.dev',
        ]);
        assert.equal(runner.startedApp, true);
    });

    test('does not retry a successful development-client launch', async () => {
        const attempts = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return 100;
        };
        runner.waitForDevelopmentClient = async () => {};

        assert.equal(await runner.launchApp(), 100);
        assert.deepEqual(attempts, [1]);
    });

    test('retries a failed development-client launch once', async () => {
        const attempts = [];
        const readinessChecks = [];
        const reports = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return attempt * 100;
        };
        runner.waitForDevelopmentClient = async (outputStart, timeout) => {
            readinessChecks.push({ outputStart, timeout });

            if (readinessChecks.length === 1) {
                throw new Error('car service won the startup race');
            }
        };
        runner.report = (message) => reports.push(message);
        runner.metroProcess = { exitCode: null, signalCode: null };

        assert.equal(await runner.launchApp(), 200);

        assert.deepEqual(attempts, [1, 2]);
        assert.deepEqual(readinessChecks, [
            { outputStart: 100, timeout: 45000 },
            { outputStart: 200, timeout: 120000 },
        ]);
        assert.match(reports[0], /attempt 1 failed; retrying/);
    });

    test('stops after two failed development-client launches and preserves both errors', async () => {
        const attempts = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return attempt;
        };
        runner.waitForDevelopmentClient = async () => {
            throw new Error(`failure ${attempts.length}`);
        };
        runner.report = () => {};
        runner.metroProcess = { exitCode: null, signalCode: null };

        await assert.rejects(
            runner.launchApp(),
            (error) =>
                error instanceof AggregateError &&
                error.errors.map((cause) => cause.message).join(',') ===
                    'failure 1,failure 2',
        );
        assert.deepEqual(attempts, [1, 2]);
    });

    test('does not retry when managed Metro has stopped', async () => {
        const attempts = [];
        const runner = Object.create(Runner.prototype);
        runner.restartAppWithDevelopmentClient = (attempt) => {
            attempts.push(attempt);
            return attempt;
        };
        runner.waitForDevelopmentClient = async () => {
            runner.metroProcess.exitCode = 1;
            throw new Error('Metro stopped');
        };
        runner.metroProcess = { exitCode: null, signalCode: null };

        await assert.rejects(runner.launchApp(), /Metro stopped/);
        assert.deepEqual(attempts, [1]);
    });

    test('fails the puck assertion when only the map is visible', async () => {
        const runner = Object.create(Runner.prototype);
        let captures = 0;
        runner.puckVisibilityProof = () => ({ visible: false });
        runner.captureScreenshot = async () => {
            captures += 1;
        };
        runner.waitFor = async (predicate, label, timeout) => {
            assert.equal(timeout, 20000);
            assert.equal(await predicate(), false);
            throw new Error(`Timed out waiting for ${label}`);
        };
        await assert.rejects(
            runner.assertPuckIsVisible('current-map'),
            /visible user puck in current-map/,
        );
        assert.equal(captures, 1);
    });

    test('accepts a visible puck without replacing its evidence screenshot', async () => {
        const runner = Object.create(Runner.prototype);
        runner.puckVisibilityProof = () => ({
            visible: true,
            bluePixels: 1094,
            outlinePixels: 331,
        });
        runner.captureScreenshot = async () =>
            assert.fail('unexpected recapture');
        runner.report = () => {};
        runner.waitFor = async (predicate) =>
            assert.equal(await predicate(), true);
        await runner.assertPuckIsVisible('current-map');
    });

    test('focuses the car map before waiting for its rendered-map marker', async () => {
        const runner = Object.create(Runner.prototype);
        const calls = [];
        for (const name of [
            'validate',
            'compileOCR',
            'stopExistingDhu',
            'startMetro',
            'prepareDevice',
            'wakePhone',
            'startServer',
            'launchApp',
            'startDhu',
            'focusCarMap',
            'waitForCarAppReady',
            'runSuite',
            'assertNoFatalCrash',
        ]) {
            runner[name] = () => calls.push(name);
        }
        await runner.execute();
        assert.ok(
            calls.indexOf('focusCarMap') < calls.indexOf('waitForCarAppReady'),
        );
        assert.ok(
            calls.indexOf('waitForCarAppReady') < calls.indexOf('runSuite'),
        );
    });

    test('requires the connected car service and rendered map', async () => {
        const markers = [];
        const runner = Object.create(Runner.prototype);
        runner.dhuProcess = { exitCode: null, signalCode: null };
        runner.dhuProcessError = null;
        runner.serviceRunning = () => true;
        runner.waitFor = async (predicate) =>
            assert.equal(await predicate(), true);
        runner.waitForMetroMarker = async (...args) => markers.push(args);
        runner.suite = {
            requiredMetroMarkers: ['[Auto Play] secondary-map-surface-mounted'],
        };

        await runner.waitForCarAppReady(321);

        assert.deepEqual(markers, [
            ['Running "AutoPlayRoot"', 321, 60000],
            ['[Android Auto] map-loaded', 321, 60000],
            ['[Auto Play] secondary-map-surface-mounted', 321, 60000],
        ]);
    });

    test('waits for the committed phone root rather than only bundle delivery', async () => {
        const runner = Object.create(Runner.prototype);
        const markers = [];
        runner.waitForMetroMarker = async (...args) => markers.push(args);
        await runner.waitForDevelopmentClient(123, 90000);
        assert.deepEqual(markers, [
            ['Android Bundled', 123, 90000],
            ['[E2E] phone-root-mounted', 123, 60000],
        ]);
    });
});
