import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const createNavigationModule = require('../../../mapbox-navigation/createNavigationModule.js');

class MockEventEmitter {
    addListener() {
        return {
            remove() {},
        };
    }
}

function createHookHarness() {
    const cleanups = [];

    return {
        cleanups,
        React: {
            useCallback: (callback) => callback,
            useEffect: (effect) => {
                cleanups.push(effect());
            },
            useState: (value) => [value, () => {}],
        },
    };
}

test('promotes a retained trip session when Android Auto requests foreground location', async () => {
    const startCalls = [];
    let stopCalls = 0;
    const hookHarness = createHookHarness();
    const navigation = createNavigationModule({
        EventEmitter: MockEventEmitter,
        findNodeHandle: () => null,
        Platform: { OS: 'android' },
        React: hookHarness.React,
        requireNativeModule: () => ({
            startTripSession: async (foregroundService) => {
                startCalls.push(foregroundService);
            },
            stopTripSession: async () => {
                stopCalls += 1;
            },
        }),
    });

    navigation.useEnhancedLocation({ foregroundService: false });
    navigation.useEnhancedLocation({ foregroundService: true });
    await Promise.resolve();

    assert.deepEqual(startCalls, [false, true]);
    assert.equal(stopCalls, 0);

    hookHarness.cleanups[1]();
    await Promise.resolve();

    assert.equal(stopCalls, 0);

    hookHarness.cleanups[0]();
    await Promise.resolve();

    assert.equal(stopCalls, 1);
});
