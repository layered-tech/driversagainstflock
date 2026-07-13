import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const createNavigationModule = require('../../../mapbox-navigation/createNavigationModule.js');

class FakeEventEmitter {
    addListener() {
        return {
            remove() {},
        };
    }
}

function makeNavigationModule(nativeModule) {
    return createNavigationModule({
        EventEmitter: FakeEventEmitter,
        Platform: { OS: 'ios' },
        React: {},
        findNodeHandle: () => 42,
        requireNativeModule: () => nativeModule,
    });
}

test('navigation camera queues normalized deferred options', async () => {
    const calls = [];
    const navigation = makeNavigationModule({
        async updateNavigationCameraOptions(surfaceId, options) {
            calls.push({ options, surfaceId });
            return true;
        },
    });

    const updated = await navigation.updateNavigationCameraOptionsAsync(
        'carplay',
        {
            deferUntilNextLocation: true,
            padding: {
                paddingBottom: '24',
                paddingLeft: undefined,
                paddingRight: '4.5',
                paddingTop: 'not-a-number',
            },
            pitch: '55',
            zoomLevel: '16.75',
        },
    );

    assert.equal(updated, true);
    assert.deepEqual(calls, [
        {
            options: {
                deferUntilNextLocation: true,
                padding: {
                    paddingBottom: 24,
                    paddingLeft: 0,
                    paddingRight: 4.5,
                    paddingTop: 0,
                },
                pitch: 55,
                zoomLevel: 16.75,
            },
            surfaceId: 'carplay',
        },
    ]);
});

test('navigation camera attaches with current options instead of a deferred marker', async () => {
    const calls = [];
    const navigation = makeNavigationModule({
        async attachNavigationCamera(surfaceId, mapViewTag, options) {
            calls.push({ mapViewTag, options, surfaceId });
            return true;
        },
    });

    const attached = await navigation.attachNavigationCameraAsync(
        'carplay',
        42,
        {
            deferUntilNextLocation: true,
            padding: { paddingTop: 12 },
            zoomLevel: 17,
        },
    );

    assert.equal(attached, true);
    assert.deepEqual(calls, [
        {
            mapViewTag: 42,
            options: {
                padding: {
                    paddingBottom: 0,
                    paddingLeft: 0,
                    paddingRight: 0,
                    paddingTop: 12,
                },
                zoomLevel: 17,
            },
            surfaceId: 'carplay',
        },
    ]);
});
