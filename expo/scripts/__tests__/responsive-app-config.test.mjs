import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { AndroidConfig, IOSConfig } = require('@expo/config-plugins');
const config = require('../../app.config.js');

test('native orientation plugins allow landscape tablet layouts', () => {
    const activity = {
        $: {
            'android:name': '.MainActivity',
            'android:screenOrientation': 'portrait',
        },
    };
    const manifest = { manifest: { application: [{ activity: [activity] }] } };
    AndroidConfig.Orientation.setAndroidOrientation(config, manifest);
    assert.equal(activity.$['android:screenOrientation'], 'unspecified');
    const infoPlist = IOSConfig.Orientation.setOrientation(config, {});
    assert.ok(
        infoPlist.UISupportedInterfaceOrientations.includes(
            'UIInterfaceOrientationLandscapeLeft',
        ),
    );
    assert.ok(
        infoPlist.UISupportedInterfaceOrientations.includes(
            'UIInterfaceOrientationLandscapeRight',
        ),
    );
    assert.ok(
        infoPlist.UISupportedInterfaceOrientations.includes(
            'UIInterfaceOrientationPortrait',
        ),
    );
    assert.equal(config.ios.supportsTablet, true);
});
