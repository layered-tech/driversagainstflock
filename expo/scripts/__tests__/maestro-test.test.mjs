import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    collectMaestroFlows,
    createAndroidDevClientLaunchArgs,
    createExpoDevClientUrl,
    createExpoStartArgs,
    createMetroNodeOptions,
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

describe('Maestro managed development server', () => {
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

    test('rejects an invalid requested Metro port', async () => {
        await assert.rejects(() => selectMetroPort('not-a-port'), /Invalid/);
    });

    test('collects the full suite without launcher UI readiness checks', () => {
        const flows = collectMaestroFlows(['.maestro'], EXPO_DIRECTORY);

        assert.equal(flows.length, 26);
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
            'contribute-wizard.yml',
            'driving-alerts.yml',
            'map-layer-options.yml',
            'marker-osm-details-toggle.yml',
            'road-matching-free-drive.yml',
            'road-matching-parallel-road.yml',
            'speed-limit-badge.yml',
            'turn-by-turn-navigation.yml',
        ];

        for (const flow of clearStateFlows) {
            assert.match(
                readFileSync(
                    path.join(EXPO_DIRECTORY, '.maestro', flow),
                    'utf8',
                ),
                /file: subflows\/open-expo-dev-client-after-clear\.yml/,
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

    test('forwards iOS Expo development-client scene URLs', () => {
        const sceneDelegate = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                'node_modules',
                '@iternio',
                'react-native-auto-play',
                'ios',
                'scenes',
                'WindowApplicationSceneDelegate.swift',
            ),
            'utf8',
        );
        const dependencyPatch = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                'patches',
                '@iternio+react-native-auto-play+0.4.7.patch',
            ),
            'utf8',
        );

        for (const source of [sceneDelegate, dependencyPatch]) {
            assert.match(source, /url\.host == "expo-development-client"/);
            assert.match(
                source,
                /UIApplication\.shared\.delegate\?\.application\?\(/,
            );
        }
    });

    test('serializes iOS speech permission registration on the main thread', () => {
        const dependencyPatch = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                'patches',
                'expo-speech-recognition+56.0.1.patch',
            ),
            'utf8',
        );

        assert.match(dependencyPatch, /Thread\.isMainThread/);
        assert.match(
            dependencyPatch,
            /DispatchQueue\.main\.sync\(execute: registerPermissionRequesters\)/,
        );
        assert.doesNotMatch(dependencyPatch, /android\/build/);
    });

    test('does not combine IDs and values in iOS road-matching selectors', () => {
        for (const flow of [
            'road-matching-free-drive.yml',
            'road-matching-parallel-road.yml',
        ]) {
            const source = readFileSync(
                path.join(EXPO_DIRECTORY, '.maestro', flow),
                'utf8',
            );

            assert.doesNotMatch(
                source,
                /(?:assertVisible:|extendedWaitUntil:\s+visible:)\s+id: '[^']+'\s+text:/,
            );
            assert.match(source, /copyTextFrom:\s+id:/);
        }
    });
});
