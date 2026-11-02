import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

test('Android autolinking builds the patched location module from source', () => {
    const resolved = JSON.parse(
        execFileSync(
            process.execPath,
            [
                fileURLToPath(
                    new URL(
                        '../../../node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js',
                        import.meta.url,
                    ),
                ),
                'resolve',
                '--platform',
                'android',
                '--json',
            ],
            { cwd: new URL('../../..', import.meta.url), encoding: 'utf8' },
        ),
    );

    assert.deepEqual(resolved.configuration?.buildFromSource, [
        'expo-location',
    ]);
    assert.ok(
        resolved.modules.some(
            (module) => module.packageName === 'expo-location',
        ),
    );
});

for (const granted of [true, false]) {
    test(`Area channel is named with notification permission ${granted}`, async () => {
        const channels = [];
        const source = readFileSync(
            new URL('../area-notifications.js', import.meta.url),
            'utf8',
        );
        const { code } = transformSync(source, {
            babelrc: false,
            configFile: false,
            plugins: [transformModulesCommonJs],
        });
        const mocks = {
            'expo-application': {},
            'expo-constants': {
                expoConfig: { extra: { eas: { projectId: 'test' } } },
            },
            'expo-modules-core': { requireOptionalNativeModule: () => ({}) },
            'react-native': { Platform: { OS: 'android' } },
            './areas-api': { areaRequest: async () => {} },
            './area-push-token': { saveAreaPushToken: async () => {} },
            'expo-notifications': {
                AndroidImportance: { DEFAULT: 3 },
                setNotificationChannelAsync: async (...args) =>
                    channels.push(args),
                getPermissionsAsync: async () => ({ granted }),
                requestPermissionsAsync: () =>
                    assert.fail('Must not request permission'),
            },
        };
        const module = { exports: {} };
        new Function('require', 'module', 'exports', code)(
            (name) => {
                assert.ok(name in mocks, `Unexpected module: ${name}`);
                return mocks[name];
            },
            module,
            module.exports,
        );
        assert.equal(await module.exports.registerAreaNotifications(), granted);
        assert.deepEqual(channels, [
            ['area-changes', { name: 'Area Camera Changes', importance: 3 }],
        ]);
    });
}

test('native labels preserve IDs and rename existing location channels', () => {
    const location = readFileSync(
        new URL(
            '../../../node_modules/expo-location/android/src/main/java/expo/modules/location/services/LocationTaskService.kt',
            import.meta.url,
        ),
        'utf8',
    );
    assert.match(
        location,
        /mChannelId = extras.getString\("appId"\) \+ ":" \+ extras.getString\("taskName"\)/,
    );
    assert.match(
        location,
        /NotificationChannel\(id, "Background Location Tracking", NotificationManager.IMPORTANCE_LOW\)/,
    );
    assert.match(
        location,
        /\}\s+channel.name = "Background Location Tracking"\s+notificationManager.createNotificationChannel\(channel\)/,
    );
    const auto = readFileSync(
        new URL(
            '../../../node_modules/@iternio/react-native-auto-play/android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/AndroidAutoService.kt',
            import.meta.url,
        ),
        'utf8',
    );
    assert.match(auto, /CHANNEL_ID = "AutoPlayServiceChannel"/);
    assert.match(
        auto,
        /CHANNEL_ID,\s*getString\(R\.string\.AutoPlayNotificationChannelName\),\s*NotificationManager.IMPORTANCE_DEFAULT/,
    );
    const strings = readFileSync(
        new URL(
            '../../../node_modules/@iternio/react-native-auto-play/android/src/main/res/values/strings.xml',
            import.meta.url,
        ),
        'utf8',
    );
    assert.match(
        strings,
        /<string name="AutoPlayNotificationChannelName">Android Auto Navigation<\/string>/,
    );
});
