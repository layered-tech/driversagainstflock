import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    collectMaestroFlows,
    createAndroidClearAppStateArgs,
    createAndroidCollapseStatusBarArgs,
    createAndroidDevClientLaunchArgs,
    createExpoDevClientUrl,
    createExpoStartArgs,
    createManagedMetroExitMessage,
    createMetroNodeOptions,
    MaestroTestRunner,
    parseAdbDevices,
    parseBootedIosSimulators,
    selectMaestroTarget,
    selectManagedMetroConnection,
    selectMetroPort,
} from '../maestro-test.mjs';

const EXPO_DIRECTORY = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
);
const AUTO_PLAY_PACKAGE_ROOT = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? path.resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : path.join(
          EXPO_DIRECTORY,
          'node_modules',
          '@iternio',
          'react-native-auto-play',
      );

describe('Maestro managed development server', () => {
    test('keeps screenshot paths inside the Maestro run artifact directory', () => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'maestro-artifacts-'),
        );
        const callsFile = path.join(directory, 'calls.json');
        writeFileSync(
            path.join(directory, 'maestro'),
            '#!/usr/bin/env node\n' +
                'require("node:fs").writeFileSync(process.env.MAESTRO_CALLS_FILE, JSON.stringify({ args: process.argv.slice(2), artifacts: process.env.MAESTRO_ARTIFACTS_DIR }));\n',
            { mode: 0o755 },
        );

        try {
            const debugDirectory = '/Volumes/PfeiferDev/maestro/debug';
            const runner = new MaestroTestRunner({
                environment: {
                    ...process.env,
                    PATH: `${directory}:${process.env.PATH}`,
                    MAESTRO_CALLS_FILE: callsFile,
                    MAESTRO_ARTIFACTS_DIR:
                        '/Volumes/PfeiferDev/maestro/screenshots',
                    MAESTRO_DEBUG_DIR: debugDirectory,
                },
            });
            runner.target = { platform: 'android', id: 'emulator-5554' };

            assert.equal(runner.runMaestroFlow('tour.yml'), 0);
            const call = JSON.parse(readFileSync(callsFile, 'utf8'));
            assert.equal(call.artifacts, '.');
            assert.equal(
                call.args[call.args.indexOf('--debug-output') + 1],
                debugDirectory,
            );
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    test('removes GPS mocks without restarting Play services or clearing data', () => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'maestro-location-reset-'),
        );
        const callsFile = path.join(directory, 'calls');
        writeFileSync(
            path.join(directory, 'adb'),
            '#!/bin/sh\nprintf "%s\\n" "$*" >> "$ADB_CALLS_FILE"\n',
            { mode: 0o755 },
        );
        try {
            for (const serial of ['emulator-5554', 'physical-device']) {
                writeFileSync(callsFile, '');
                const result = spawnSync(
                    'bash',
                    [
                        path.join(
                            EXPO_DIRECTORY,
                            'scripts/reset-android-location.sh',
                        ),
                    ],
                    {
                        env: {
                            ...process.env,
                            PATH: `${directory}:${process.env.PATH}`,
                            ANDROID_SERIAL: serial,
                            ADB_CALLS_FILE: callsFile,
                        },
                        encoding: 'utf8',
                    },
                );
                assert.equal(result.status, 0, result.stderr);
                const calls = readFileSync(callsFile, 'utf8');
                assert.doesNotMatch(calls, /pm clear|force-stop/);
                assert.match(calls, /remove-test-provider gps\n.*emu geo fix/);
            }
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
    test('can explicitly restart emulator Play services to recover stale fused fixes', () => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'maestro-location-reset-'),
        );
        const callsFile = path.join(directory, 'calls');
        writeFileSync(
            path.join(directory, 'adb'),
            '#!/bin/sh\nprintf "%s\\n" "$*" >> "$ADB_CALLS_FILE"\n',
            { mode: 0o755 },
        );

        try {
            const result = spawnSync(
                'bash',
                [
                    path.join(
                        EXPO_DIRECTORY,
                        'scripts/reset-android-location.sh',
                    ),
                ],
                {
                    env: {
                        ...process.env,
                        PATH: `${directory}:${process.env.PATH}`,
                        ANDROID_SERIAL: 'emulator-5554',
                        ANDROID_E2E_RESTART_PLAY_SERVICES: '1',
                        ADB_CALLS_FILE: callsFile,
                    },
                    encoding: 'utf8',
                },
            );
            assert.equal(result.status, 0, result.stderr);
            const calls = readFileSync(callsFile, 'utf8');
            assert.doesNotMatch(calls, /pm clear/);
            assert.match(
                calls,
                /remove-test-provider gps\n.*force-stop com.google.android.gms\n.*emu geo fix/,
            );
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    test('parses only connected Android devices', () => {
        assert.deepEqual(
            parseAdbDevices(`List of devices attached
emulator-5554 device product:sdk_gphone model:sdk_gphone
R58M offline
192.168.0.5:5555 unauthorized
`),
            [
                {
                    id: 'emulator-5554',
                    name: 'emulator-5554',
                    platform: 'android',
                },
            ],
        );
    });

    test('parses only booted iOS simulators', () => {
        assert.deepEqual(
            parseBootedIosSimulators(
                JSON.stringify({
                    devices: {
                        'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
                            {
                                isAvailable: true,
                                name: 'iPhone 17 Pro',
                                state: 'Booted',
                                udid: 'IOS-BOOTED',
                            },
                            {
                                isAvailable: true,
                                name: 'iPhone 16',
                                state: 'Shutdown',
                                udid: 'IOS-SHUTDOWN',
                            },
                        ],
                        'com.apple.CoreSimulator.SimRuntime.watchOS-26-0': [
                            {
                                isAvailable: true,
                                name: 'Apple Watch',
                                state: 'Booted',
                                udid: 'WATCH-BOOTED',
                            },
                        ],
                    },
                }),
            ),
            [
                {
                    id: 'IOS-BOOTED',
                    name: 'iPhone 17 Pro',
                    platform: 'ios',
                },
            ],
        );
    });

    test('requires a platform when both platforms are booted', () => {
        assert.throws(
            () =>
                selectMaestroTarget({
                    androidDevices: [
                        {
                            id: 'emulator-5554',
                            name: 'emulator-5554',
                            platform: 'android',
                        },
                    ],
                    iosDevices: [
                        {
                            id: 'IOS-BOOTED',
                            name: 'iPhone 17 Pro',
                            platform: 'ios',
                        },
                    ],
                }),
            /npm run e2e:android or npm run e2e:ios/,
        );
    });

    test('selects the requested platform and device deterministically', () => {
        assert.deepEqual(
            selectMaestroTarget({
                androidDevices: [],
                iosDevices: [
                    {
                        id: 'IOS-ONE',
                        name: 'iPhone 17',
                        platform: 'ios',
                    },
                    {
                        id: 'IOS-TWO',
                        name: 'iPhone 17 Pro',
                        platform: 'ios',
                    },
                ],
                requestedDevice: 'IOS-TWO',
                requestedPlatform: 'ios',
            }),
            {
                id: 'IOS-TWO',
                name: 'iPhone 17 Pro',
                platform: 'ios',
            },
        );
    });

    test('builds exact platform-reachable Expo development client URLs', () => {
        assert.equal(
            createExpoDevClientUrl({
                host: '10.0.2.2',
                port: 8081,
                scheme: 'exp+driversagainstflock',
            }),
            'exp+driversagainstflock://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081%3FdisableOnboarding%3D1',
        );
        assert.equal(
            createExpoDevClientUrl({
                host: '127.0.0.1',
                port: 8082,
                scheme: 'exp+driversagainstflock',
            }),
            'exp+driversagainstflock://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082%3FdisableOnboarding%3D1',
        );
    });

    test('uses IPv4 localhost for iOS Metro and its URL', () => {
        const connection = selectManagedMetroConnection({ platform: 'ios' });

        assert.deepEqual(connection, {
            host: '127.0.0.1',
            hostType: 'localhost',
            requiresAdbReverse: false,
        });
        assert.match(
            createExpoDevClientUrl({
                host: connection.host,
                port: 8081,
                scheme: 'exp+driversagainstflock',
            }),
            /url=http%3A%2F%2F127\.0\.0\.1%3A8081/,
        );
        assert.equal(
            createMetroNodeOptions(
                '--max-old-space-size=4096 --dns-result-order=verbatim',
                connection.hostType,
            ),
            '--max-old-space-size=4096 --dns-result-order=ipv4first',
        );
        assert.deepEqual(
            createExpoStartArgs({
                hostType: connection.hostType,
                port: 8081,
                scheme: 'exp+driversagainstflock',
            }),
            [
                'start',
                '--dev-client',
                '--host',
                'localhost',
                '--scheme',
                'exp+driversagainstflock',
                '--port',
                '8081',
            ],
        );
    });

    test('uses LAN hosting for the Android emulator alias', () => {
        assert.deepEqual(
            selectManagedMetroConnection({
                androidEmulator: true,
                platform: 'android',
            }),
            {
                host: '10.0.2.2',
                hostType: 'lan',
                requiresAdbReverse: false,
            },
        );
    });

    test('launches Android without the Expo 57 category crash', () => {
        const args = createAndroidDevClientLaunchArgs({
            appId: 'com.anonymous.drivefree.dev',
            url: 'exp+driversagainstflock://expo-development-client/?url=managed',
        });

        assert.deepEqual(args, [
            'shell',
            'am',
            'start',
            '-W',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            'exp+driversagainstflock://expo-development-client/?url=managed',
            'com.anonymous.drivefree.dev',
        ]);
        assert.doesNotMatch(args.join(' '), /android\.intent\.category/);
    });

    test('clears persisted Android tasks before development-client bootstrap', () => {
        assert.deepEqual(
            createAndroidClearAppStateArgs('com.anonymous.drivefree.dev'),
            ['shell', 'pm', 'clear', 'com.anonymous.drivefree.dev'],
        );
    });

    test('grants local network access after clearing Android app state', () => {
        const runner = new MaestroTestRunner({ environment: {} });
        runner.target = { platform: 'android', id: 'emulator-5554' };
        runner.report = () => {};
        const commands = [];
        runner.adb = (args, options) => commands.push({ args, options });

        runner.clearAppStateForBootstrap();

        assert.deepEqual(commands, [
            {
                args: ['shell', 'pm', 'clear', runner.appId],
                options: undefined,
            },
            {
                args: [
                    'shell',
                    'pm',
                    'grant',
                    runner.appId,
                    'android.permission.ACCESS_LOCAL_NETWORK',
                ],
                options: { allowFailure: true },
            },
        ]);
    });

    test('collapses Android system UI before every flow attempt', () => {
        assert.deepEqual(createAndroidCollapseStatusBarArgs(), [
            'shell',
            'cmd',
            'statusbar',
            'collapse',
        ]);
    });

    test('rejects an invalid requested Metro port', async () => {
        await assert.rejects(() => selectMetroPort('not-a-port'), /Invalid/);
    });

    test('collects the full suite without launcher UI readiness checks', () => {
        const flows = collectMaestroFlows(['.maestro'], EXPO_DIRECTORY);

        assert.equal(flows.length, 33);
        assert.ok(
            !flows.some((flow) => flow.endsWith('road-corridor-sussex.yml')),
            'The live API corridor flow requires its dedicated Metro environment',
        );
        assert.equal(
            collectMaestroFlows(
                ['.maestro/live-api/road-corridor-sussex.yml'],
                EXPO_DIRECTORY,
            ).length,
            1,
        );
        assert.deepEqual(
            flows.map((flow) => path.basename(flow)),
            [...flows.map((flow) => path.basename(flow))].sort(),
        );

        for (const flow of flows) {
            const source = readFileSync(flow, 'utf8');
            assert.doesNotMatch(source, /New development server/);
            assert.doesNotMatch(source, /Enter URL manually/);

            if (!/\bclearState:\s*true\b/.test(source)) {
                assert.doesNotMatch(source, /MAESTRO_EXPO_DEV_CLIENT_URL/);
            }
        }
    });

    test('reopens the exact server after clear-state launcher startup', () => {
        const clearStateFlows = [
            'subflows/contribute-tour-setup.yml',
            'driving-alerts.yml',
            'map-layer-options.yml',
            'map-settings-first-open-driving.yml',
            'marker-osm-details-toggle.yml',
            'osm-changeset.yml',
            'scorecard-gamification.yml',
            'scorecard.yml',
            'speed-limit-badge.yml',
        ];

        for (const flow of clearStateFlows) {
            assert.match(
                readFileSync(
                    path.join(EXPO_DIRECTORY, '.maestro', flow),
                    'utf8',
                ),
                /file: (?:subflows\/)?open-expo-dev-client-after-clear\.yml/,
            );
        }

        const subflow = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                '.maestro',
                'subflows',
                'open-expo-dev-client-after-clear.yml',
            ),
            'utf8',
        );
        assert.equal(
            subflow.match(/openLink: \$\{MAESTRO_EXPO_DEV_CLIENT_URL\}/g)
                ?.length,
            2,
        );
        assert.match(
            subflow,
            /Development Build\|Enter URL manually\|New development server/,
        );
        assert.match(
            subflow,
            /runFlow:\s+when:\s+visible: '[^']*Development Build[^']*'\s+commands:\s+- openLink: \$\{MAESTRO_EXPO_DEV_CLIENT_URL\}/,
        );
    });

    test('collects both new tour suites and the combined tour suite without their helpers', () => {
        const { scripts } = JSON.parse(
            readFileSync(path.join(EXPO_DIRECTORY, 'package.json'), 'utf8'),
        );
        const suites = {
            'e2e:map-options-tour': [
                'map-options-tour.yml',
                'map-options-tour-skip.yml',
            ],
            'e2e:scorecard-tour': [
                'scorecard-tour.yml',
                'scorecard-tour-skip.yml',
            ],
            'e2e:user-tours': [
                'contribute-wizard.yml',
                'contribute-signed-out.yml',
                'contribute-tour-skip.yml',
                'contribute-tour-resume.yml',
                'contribute-tour-reset.yml',
                'map-options-tour.yml',
                'map-options-tour-skip.yml',
                'scorecard-tour.yml',
                'scorecard-tour-skip.yml',
            ],
        };
        for (const [script, expected] of Object.entries(suites)) {
            const [runner, ...targets] = scripts[script].split(' ');
            assert.equal(runner, './scripts/maestro-test.sh');
            assert.deepEqual(
                collectMaestroFlows(targets, EXPO_DIRECTORY).map((flow) =>
                    path.basename(flow),
                ),
                expected,
            );
        }
    });

    test('collects the contribution tour suite without running its helpers as tests', () => {
        const { scripts } = JSON.parse(
            readFileSync(path.join(EXPO_DIRECTORY, 'package.json'), 'utf8'),
        );
        const [runner, ...targets] = scripts['e2e:contribute-tour'].split(' ');

        assert.equal(runner, './scripts/maestro-test.sh');
        assert.deepEqual(
            collectMaestroFlows(targets, EXPO_DIRECTORY).map((flow) =>
                path.basename(flow),
            ),
            [
                'contribute-wizard.yml',
                'contribute-signed-out.yml',
                'contribute-tour-skip.yml',
                'contribute-tour-resume.yml',
                'contribute-tour-reset.yml',
            ],
        );
    });

    test('scrolls map layer cards fully into view before selecting them', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'map-layer-options.yml'),
            'utf8',
        );

        for (const layer of ['standard-satellite', 'standard']) {
            assert.ok(
                source.includes(
                    `- scrollUntilVisible:\n    element:\n      id: 'map-layer-option-${layer}'\n    direction: DOWN\n    centerElement: true\n    timeout: 20000\n    waitToSettleTimeoutMs: 500\n- tapOn:\n    id: 'map-layer-option-${layer}'`,
                ),
                `${layer} must be fully visible before tapping`,
            );
        }
    });

    test('centers the compass drag handle when returning from direction controls', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'node-location-editor.yml'),
            'utf8',
        );

        assert.equal(
            source.match(
                /scrollUntilVisible:\s+element:\s+id: 'contribute-direction-dial-heading-handle'\s+direction: UP\s+timeout: 10000\s+visibilityPercentage: 100\s+centerElement: true/g,
            )?.length,
            2,
        );
    });

    test('waits for placement and marker details before removing a camera', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'node-removal.yml'),
            'utf8',
        );

        assert.match(
            source,
            /id: 'contribute-start-editing-button'[\s\S]*?extendedWaitUntil:\s+visible:\s+id: 'contribute-placement-sheet'\s+timeout: 10000[\s\S]*?id: 'map-marker-0-map'[\s\S]*?extendedWaitUntil:\s+visible:\s+id: 'editing-camera-details'\s+timeout: 10000[\s\S]*?id: 'marker-details-delete-node-button'/,
        );
        assert.ok(source.includes("id: 'remove-camera-title'"));
        assert.ok(
            source.includes("maestro.copiedText == 'Delete this camera?'"),
        );
    });

    test('restores browsing after the first driving settings presentation', () => {
        const source = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                '.maestro',
                'map-settings-first-open-driving.yml',
            ),
            'utf8',
        );

        assert.match(
            source,
            /id: 'map-layer-option-standard'[\s\S]*?notVisible:\s+id: 'map-settings-sheet'[\s\S]*?id: 'exit-free-drive-button'[\s\S]*?visible:\s+id: 'map-search-input-map'\s+timeout: 10000\s*$/,
        );
        assert.match(
            source,
            /file: subflows\/open-expo-dev-client-after-clear\.yml\s+- runFlow: subflows\/dismiss-first-launch-support\.yml\s+- runFlow:\s+when:\s+visible:\s+id: 'exit-free-drive-button'\s+commands:\s+- tapOn:\s+id: 'exit-free-drive-button'[\s\S]*?- extendedWaitUntil:\s+visible:\s+id: 'map-search-input-map'/,
        );
    });

    test('restores the scorecard top before reading recap-updated totals', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'scorecard-gamification.yml'),
            'utf8',
        );

        assert.match(
            source,
            /id: 'drawer-scorecard-button'[\s\S]*?id: 'scorecard-dashboard'[\s\S]*?- scrollUntilVisible:\s+element:\s+id: 'scorecard-privacy-score'\s+direction: UP\s+timeout: 10000\s+- copyTextFrom:\s+id: 'scorecard-privacy-score'/,
        );
    });

    test('keeps confirmed-read assertions on scorecard surfaces', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'scorecard.yml'),
            'utf8',
        );

        assert.doesNotMatch(source, /- assertVisible: '2 reads'/);
        assert.match(source, /id: 'scorecard-event-read-e2e-confirmed-east'/);
        assert.match(source, /id: 'scorecard-event-read-e2e-confirmed-west'/);
        assert.equal(
            source.match(/text: 'Go back'\s+retryTapIfNoChange: false/g)
                ?.length,
            2,
        );
        assert.match(
            source,
            /id: 'scorecard-tracking-toggle'\s+checked: true\s+- scrollUntilVisible:\s+element:\s+id: 'scorecard-delete-history'\s+direction: DOWN\s+timeout: 10000\s+- tapOn:\s+id: 'scorecard-delete-history'/,
        );
    });

    test('uses upstream speech recognition permissions without native patches', () => {
        const voiceSearchSource = readFileSync(
            path.join(EXPO_DIRECTORY, 'components/map/use-voice-search.js'),
            'utf8',
        );
        const speechModuleSource = readFileSync(
            path.join(EXPO_DIRECTORY, 'components/map/speech-recognition.js'),
            'utf8',
        );
        assert.match(
            speechModuleSource,
            /require\("expo-speech-recognition"\)\.ExpoSpeechRecognitionModule/,
        );
        assert.match(voiceSearchSource, /\.requestPermissionsAsync\(\)/);
        assert.match(voiceSearchSource, /speechRecognition\.start\(/);
        const directory = path.join(EXPO_DIRECTORY, 'patches');
        const patches = existsSync(directory) ? readdirSync(directory) : [];
        assert.equal(
            patches.some((name) => name.startsWith('expo-speech-recognition+')),
            false,
        );
    });

    test('exposes scorecard lifecycle readiness only in the E2E probe', () => {
        const source = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                'components',
                'scorecard',
                'scorecard-e2e-probe.js',
            ),
            'utf8',
        );

        assert.match(source, /APP_ENVIRONMENT !== 'e2e'/);
        assert.match(source, /testID="e2e-scorecard-hydrated"/);
        assert.match(source, /testID="e2e-scorecard-guided-active"/);
        assert.doesNotMatch(
            source,
            /testID="e2e-scorecard-camera-inventory-ready"/,
        );
        assert.match(source, /testID="e2e-scorecard-state-revision"/);
        assert.match(source, /testID="e2e-scorecard-persisted-revision"/);
        assert.match(source, /testID="e2e-scorecard-storage-synced"/);
        assert.match(source, /persistedRevision === stateRevision/);
    });

    test('drives onto the mocked speed-limit segment after navigation starts', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'speed-limit-badge.yml'),
            'utf8',
        );

        assert.match(
            source,
            /id: 'directions-route-start-driving-button'[\s\S]*?notVisible:\s+id: 'directions-route-sheet-presented'[\s\S]*?visible: 'expo-foreground-location-watch'[\s\S]*?- travel:\s+points:\s+- '43\.12152, -88\.24447'\s+- '43\.12116, -88\.244495'\s+speed: 12[\s\S]*?visible: 'e2e-pewaukee:0:forward'[\s\S]*?id: 'driving-speed-limit-sign'/,
        );
    });

    test('bounds the marker OSM details toggle waits', () => {
        const source = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                '.maestro',
                'marker-osm-details-toggle.yml',
            ),
            'utf8',
        );

        assert.match(
            source,
            /notVisible:\s+id: 'marker-details-sheet-presented'\s+timeout: 1000/,
        );
        assert.match(
            source,
            /id: 'map-marker-0-map'\s+waitToSettleTimeoutMs: 1000/,
        );
    });

    test('waits for the map after dismissing place details', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'place-details-drag.yml'),
            'utf8',
        );

        assert.equal(source.match(/start: '50%,83%'/g)?.length, 2);
        assert.doesNotMatch(source, /start: '50%,77%'/);

        assert.match(
            source,
            /notVisible:\s+id: 'selected-place-sheet-presented'\s+timeout: 10000\s+- extendedWaitUntil:\s+visible:\s+id: 'map-search-input-map'\s+timeout: 30000/,
        );
    });

    test('bounds map layer option taps on the continuously rendering map', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'map-layer-options.yml'),
            'utf8',
        );

        const tapCount = source.match(/- tapOn:/g)?.length;

        assert.equal(tapCount, 21);
        assert.equal(
            source.match(/retryTapIfNoChange: false/g)?.length,
            tapCount,
        );
        assert.equal(
            source.match(/waitToSettleTimeoutMs: 0/g)?.length,
            tapCount + 3,
        );
        assert.equal(source.match(/- swipe:/g)?.length, 3);
        assert.equal(source.match(/timeout: 1000(?:\s|$)/g)?.length, 3);
        assert.doesNotMatch(source, /- assertNotVisible:/);
    });
});

