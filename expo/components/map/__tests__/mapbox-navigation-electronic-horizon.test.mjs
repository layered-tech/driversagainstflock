import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const createNavigationModule = require('../../../mapbox-navigation/createNavigationModule.js');
const androidNavigationModuleSource = readFileSync(
    new URL(
        '../../../mapbox-navigation/android/src/main/java/com/rnmapbox/navigation/RNMapboxNavigationModule.kt',
        import.meta.url,
    ),
    'utf8',
);
const iosNavigationModuleSource = readFileSync(
    new URL(
        '../../../mapbox-navigation/ios/RNMapboxNavigationModule.swift',
        import.meta.url,
    ),
    'utf8',
);

class MockEventEmitter {
    static instance = null;

    constructor() {
        this.listeners = new Map();
        MockEventEmitter.instance = this;
    }

    addListener(eventName, listener) {
        const listeners = this.listeners.get(eventName) ?? new Set();
        listeners.add(listener);
        this.listeners.set(eventName, listeners);

        return {
            remove: () => listeners.delete(listener),
        };
    }

    emit(eventName, event) {
        this.listeners.get(eventName)?.forEach((listener) => listener(event));
    }
}

function createModule(nativeModule) {
    return createNavigationModule({
        EventEmitter: MockEventEmitter,
        findNodeHandle: () => null,
        Platform: { OS: 'android' },
        React: {
            useCallback: (callback) => callback,
            useEffect: () => undefined,
            useState: (value) => [value, () => {}],
        },
        requireNativeModule: () => nativeModule,
    });
}

describe('Mapbox Navigation Electronic Horizon bridge', () => {
    test('configures native Electronic Horizon for the most-probable path only', () => {
        assert.match(
            androidNavigationModuleSource,
            /\.expansion\(ELECTRONIC_HORIZON_MPP_ONLY_EXPANSION\)/,
        );
        assert.match(
            androidNavigationModuleSource,
            /ELECTRONIC_HORIZON_MPP_ONLY_EXPANSION = 0/,
        );
        assert.doesNotMatch(
            androidNavigationModuleSource,
            /collectElectronicHorizonEdges/,
        );
        assert.match(
            androidNavigationModuleSource,
            /selectPrimaryPath\(position\.eHorizon\.mpp\(position\)\)/,
        );
        assert.match(androidNavigationModuleSource, /paths\.maxByOrNull/);
        assert.doesNotMatch(
            androidNavigationModuleSource,
            /ELECTRONIC_HORIZON_MPP_NEAR_TIE/,
        );
        assert.match(
            iosNavigationModuleSource,
            /expansionLevel: ELECTRONIC_HORIZON_MPP_ONLY_EXPANSION_LEVEL/,
        );
        assert.match(
            iosNavigationModuleSource,
            /ELECTRONIC_HORIZON_MPP_ONLY_EXPANSION_LEVEL: UInt = 0/,
        );
        assert.doesNotMatch(iosNavigationModuleSource, /collectTreeEdges/);
    });

    test('returns the last native horizon and forwards horizon events', async () => {
        const horizon = {
            primaryPath: {
                coordinates: [
                    [-97.7431, 30.2672],
                    [-97.7425, 30.268],
                ],
                segments: [],
            },
            updatedAt: 1_783_784_800_000,
        };
        const navigation = createModule({
            getLastElectronicHorizon: async () => horizon,
        });
        let receivedEvent = null;

        assert.equal(navigation.isElectronicHorizonSupported(), true);
        assert.deepEqual(
            await navigation.getLastElectronicHorizonAsync(),
            horizon,
        );

        const subscription = navigation.addElectronicHorizonListener(
            (event) => {
                receivedEvent = event;
            },
        );

        MockEventEmitter.instance.emit('onElectronicHorizon', horizon);

        assert.deepEqual(receivedEvent, horizon);

        subscription.remove();
        MockEventEmitter.instance.emit('onElectronicHorizon', { updatedAt: 2 });

        assert.deepEqual(receivedEvent, horizon);
    });

    test('degrades safely when the installed native build lacks Electronic Horizon', async () => {
        const navigation = createModule({});

        assert.equal(navigation.isElectronicHorizonSupported(), false);
        assert.equal(await navigation.getLastElectronicHorizonAsync(), null);
        assert.doesNotThrow(() =>
            navigation.addElectronicHorizonListener(() => {}).remove(),
        );
    });
});

describe('Mapbox Navigation Android Auto lifecycle bridge', () => {
    test('activates and deactivates the car-session lifecycle', async () => {
        const calls = [];
        const navigation = createModule({
            activateAndroidAutoLifecycle: async () => {
                calls.push('activate');
                return true;
            },
            deactivateAndroidAutoLifecycle: async () => {
                calls.push('deactivate');
                return true;
            },
            updateAndroidAutoLifecycleState: async (state) => {
                calls.push(['state', state]);
                return true;
            },
        });

        assert.equal(navigation.isAndroidAutoLifecycleSupported(), true);
        assert.equal(
            await navigation.activateAndroidAutoLifecycleAsync(),
            true,
        );
        assert.equal(
            await navigation.deactivateAndroidAutoLifecycleAsync(),
            true,
        );
        assert.equal(
            await navigation.updateAndroidAutoLifecycleStateAsync('didAppear'),
            true,
        );
        assert.deepEqual(calls, [
            'activate',
            'deactivate',
            ['state', 'didAppear'],
        ]);
    });

    test('safely skips lifecycle calls in a native build without the bridge', async () => {
        const navigation = createModule({});

        assert.equal(navigation.isAndroidAutoLifecycleSupported(), false);
        assert.equal(
            await navigation.activateAndroidAutoLifecycleAsync(),
            false,
        );
        assert.equal(
            await navigation.deactivateAndroidAutoLifecycleAsync(),
            false,
        );
        assert.equal(
            await navigation.updateAndroidAutoLifecycleStateAsync(
                'didDisappear',
            ),
            false,
        );
    });
});
