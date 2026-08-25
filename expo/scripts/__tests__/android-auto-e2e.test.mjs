import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    builtInDisplayHasState,
    childProcessIsRunning,
    currentAutoPlayWakeLockIsHeld,
    DEFAULT_MAP_CROP,
    envFileHasNonEmptyValue,
    findNodeBounds,
    getMapCropPixelDifferenceAssertionFailure,
    findNodeByResourceId,
    getMapSurfaceVisibilityAssertionFailure,
    getMapThemeContrastAssertionFailure,
    getOCRAssertionFailure,
    MINIMUM_MAP_CROP_PIXEL_DIFFERENCE,
    MINIMUM_MAP_THEME_LUMINANCE_DIFFERENCE,
    MINIMUM_VISIBLE_MAP_CROP_LUMINANCE,
    normalizeOCRText,
    parseAdbForwardList,
    Runner,
    tcpDumpHasListeningPort,
} from '../android-auto-e2e.mjs';

describe('Android Auto E2E helpers', () => {
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

    test('uses applied map preset markers and crop contrast in idle and active guidance', () => {
        const suite = JSON.parse(
            readFileSync(
                new URL('../../.android-auto/suite.json', import.meta.url),
                'utf8',
            ),
        );
        const portraitSuite = JSON.parse(
            readFileSync(
                new URL(
                    '../../.android-auto/suite-portrait.json',
                    import.meta.url,
                ),
                'utf8',
            ),
        );
        const idleThemeTest = suite.tests.find(
            ({ name }) =>
                name === 'switches between day and night presentation',
        );
        const activeGuidanceTest = suite.tests.find(
            ({ name }) => name === 'renders active guidance map themes',
        );
        const navigationTest = suite.tests.find(({ name }) =>
            name.includes('private guidance'),
        );
        const mapViewToggleTest = suite.tests.find(({ name }) =>
            name.includes('3D follow'),
        );
        const phoneSleepTest = suite.tests.find(({ name }) =>
            name.includes('phone sleeps'),
        );
        const hostStopTest = suite.tests.find(({ name }) =>
            name.includes('host stop'),
        );

        assert.deepEqual(suite.display, { height: 720, width: 1280 });
        assert.deepEqual(portraitSuite.display, {
            height: 1080,
            width: 1920,
        });
        assert.deepEqual(portraitSuite.requiredMetroMarkers, [
            '[Auto Play] secondary-map-surface-mounted',
        ]);
        assert.equal(
            portraitSuite.dhuConfig,
            'config/android-auto-dhu-portrait.ini',
        );
        const portraitMapViewToggleTest = portraitSuite.tests.find(({ name }) =>
            name.includes('3D follow'),
        );
        assert.equal(
            portraitMapViewToggleTest.steps.filter(
                ({ type }) => type === 'assertMapCropsDiffer',
            ).length,
            2,
        );
        assert.deepEqual(
            portraitMapViewToggleTest.steps
                .filter(({ type }) => type === 'dhu')
                .map(({ command, waitForMetro }) => ({
                    command,
                    waitForMetro,
                })),
            [
                {
                    command: 'tap 600 500; sleep 1; tap 903 55',
                    waitForMetro: '[Auto Play] driving-route-overview-fitted',
                },
                {
                    command: 'tap 600 500; sleep 1; tap 903 55',
                    waitForMetro:
                        '[Auto Play] driving-map-view-perspective-restored',
                },
            ],
        );
        assert.deepEqual(
            navigationTest.steps.find(
                ({ screenshot, type }) =>
                    type === 'assertOcr' && screenshot === 'navigation-started',
            ).contains,
            ['Turn right to avoid', 'monitored intersections'],
        );
        assert.deepEqual(
            phoneSleepTest.steps.find(
                ({ screenshot, type }) =>
                    type === 'assertOcr' && screenshot === 'phone-asleep',
            ).contains,
            ['Arrive at your destination', 'Austin Central Library'],
        );
        assert.deepEqual(
            hostStopTest.steps.find(
                ({ screenshot, type }) =>
                    type === 'assertOcr' &&
                    screenshot === 'host-stopped-navigation',
            ).contains,
            ['SPEED', 'LIMIT', 'Congress Avenue'],
        );
        assert.deepEqual(
            mapViewToggleTest.steps
                .filter(
                    ({ command, type }) =>
                        type === 'dhu' && command.endsWith('tap 730 55'),
                )
                .map(({ waitForMetro }) => waitForMetro),
            [
                '[Auto Play] driving-route-overview-fitted',
                '[Auto Play] driving-map-view-perspective-restored',
            ],
        );
        assert.deepEqual(
            mapViewToggleTest.steps.find(
                ({ screenshot, type }) =>
                    type === 'assertOcr' &&
                    screenshot === 'map-view-route-overview',
            ),
            {
                contains: ['Arrive at your destin'],
                notContains: ['SPEED', 'LIMIT', 'Congress Avenue'],
                screenshot: 'map-view-route-overview',
                type: 'assertOcr',
            },
        );
        assert.equal(
            mapViewToggleTest.steps.filter(
                ({ type }) => type === 'assertMapCropsDiffer',
            ).length,
            2,
        );
        assert.ok(
            suite.tests.indexOf(mapViewToggleTest) <
                suite.tests.indexOf(activeGuidanceTest),
        );

        for (const themeTest of [idleThemeTest, activeGuidanceTest]) {
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
    test('crosses a global camera route-free and checks the phone Scorecard', () => {
        const suite = JSON.parse(
            readFileSync(
                new URL('../../.android-auto/suite.json', import.meta.url),
                'utf8',
            ),
        );
        const freeDriveTest = suite.tests.find(({ name }) =>
            name.includes('route-free crossing'),
        );
        const geoFixes = freeDriveTest.steps.filter(
            ({ type }) => type === 'geoFix',
        );
        const scenarioStep = freeDriveTest.steps.find(
            ({ type }) => type === 'scorecardDriveScenario',
        );
        const cameraInventoryStep = freeDriveTest.steps.find(
            ({ type }) => type === 'waitForScorecardCameraInventory',
        );
        const phoneAssertion = freeDriveTest.steps.find(
            ({ type }) => type === 'assertPhoneScorecardCrossings',
        );

        assert.equal(scenarioStep.scenario, 'automotive-free-exposure');
        assert.deepEqual(geoFixes, [
            {
                latitude: 30.266264,
                longitude: -97.7479,
                type: 'geoFix',
            },
            {
                latitude: 30.266264,
                longitude: -97.74735,
                type: 'geoFix',
            },
        ]);
        assert.ok(geoFixes[0].longitude < -97.747624);
        assert.ok(geoFixes[1].longitude > -97.747624);
        assert.equal(phoneAssertion.count, 1);
        assert.ok(
            freeDriveTest.steps.indexOf(scenarioStep) <
                freeDriveTest.steps.indexOf(geoFixes[0]),
        );
        assert.ok(
            freeDriveTest.steps.indexOf(geoFixes[0]) <
                freeDriveTest.steps.indexOf(cameraInventoryStep),
        );
        assert.ok(
            freeDriveTest.steps.indexOf(cameraInventoryStep) <
                freeDriveTest.steps.indexOf(geoFixes[1]),
        );
        assert.ok(
            freeDriveTest.steps.indexOf(geoFixes[1]) <
                freeDriveTest.steps.indexOf(phoneAssertion),
        );
        assert.equal(
            freeDriveTest.steps.some(({ type }) => type === 'sleep'),
            false,
        );
    });

    test('requires live guidance progress while the phone display is off', () => {
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
        const autoDriveIndex = stepIndex(({ type }) => type === 'autoDrive');
        const afterProgressIndex = stepIndex(
            ({ name, type }) =>
                type === 'screenshot' && name === 'phone-asleep',
        );
        const progressAssertionIndex = stepIndex(
            ({ first, second, type }) =>
                type === 'assertImagesDiffer' &&
                first === 'phone-asleep-before-progress' &&
                second === 'phone-asleep',
        );
        const phoneWakeIndex = stepIndex(({ type }) => type === 'phoneWake');
        const autoDriveStep = phoneSleepTest.steps[autoDriveIndex];

        assert.ok(phoneSleepIndex < beforeProgressIndex);
        assert.ok(beforeProgressIndex < autoDriveIndex);
        assert.ok(autoDriveIndex < afterProgressIndex);
        assert.ok(afterProgressIndex < progressAssertionIndex);
        assert.ok(progressAssertionIndex < phoneWakeIndex);
        assert.equal(
            autoDriveStep.waitForMetro,
            '[Android Auto] auto-drive-progressed',
        );
        assert.equal(autoDriveStep.timeout, 15000);
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

    test('ignores historical wake-lock events', () => {
        assert.equal(
            currentAutoPlayWakeLockIsHeld(
                "  PARTIAL_WAKE_LOCK 'AutoPlay:AndroidAutoSession' ACQ=-2m",
            ),
            true,
        );
        assert.equal(
            currentAutoPlayWakeLockIsHeld(
                '  08-05 20:56 - ACQ AutoPlay:AndroidAutoSession (partial)',
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

    test('requires the connected car service and rendered map', async () => {
        const markers = [];
        const runner = Object.create(Runner.prototype);
        runner.dhuProcess = { exitCode: null, signalCode: null };
        runner.dhuProcessError = null;
        runner.serviceRunning = () => true;
        runner.wakeLockHeld = () => true;
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
});