describe('Managed Metro crash reporting', () => {
    test('names the flow, the Metro log, and the log tail', () => {
        const message = createManagedMetroExitMessage({
            flowName: '.maestro/node-location-editor.yml',
            logTail:
                "TypeError: Cannot read properties of undefined (reading 'addedFiles')",
            metroLog: '/builds/maestro/metro-android.log',
        });

        assert.match(
            message,
            /Managed Metro exited while running \.maestro\/node-location-editor\.yml/,
        );
        assert.match(message, /launcher screen/);
        assert.match(
            message,
            /Metro log: \/builds\/maestro\/metro-android\.log/,
        );
        assert.match(message, /addedFiles/);
    });

    test('omits an empty log tail', () => {
        const message = createManagedMetroExitMessage({
            flowName: 'flow.yml',
            logTail: '',
            metroLog: '/builds/metro.log',
        });

        assert.equal(message.split('\n').length, 2);
    });
});

for (const flow of [
    'map-layer-options.yml',
    'map-settings-first-open-driving.yml',
]) {
    test(`${flow} dismisses first-run guidance before asserting the underlying settings sheet`, () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', flow),
            'utf8',
        );
        const skipTour = source.indexOf(
            "id: 'map-options-tour-skip-police-reports'",
        );
        // Exclude the initial notVisible check when identifying the first visible assertion.
        const visibleAssertions = [
            ...source.matchAll(
                /- extendedWaitUntil:\s+visible:\s+id: 'map-settings-sheet'/g,
            ),
        ];
        assert.doesNotMatch(source, /start: '50%,45%'/);
        assert.match(
            source,
            /point: '50%,20%'[\s\S]*?notVisible:\s+id: 'map-settings-sheet'[\s\S]*?id: 'map-layer-button'/,
        );
        assert.ok(skipTour >= 0);
        assert.ok(visibleAssertions.length > 0);
        assert.ok(visibleAssertions[0].index > skipTour);
        assert.ok(source.indexOf("- assertVisible: 'Map settings'") > skipTour);
    });
}

