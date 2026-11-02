import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
    nameLocationChannel,
} = require('../../plugins/withLocationChannelName');

test('SDK 58 location channels retain their IDs and rename both new and existing channels', () => {
    const source = readFileSync(
        new URL(
            '../../node_modules/expo-location/android/src/main/java/expo/modules/location/services/LocationTaskService.kt',
            import.meta.url,
        ),
        'utf8',
    );
    const original = source
        .replace(
            '    channel.name = "Background Location Tracking"\n    notificationManager.createNotificationChannel(channel)',
            '',
        )
        .replace(
            'NotificationChannel(id, "Background Location Tracking",',
            'NotificationChannel(id, appName,',
        );
    const patched = nameLocationChannel(original);
    assert.match(
        patched,
        /NotificationChannel\(id, "Background Location Tracking", NotificationManager.IMPORTANCE_LOW\)/,
    );
    assert.match(
        patched,
        /\}\s+channel.name = "Background Location Tracking"\s+notificationManager.createNotificationChannel\(channel\)/,
    );
    assert.equal(nameLocationChannel(patched), patched);
    assert.match(
        patched,
        /mChannelId = extras.getString\("appId"\) \+ ":" \+ extras.getString\("taskName"\)/,
    );
});

test('the channel plugin fails clearly if the native implementation changes', () => {
    assert.throws(
        () => nameLocationChannel('class ChangedLocationService {}'),
        /Cannot find prepareChannel/,
    );
    assert.throws(
        () =>
            nameLocationChannel(
                '  private fun prepareChannel(id: String?) {\n    changed()\n  }',
            ),
        /implementation changed/,
    );
});

test('the source patch is registered for regeneration and location stays built from source', () => {
    const config = require('../../app.config');
    const manifest = require('../../package.json');
    assert.ok(config.plugins.includes('./plugins/withLocationChannelName'));
    assert.ok(
        manifest.expo.autolinking.android.buildFromSource.includes(
            'expo-location',
        ),
    );
});
