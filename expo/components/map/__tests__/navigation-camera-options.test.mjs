import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const createNavigationModule = require('../../../mapbox-navigation/createNavigationModule.js');
const androidNavigationModuleSource = readFileSync(
    new URL(
        '../../../mapbox-navigation/android/src/main/java/com/rnmapbox/navigation/RNMapboxNavigationModule.kt',
        import.meta.url,
    ),
    'utf8',
);

class FakeEventEmitter {
    addListener() {
        return {
            remove() {},
        };
    }
}

function makeNavigationModule(
    nativeModule,
    findNodeHandle = () => 42,
    platform = 'ios',
) {
    return createNavigationModule({
        EventEmitter: FakeEventEmitter,
        Platform: { OS: platform },
        React: {},
        findNodeHandle,
        requireNativeModule: () => nativeModule,
    });
}

test('navigation puck applies and clears the native 3D model', async () => {
    const calls = [];
    const navigation = makeNavigationModule({
        async applyNavigationPuck3D(mapViewTag, scale) {
            calls.push({ mapViewTag, operation: 'apply', scale });
            return true;
        },
        async clearNavigationPuck3D(mapViewTag) {
            calls.push({ mapViewTag, operation: 'clear' });
            return true;
        },
    });

    assert.equal(navigation.isNavigationPuck3DSupported(), true);
    assert.equal(
        await navigation.applyNavigationPuck3DAsync({ current: {} }, 256),
        true,
    );
    assert.equal(
        await navigation.clearNavigationPuck3DAsync({ current: {} }),
        true,
    );
    assert.deepEqual(calls, [
        { mapViewTag: 42, operation: 'apply', scale: 128 },
        { mapViewTag: 42, operation: 'clear' },
    ]);
});

test('Android navigation puck forwards its Mapbox style slot', async () => {
    const calls = [];
    const navigation = makeNavigationModule(
        {
            async applyNavigationPuck3D(mapViewTag, scale, slot, layerAbove) {
                calls.push({ layerAbove, mapViewTag, scale, slot });
                return true;
            },
            async clearNavigationPuck3D() {
                return true;
            },
        },
        () => 42,
        'android',
    );

    assert.equal(
        await navigation.applyNavigationPuck3DAsync(
            { current: {} },
            62.5,
            'middle',
            'directions-route-line',
        ),
        true,
    );
    assert.deepEqual(calls, [
        {
            layerAbove: 'directions-route-line',
            mapViewTag: 42,
            scale: 62.5,
            slot: 'middle',
        },
    ]);
});

test('navigation puck requires native apply and cleanup support', async () => {
    const navigation = makeNavigationModule({
        async applyNavigationPuck3D() {
            return true;
        },
    });

    assert.equal(navigation.isNavigationPuck3DSupported(), false);
    assert.equal(
        await navigation.applyNavigationPuck3DAsync({ current: {} }, 64),
        false,
    );
});

test('navigation puck resolves the native Mapbox view handle', async () => {
    const nativeMapView = {};
    const resolvedViews = [];
    const navigation = makeNavigationModule(
        {
            async applyNavigationPuck3D() {
                return true;
            },
            async clearNavigationPuck3D() {
                return true;
            },
        },
        (view) => {
            resolvedViews.push(view);
            return 42;
        },
    );

    await navigation.applyNavigationPuck3DAsync(
        { current: { _nativeRef: nativeMapView } },
        64,
    );

    assert.deepEqual(resolvedViews, [nativeMapView]);
});

test('navigation camera normalizes option updates', async () => {
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
            padding: {
                paddingBottom: '24',
                paddingLeft: undefined,
                paddingRight: '4.5',
                paddingTop: 'not-a-number',
            },
            locationUpdateTimestamp: '10000',
            pitch: '55',
            zoomLevel: '16.75',
        },
    );

    assert.equal(updated, true);
    assert.deepEqual(calls, [
        {
            options: {
                padding: {
                    paddingBottom: 24,
                    paddingLeft: 0,
                    paddingRight: 4.5,
                    paddingTop: 0,
                },
                locationUpdateTimestamp: 10000,
                pitch: 55,
                zoomLevel: 16.75,
            },
            surfaceId: 'carplay',
        },
    ]);
});

test('navigation camera attaches with current options', async () => {
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

test('Android navigation camera centers locations within follow padding', () => {
    assert.match(
        androidNavigationModuleSource,
        /this\.options\.followingFrameOptions\.focalPoint\s*=\s*FollowingFrameOptions\.FocalPoint\(0\.5, 0\.5\)/,
    );
});

test('Android navigation puck is placed above the selected route layer', () => {
    assert.match(
        androidNavigationModuleSource,
        /location\.layerAbove\s*=\s*layerAbove\?\.takeIf\(APP_STYLE_LAYER_IDS::contains\)/,
    );
    assert.match(
        androidNavigationModuleSource,
        /location\.layerAbove\s*=\s*null/,
    );
});
