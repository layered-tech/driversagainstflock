import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    getCameraOverlayLayerPlacement,
    getMapLayerSlots,
    waitForCameraOverlayPuck2D,
} from '../map-layer-slots.js';

const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const mapLocationPuckIOSSource = readFileSync(
    new URL(
        '../../../modules/map-location-puck/ios/MapLocationPuckModule.swift',
        import.meta.url,
    ),
    'utf8',
);

test('camera overlays share the verified puck slot and render above its platform layer', () => {
    for (const platform of ['android', 'ios']) {
        for (const navigationPuckVariant of ['default', 'auto-play']) {
            const slots = getMapLayerSlots({ platform, navigationPuckVariant });
            const placement = getCameraOverlayLayerPlacement({
                platform,
                slots,
                puckIsReady: true,
            });
            assert.equal(placement.coneSlot, slots.userLocationPuck);
            assert.equal(placement.nodeSlot, slots.userLocationPuck);
            assert.equal(
                placement.aboveLayerID,
                platform === 'android'
                    ? 'mapbox-location-model-layer'
                    : 'puck-model-layer',
            );
        }
    }
});

test('camera overlays have no missing puck dependency before readiness or on unsupported platforms', () => {
    for (const platform of ['android', 'ios', 'web']) {
        for (const puckIsReady of [false, true]) {
            if (puckIsReady && platform !== 'web') continue;
            const slots = getMapLayerSlots({
                platform,
                navigationPuckVariant: 'auto-play',
            });
            assert.deepEqual(
                getCameraOverlayLayerPlacement({
                    platform,
                    slots,
                    puckIsReady,
                }),
                {
                    aboveLayerID: undefined,
                    coneSlot: slots.cameraCone,
                    nodeSlot: slots.cameraNode,
                },
            );
        }
    }
});

test('2D fallback overlays use the verified indicator layer outside the 3D puck slot', () => {
    for (const platform of ['android', 'ios']) {
        const slots = getMapLayerSlots({
            platform,
            navigationPuckVariant: 'auto-play',
        });
        assert.deepEqual(
            getCameraOverlayLayerPlacement({
                platform,
                slots,
                puckIsReady: true,
                puckKind: '2d',
            }),
            {
                aboveLayerID:
                    platform === 'android'
                        ? 'mapbox-location-indicator-layer'
                        : 'puck',
                coneSlot: undefined,
                nodeSlot: undefined,
            },
        );
    }
});

test('2D verification waits for native creation and stops when replaced or unavailable', async () => {
    let reads = 0;
    const options = { isCurrent: () => true, waitForCommit: async () => {} };
    assert.equal(
        await waitForCameraOverlayPuck2D({
            ...options,
            readState: async () => ({
                puckKind: '2d',
                indicatorLayerExists: ++reads === 3,
            }),
        }),
        true,
    );
    assert.equal(reads, 3);
    for (const readState of [
        async () => null,
        async () => {
            throw new Error('unavailable');
        },
    ]) {
        assert.equal(
            await waitForCameraOverlayPuck2D({ ...options, readState }),
            false,
        );
    }
    reads = 0;
    assert.equal(
        await waitForCameraOverlayPuck2D({
            ...options,
            readState: async () => {
                reads++;
                return { puckKind: '3d', modelLayerExists: true };
            },
        }),
        false,
    );
    assert.equal(reads, 10);
    let isCurrent = true;
    assert.equal(
        await waitForCameraOverlayPuck2D({
            ...options,
            isCurrent: () => isCurrent,
            readState: async () => {
                isCurrent = false;
                return { puckKind: '2d', indicatorLayerExists: true };
            },
        }),
        false,
    );
});

