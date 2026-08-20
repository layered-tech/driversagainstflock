import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

    test('clears persisted Android tasks before development-client bootstrap', () => {
        assert.deepEqual(
            createAndroidClearAppStateArgs('com.anonymous.drivefree.dev'),
            ['shell', 'pm', 'clear', 'com.anonymous.drivefree.dev'],
        );
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

        assert.equal(flows.length, 28);
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
            'moving-navigation.yml',
            'road-matching-free-drive.yml',
            'road-matching-parallel-road.yml',
            'scorecard-gamification.yml',
            'scorecard-local-exposure-drive.yml',
            'scorecard-private-route-drive.yml',
            'scorecard.yml',
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

    test('restores the scorecard top before reading recap-updated totals', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'scorecard-gamification.yml'),
            'utf8',
        );

        assert.match(
            source,
            /id: 'drawer-scorecard-button'[\s\S]*?id: 'scorecard-dashboard'[\s\S]*?- scrollUntilVisible:\s+element:\s+id: 'scorecard-privacy-score'\s+direction: UP\s+timeout: 10000\s+- assertVisible:\s+id: 'scorecard-coverage-incomplete'\s+- assertNotVisible:\s+id: 'scorecard-coverage-incomplete-debug'\s+- copyTextFrom:\s+id: 'scorecard-privacy-score'/,
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

    test('simulates motion for the road-matched heading turn', () => {
        const source = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                '.maestro',
                'road-matching-heading-turn.yml',
            ),
            'utf8',
        );

        assert.equal(source.match(/- travel:/g)?.length, 2);
        assert.equal(source.match(/speed: 12/g)?.length, 2);
        assert.match(
            source,
            /points:\s+- ['"]30\.266984040600367, -97\.74101981574155['"]\s+- ['"]30\.266984040600367, -97\.74049976967694['"]/,
        );
        assert.match(
            source,
            /points:\s+- ['"]30\.266984040600367, -97\.74049976967694['"]\s+- ['"]30\.267200000000000, -97\.73997972361234['"]\s+- ['"]30\.2680998308318, -97\.73973010150132['"]/,
        );
        assert.match(
            source,
            /text: 'true'\s+childOf:\s+id: 'e2e-native-puck-heading-lock-proof'/,
        );
        assert.match(
            source,
            /text: 'true'\s+childOf:\s+id: 'e2e-native-puck-heading-turn-proof'/,
        );
        assert.doesNotMatch(
            source,
            /visible:\s+id: 'e2e-native-puck-heading-(?:lock|turn)-proof'\s+text:/,
        );
        assert.match(
            source,
            /id: 'e2e-native-puck-effective-heading'\s+- assertTrue: \$\{Math\.abs\(Number\(maestro\.copiedText\)\) <= 0\.5 \|\| Math\.abs\(Number\(maestro\.copiedText\) - 360\) <= 0\.5\}/,
        );
    });

    test('enters the parallel-road fixture from the west and waits for puck proof', () => {
        const source = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                '.maestro',
                'road-matching-parallel-road.yml',
            ),
            'utf8',
        );

        assert.equal(source.match(/- travel:/g)?.length, 7);
        assert.equal(source.match(/speed: 12/g)?.length, 6);
        assert.equal(
            source.match(/Math\.abs\(Number\(maestro\.copiedText\.split/g)
                ?.length,
            18,
        );
        assert.match(
            source,
            /id: 'start-free-drive-button'[\s\S]*?visible: 'expo-foreground-location-watch'\s+timeout: 30000\s+- travel:/,
        );
        assert.match(
            source,
            /longitude: -97\.7488205067107[\s\S]*?- travel:\s+points:\s+- '30\.26760492387431, -97\.7488205067107'\s+- '30\.26760492387431, -97\.7483004606461'\s+speed: 12\s+- setLocation:\s+latitude: 30\.26760492387431\s+longitude: -97\.7483004606461/,
        );
        assert.ok(source.includes("visible: '-97\\.7483[0-9]+,30\\.2676049'"));
        assert.equal(
            source.match(/visible: 'native-puck-proof-ready'/g)?.length,
            4,
        );
        assert.match(
            source,
            /longitude: -97\.74221592169016\s+- travel:\s+points:\s+- '30\.26760492387431, -97\.74221592169016'\s+- '30\.267343972933087, -97\.74205990787078'\s+speed: 12\s+- setLocation:\s+latitude: 30\.267343972933087\s+longitude: -97\.74205990787078/,
        );
        assert.ok(
            source.includes("visible: '-97\\.7420[0-9]+,30\\.2673[0-9]+'"),
        );
    });

    test('waits for native puck readiness in free drive', () => {
        const source = readFileSync(
            path.join(
                EXPO_DIRECTORY,
                '.maestro',
                'road-matching-free-drive.yml',
            ),
            'utf8',
        );

        assert.equal(
            source.match(/visible: 'native-puck-proof-ready'/g)?.length,
            4,
        );
        assert.doesNotMatch(source, /visible: 'true'/);
        assert.match(
            source,
            /longitude: -97\.74466013819383[\s\S]*?points:\s+- '30\.26698404060037, -97\.74466013819383'\s+- '30\.26698404060037, -97\.74419209212921'[\s\S]*?speed: 0\.2[\s\S]*?platform: Android[\s\S]*?id: '__e2e-foreground-location-delivery-delay__'\s+timeout: 1500\s+optional: true\s+- setLocation:\s+latitude: 30\.26698404060037\s+longitude: -97\.74414009212921\s+- extendedWaitUntil:\s+visible: '-97\.7441401,30\.2669840'/,
        );
        assert.doesNotMatch(source, /speed: 12(?:\s|$)/);
        assert.match(
            source,
            /id: 'e2e-native-3d-puck-proof'\s+- assertTrue: \$\{maestro\.copiedText == 'true'\}\s+- extendedWaitUntil:\s+visible: '-97\.7441401,30\.2672000'\s+timeout: 60000/,
        );
        assert.equal(
            source.match(
                /Math\.abs\(Number\(maestro\.copiedText\.split\(','\)\[0\]\) - -97\.(?:7441401|7389396)\) <= 0\.0001/g,
            )?.length,
            2,
        );
        assert.doesNotMatch(
            source,
            /e2e-native-puck-indicator-at-(?:snapped|raw)/,
        );
    });

    test('moves navigation through deterministic route points without slow travel', () => {
        const source = readFileSync(
            path.join(EXPO_DIRECTORY, '.maestro', 'moving-navigation.yml'),
            'utf8',
        );

        assert.match(source, /clearState: true/);
        assert.match(
            source,
            /file: subflows\/open-expo-dev-client-after-clear\.yml/,
        );
        assert.match(source, /visible: 'expo-foreground-location-watch'/);
        assert.match(source, /openLink: 'driversagainstflock:\/\/e2e-mocks'/);
        assert.doesNotMatch(source, /speed: 1(?:\s|$)/);
        assert.equal(source.match(/- travel:/g)?.length, 3);
        assert.equal(source.match(/speed: 12/g)?.length, 3);
        assert.equal(source.match(/waitToSettleTimeoutMs: 1000/g)?.length, 8);
        assert.match(
            source,
            /points:\s+- '30\.2672, -97\.7431'\s+- '30\.270606, -97\.749971'\s+speed: 12[\s\S]*?visible: '-97\.7499710,30\.2706060'/,
        );
        assert.match(
            source,
            /points:\s+- '30\.270606, -97\.749971'\s+- '30\.262012, -97\.744842'\s+- '30\.262520, -97\.745886'\s+speed: 12[\s\S]*?visible: '-97\.7458860,30\.2625200'[\s\S]*?visible: '\.\*Arrive at your destination\.\*'/,
        );
        assert.match(
            source,
            /points:\s+- '30\.262520, -97\.745886'\s+- '30\.2654, -97\.7518'\s+speed: 12[\s\S]*?visible: '-97\.7518000,30\.2654000'/,
        );
    });

    test('drives real scorecard lifecycles without scorecard state fixtures', () => {
        const flowExpectations = new Map([
            [
                'scorecard-private-route-drive.yml',
                {
                    scenario: 'private-route',
                    travelCount: 3,
                    waypointDeliveryCount: 2,
                },
            ],
            [
                'scorecard-local-exposure-drive.yml',
                {
                    scenario: 'local-exposure',
                    travelCount: 4,
                    waypointDeliveryCount: 3,
                },
            ],
        ]);

        for (const [flow, expectation] of flowExpectations) {
            const source = readFileSync(
                path.join(EXPO_DIRECTORY, '.maestro', flow),
                'utf8',
            );

            assert.equal(source.match(/\bclearState:\s*true\b/g)?.length, 1);
            assert.equal(source.match(/\bclearKeychain:\s*true\b/g)?.length, 1);
            assert.equal(
                source.match(/- travel:/g)?.length,
                expectation.travelCount,
            );
            assert.equal(
                source.match(/speed: 0\.2/g)?.length,
                expectation.travelCount - 1,
            );
            assert.equal(source.match(/speed: 0\.08/g)?.length, 1);
            assert.equal(
                source.match(
                    /visible: '-97\.[0-9]+,30\.[0-9]+'\s+timeout: 30000/g,
                )?.length,
                expectation.waypointDeliveryCount,
            );
            assert.equal(
                source.match(
                    /platform: Android\s+commands:\s+- extendedWaitUntil:\s+visible:\s+id: '__e2e-scorecard-waypoint-delivery-delay__'\s+timeout: 1500\s+optional: true/g,
                )?.length,
                expectation.waypointDeliveryCount,
            );
            assert.equal(
                source.match(/^- setLocation:/gm)?.length,
                expectation.waypointDeliveryCount + 2,
            );
            assert.match(
                source,
                new RegExp(
                    `driversagainstflock:\\/\\/e2e-mocks\\?scorecardDrive=${expectation.scenario}`,
                ),
            );
            assert.match(source, /visible: 'expo-foreground-location-watch'/);
            assert.match(source, /visible: 'scorecard-hydrated'/);
            assert.match(source, /visible: 'scorecard-guided-active'/);
            assert.match(source, /visible: 'scorecard-camera-inventory-ready'/);
            assert.match(source, /id: 'scorecard-arrival-recap'/);
            assert.equal(
                source.match(/id: 'e2e-scorecard-storage-synced'/g)?.length,
                2,
            );
            assert.equal(
                source.match(/id: 'e2e-scorecard-persisted-revision'/g)?.length,
                2,
            );
            assert.match(
                source,
                /scorecard-camera-inventory-ready'[\s\S]*?id: 'e2e-scorecard-storage-synced'[\s\S]*?id: 'e2e-scorecard-persisted-revision'[\s\S]*?Number\(maestro\.copiedText\) > 0[\s\S]*?- travel:/,
            );
            assert.match(
                source,
                /launchApp:\s+stopApp: true\s+permissions:\s+all: allow/,
            );
            assert.doesNotMatch(source, /(?:[?&]|\b)scorecard=/i);
            assert.doesNotMatch(source, /e2eScorecardFixture/i);
            assert.doesNotMatch(source, /driving-cancel-route-button/);
        }
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
        assert.match(source, /testID="e2e-scorecard-camera-inventory-ready"/);
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
            /id: 'directions-route-start-driving-button'[\s\S]*?notVisible:\s+id: 'directions-route-sheet-presented'[\s\S]*?visible: 'expo-foreground-location-watch'[\s\S]*?- travel:\s+points:\s+- '30\.26698404060037, -97\.74466013819383'\s+- '30\.26698404060037, -97\.74414009212921'\s+speed: 12[\s\S]*?visible: 'e2e-main-35:0:forward'[\s\S]*?id: 'driving-speed-limit-sign'/,
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

        assert.equal(tapCount, 18);
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
