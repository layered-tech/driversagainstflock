import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { getMapLayerSlots } from '../map-layer-slots.js';

const mapCanvasSource = readFileSync(
    new URL('../map-canvas.js', import.meta.url),
    'utf8',
);
const mapLayerSlotsSource = readFileSync(
    new URL('../map-layer-slots.js', import.meta.url),
    'utf8',
);
const mapLocationPuckIOSSource = readFileSync(
    new URL(
        '../../../modules/map-location-puck/ios/MapLocationPuckModule.swift',
        import.meta.url,
    ),
    'utf8',
);

describe('Mapbox Standard layer slots', () => {
    test('keeps the Android Auto puck above routes without a transient layer anchor', () => {
        assert.deepEqual(
            getMapLayerSlots({
                navigationPuckVariant: 'auto-play',
                platform: 'android',
            }),
            {
                cameraCone: 'top',
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
                cameraCone: undefined,
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
            mapLayerSlotsSource,
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
                cameraCone: undefined,
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