test('node editing handles first-use contribution guidance before asserting the start sheet', () => {
    const source = readFileSync(
        path.join(EXPO_DIRECTORY, '.maestro/node-location-editor.yml'),
        'utf8',
    );
    const skip = source.indexOf("id: 'contribute-tour-skip-start'");
    const sheet = source.search(
        /- extendedWaitUntil:\s+visible:\s+id: 'contribute-start-sheet'/,
    );
    assert.ok(skip >= 0 && sheet > skip);
});

for (const flow of ['scorecard-gamification.yml', 'scorecard.yml']) {
    test(`${flow} dismisses the first-visit tour before waiting for the dashboard`, () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', flow),
            'utf8',
        );
        const skip = source.indexOf(
            '- runFlow: subflows/scorecard-tour-skip-first-visit.yml',
        );
        const dashboard = source.search(
            /- extendedWaitUntil:\s+visible:\s+id: 'scorecard-dashboard'/,
        );
        assert.ok(skip >= 0 && dashboard > skip);
    });
}

test('first-launch readiness accepts the retained areas screen between lifecycle flows', () => {
    const source = readFileSync(
        path.join(
            EXPO_DIRECTORY,
            '.maestro/subflows/dismiss-first-launch-support.yml',
        ),
        'utf8',
    );
    const readiness = new RegExp(source.match(/id: '([^']+)'/)[1]);
    for (const id of [
        'first-launch-support-maybe-later',
        'map-search-input-map',
        'map-search-input-driving',
        'areas-screen',
        'add-area-screen',
        'area-alerts-screen',
        'area-feed-screen',
    ]) {
        assert.match(id, readiness);
    }
});

test('every launch flow dismisses first-launch support before interacting with the app', () => {
    for (const directory of ['.maestro', '.maestro/subflows']) {
        for (const name of readdirSync(path.join(EXPO_DIRECTORY, directory))) {
            if (!name.endsWith('.yml')) {
                continue;
            }
            const source = readFileSync(
                path.join(EXPO_DIRECTORY, directory, name),
                'utf8',
            );
            const launch = source.indexOf('- launchApp:');
            if (launch < 0) {
                continue;
            }
            const startup = source.slice(launch).split(/(?=^- )/m);
            let next = 1;
            while (
                startup[next]?.includes(
                    'open-expo-dev-client-after-clear.yml',
                ) ||
                startup[next]?.includes('resume-expo-dev-client.yml') ||
                startup[next]?.includes("visible: 'Reload'")
            ) {
                next += 1;
            }
            const helper = directory.endsWith('subflows')
                ? 'dismiss-first-launch-support.yml'
                : 'subflows/dismiss-first-launch-support.yml';
            assert.equal(
                startup[next]?.trim(),
                `- runFlow: ${helper}`,
                `${directory}/${name}`,
            );
        }
    }
});