describe('Mapbox Standard layer slots', () => {
    test('keeps the Android Auto puck above routes without a transient layer anchor', () => {
        assert.deepEqual(
            getMapLayerSlots({
                navigationPuckVariant: 'auto-play',
                platform: 'android',
            }),
            {
                cameraCone: 'middle',
                cameraNode: 'top',
                mapProjection: undefined,
                routeLineElevationReference: undefined,
                routeLineOcclusionOpacity: undefined,
                routeLineZOffset: undefined,
                routePath: 'middle',
                userLocationPuck: 'top',
                userLocationPuckAboveLayer: undefined,
            },
        );
    });

    test('places the 3D CarPlay puck above de-batched route layers', () => {
        assert.deepEqual(
            getMapLayerSlots({
                navigationPuckVariant: 'auto-play',
                platform: 'ios',
            }),
            {
                cameraCone: 'middle',
                cameraNode: undefined,
                mapProjection: 'mercator',
                routeLineElevationReference: 'ground',
                routeLineOcclusionOpacity: 0,
                routeLineZOffset: 0.1,
                routePath: 'top',
                userLocationPuck: undefined,
                userLocationPuckAboveLayer: 'directions-route-line',
            },
        );

        assert.equal(
            mapCanvasSource.match(
                /lineElevationReference:\s*mapLayerSlots\.routeLineElevationReference/g,
            )?.length,
            4,
        );
        assert.equal(
            mapCanvasSource.match(
                /lineOcclusionOpacity:\s*mapLayerSlots\.routeLineOcclusionOpacity/g,
            )?.length,
            4,
        );
        assert.equal(
            mapCanvasSource.match(
                /lineZOffset: mapLayerSlots\.routeLineZOffset/g,
            )?.length,
            4,
        );
        assert.match(
            mapCanvasSource,
            /projection=\{mapLayerSlots\.mapProjection\}/,
        );
        assert.match(mapCanvasSource, /layerAbove: userLocationPuckAboveLayer/);
        assert.match(
            mapCanvasSource,
            /directionsRouteIsVisible && locationPuckMapLoadEpoch > 0/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /configuration\.layerPosition = Self\.mapboxPuckLayerPosition\(layerAbove\)/,
        );
        assert.match(
            mapLocationPuckIOSSource,
            /return \.above\("directions-route-line"\)/,
        );
    });

    test('does not make route layers wait for the asynchronous native puck', () => {
        assert.doesNotMatch(
            mapCanvasSource,
            /belowLayerID=\{routeBelowLayer\}/,
        );
        assert.doesNotMatch(mapCanvasSource, /getReadyRouteBelowLayer/);
        assert.doesNotMatch(
            getMapLayerSlots.toString(),
            /routeBelowLayer|puck-model-layer/,
        );
    });

    test('preserves the existing layer order outside car-host pucks', () => {
        for (const options of [
            { navigationPuckVariant: 'default', platform: 'android' },
            { navigationPuckVariant: 'default', platform: 'ios' },
            { navigationPuckVariant: 'auto-play', platform: 'web' },
        ]) {
            assert.deepEqual(getMapLayerSlots(options), {
                cameraCone: 'middle',
                cameraNode: undefined,
                mapProjection: undefined,
                routeLineElevationReference: undefined,
                routeLineOcclusionOpacity: undefined,
                routeLineZOffset: undefined,
                routePath: 'top',
                userLocationPuck: undefined,
                userLocationPuckAboveLayer: undefined,
            });
        }
    });
});

test('both shared map inventory sources render 3D cones with the existing visibility and style reload lifecycle', () => {
    assert.match(
        mapCanvasSource,
        /surveillanceMarkersVisible && cameraConesVisible[\s\S]*?<CameraViewConeModels[\s\S]*?locationPuckMapLoadEpoch/,
    );
    assert.equal(
        (mapCanvasSource.match(/\? renderMarkerConeModelLayers\(/g) ?? [])
            .length,
        2,
    );
    assert.equal(
        (mapCanvasSource.match(/slot: cameraOverlayPlacement\.coneSlot/g) ?? [])
            .length,
        2,
    );
    assert.doesNotMatch(mapCanvasSource, /<MarkerConeImages/);
    assert.equal(
        (mapCanvasSource.match(/isDarkMode: isDuskNightMapLightPreset/g) ?? [])
            .length,
        2,
    );
    assert.match(
        mapCanvasSource,
        /locationPuckRequests3D && locationPuck3DStatus === 'active'/,
    );
    assert.match(
        mapCanvasSource,
        /setCameraOverlayLayerEpoch\(\(epoch\) => epoch \+ 1\)/,
    );
});
