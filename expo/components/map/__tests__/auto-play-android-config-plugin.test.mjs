import assert from 'node:assert/strict';
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
