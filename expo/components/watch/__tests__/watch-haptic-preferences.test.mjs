import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTourModule } from '../../map/__tests__/tour-test-helpers.mjs';

test('phone haptic preference waits for storage and publishes saved changes', async () => {
    const writes = [];
    const changes = [];
    const preferences = loadTourModule(
        new URL('../watch-haptic-preferences.js', import.meta.url),
        {
            '@react-native-async-storage/async-storage': {
                getItem: async () => 'false',
                setItem: async (key, value) => writes.push([key, value]),
            },
        },
    );
    const unsubscribe = preferences.subscribeWatchHaptics((value) =>
        changes.push(value),
    );
    assert.equal(preferences.watchHapticsEnabled(), false);
    assert.equal(await preferences.loadWatchHapticPreferences(), false);
    await preferences.setWatchHapticsEnabled(true);
    assert.equal(preferences.watchHapticsEnabled(), true);
    assert.deepEqual(changes, [false, true]);
    assert.deepEqual(writes, [['watch-maneuver-haptics-enabled', 'true']]);
    unsubscribe();
});
