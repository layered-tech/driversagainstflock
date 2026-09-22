import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const androidAutoPlugin = require('../../../plugins/withAndroidAuto.js');
const { applyAndroidAutoManifest } = androidAutoPlugin.__testables;

const ANDROID_NAME = 'android:name';
const NAVIGATE_ACTION = 'androidx.car.app.action.NAVIGATE';
const VIEW_ACTION = 'android.intent.action.VIEW';

function makeIntentFilter(actionName, scheme) {
    return {
        action: [{ $: { [ANDROID_NAME]: actionName } }],
        category: [
            { $: { [ANDROID_NAME]: 'android.intent.category.DEFAULT' } },
        ],
        ...(scheme ? { data: [{ $: { 'android:scheme': scheme } }] } : {}),
    };
}

function makeManifest() {
    return {
        manifest: {
            application: [
                {
                    activity: [
                        {
                            $: { [ANDROID_NAME]: '.MainActivity' },
                            'intent-filter': [
                                makeIntentFilter('android.intent.action.MAIN'),
                            ],
                        },
                    ],
                    service: [
                        {
                            $: { [ANDROID_NAME]: '.UnrelatedService' },
                            'intent-filter': [
                                makeIntentFilter('com.example.UNRELATED'),
                            ],
                        },
                    ],
                },
            ],
        },
    };
}

function getActions(component) {
    return (component['intent-filter'] ?? []).map(
        (intentFilter) => intentFilter.action[0].$[ANDROID_NAME],
    );
}

describe('Android Auto config plugin', () => {
    test('the disabled setting gates component and navigation callback registration on both platforms', () => {
        const {
            instrumentClusterEnabled,
        } = require('../../../car-display-config.js');
        assert.equal(instrumentClusterEnabled, false);
        const source = readFileSync(
            new URL('../../auto-play.js', import.meta.url),
            'utf8',
        );
        const start = source.indexOf(
            '    if (instrumentClusterEnabled) {',
            source.indexOf('export default function registerAutoPlay'),
        );
        const end = source.indexOf(
            '    autoPlayPlatform.registerPlatformListeners',
            start,
        );
        assert.ok(start >= 0 && end > start);
        for (const OS of ['android', 'ios']) {
            const setup = new Function(
                'instrumentClusterEnabled',
                'AutoPlayCluster',
                'Platform',
                source.slice(start, end),
            );
            const forbidden = () =>
                assert.fail('cluster registered while disabled');
            setup(
                instrumentClusterEnabled,
                {
                    setComponent: forbidden,
                    setNavigationCallbacks: forbidden,
                    addConnectionStateListener: forbidden,
                },
                { OS },
            );
        }
    });
    test('replaces inherited car filters without advertising an instrument cluster', () => {
        const manifest = applyAndroidAutoManifest(makeManifest());
        const service = manifest.manifest.application[0].service.find((entry) =>
            entry.$[ANDROID_NAME].endsWith('.AndroidAutoService'),
        );
        assert.ok(service);
        assert.equal(
            manifest.manifest.$['xmlns:tools'],
            'http://schemas.android.com/tools',
        );
        assert.ok(
            service['intent-filter'].some(
                (filter) => filter.$?.['tools:node'] === 'removeAll',
            ),
        );
        const carFilter = service['intent-filter'].find((filter) =>
            filter.action?.some(
                (action) =>
                    action.$[ANDROID_NAME] === 'androidx.car.app.CarAppService',
            ),
        );
        assert.deepEqual(
            carFilter.category.map((category) => category.$[ANDROID_NAME]),
            ['androidx.car.app.category.NAVIGATION'],
        );
        assert.doesNotMatch(JSON.stringify(service), /FEATURE_CLUSTER/);
    });
    test('keeps phone geo ownership on ACTION_VIEW only', () => {
        const inputManifest = makeManifest();
        inputManifest.manifest.application[0].activity[0]['intent-filter'].push(
            makeIntentFilter(NAVIGATE_ACTION, 'geo'),
        );

        const manifest = applyAndroidAutoManifest(inputManifest);
        const application = manifest.manifest.application[0];
        const mainActivity = application.activity[0];

        assert.deepEqual(getActions(mainActivity), [
            'android.intent.action.MAIN',
            VIEW_ACTION,
        ]);
        assert.deepEqual(
            mainActivity['intent-filter'].slice(1).map((intentFilter) => ({
                category: intentFilter.category[0].$[ANDROID_NAME],
                scheme: intentFilter.data[0].$['android:scheme'],
            })),
            [
                {
                    category: 'android.intent.category.DEFAULT',
                    scheme: 'geo',
                },
            ],
        );
    });

    test('is idempotent and preserves unrelated service filters', () => {
        const firstResult = applyAndroidAutoManifest(makeManifest());
        const secondResult = applyAndroidAutoManifest(firstResult);
        const application = secondResult.manifest.application[0];

        assert.deepEqual(secondResult, firstResult);
        assert.deepEqual(getActions(application.service[0]), [
            'com.example.UNRELATED',
        ]);
    });

    test('fails clearly when Expo has no MainActivity to own the intents', () => {
        const manifest = makeManifest();
        manifest.manifest.application[0].activity = [];

        assert.throws(
            () => applyAndroidAutoManifest(manifest),
            /could not find MainActivity/,
        );
    });
});
