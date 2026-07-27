import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { shouldShowCurrentRoadPill } from '../current-road-pill-layout.js';
import { getRetainedCurrentRoadText } from '../current-road-state.js';
import {
    AUTO_PLAY_NAVIGATION_PUCK_3D_ZOOM_SCALES,
    AUTO_PLAY_NAVIGATION_PUCK_SIZE,
    getNavigationPuck3DMapScale,
    getNavigationPuckAnchorY,
    getNavigationPuckSize,
    NAVIGATION_PUCK_3D_ZOOM_SCALES,
    NAVIGATION_PUCK_SIZE,
} from '../navigation-puck-layout.js';

describe('current road pill layout', () => {
    test('scales 2D fallback pucks for mobile and car-host surfaces', () => {
        assert.equal(NAVIGATION_PUCK_SIZE, 75);
        assert.equal(AUTO_PLAY_NAVIGATION_PUCK_SIZE, 62.5);
        assert.equal(
            getNavigationPuckSize({
                viewportHeight: 852,
                viewportWidth: 393,
            }),
            74.5,
        );
        assert.equal(
            getNavigationPuckSize({
                variant: 'auto-play',
                viewportHeight: 480,
                viewportWidth: 800,
            }),
            62.5,
        );
    });

    test('clamps 2D fallback sizes independently of map zoom', () => {
        assert.equal(
            getNavigationPuckSize({
                viewportHeight: 200,
                viewportWidth: 200,
                zoomLevel: 10,
            }),
            56,
        );
        assert.equal(
            getNavigationPuckSize({
                variant: 'auto-play',
                viewportHeight: 2_000,
                viewportWidth: 2_000,
                zoomLevel: 10,
            }),
            80,
        );
        assert.equal(
            getNavigationPuckSize({
                viewportHeight: 600,
                viewportWidth: 400,
                zoomLevel: 10,
            }),
            getNavigationPuckSize({
                viewportHeight: 600,
                viewportWidth: 400,
                zoomLevel: 19,
            }),
        );
    });

    test('interpolates native 3D puck scales by map zoom', () => {
        const firstZoomScale = NAVIGATION_PUCK_3D_ZOOM_SCALES[0];
        const secondZoomScale = NAVIGATION_PUCK_3D_ZOOM_SCALES[1];
        const lastZoomScale = NAVIGATION_PUCK_3D_ZOOM_SCALES.at(-1);
        const midpointZoomLevel =
            (firstZoomScale.zoomLevel + secondZoomScale.zoomLevel) / 2;
        const midpointMapScale =
            (firstZoomScale.mapScale + secondZoomScale.mapScale) / 2;

        assert.ok(NAVIGATION_PUCK_3D_ZOOM_SCALES.length >= 2);
        assert.equal(
            getNavigationPuck3DMapScale({
                zoomLevel: firstZoomScale.zoomLevel - 1,
            }),
            firstZoomScale.mapScale,
        );
        assert.equal(
            getNavigationPuck3DMapScale({ zoomLevel: midpointZoomLevel }),
            midpointMapScale,
        );
        assert.equal(
            getNavigationPuck3DMapScale({
                zoomLevel: lastZoomScale.zoomLevel + 1,
            }),
            lastZoomScale.mapScale,
        );
        assert.equal(
            getNavigationPuck3DMapScale(),
            getNavigationPuck3DMapScale({ zoomLevel: 17 }),
        );
        assert.equal(
            getNavigationPuck3DMapScale({ zoomLevel: null }),
            getNavigationPuck3DMapScale({ zoomLevel: 17 }),
        );
        assert.equal(
            AUTO_PLAY_NAVIGATION_PUCK_3D_ZOOM_SCALES,
            NAVIGATION_PUCK_3D_ZOOM_SCALES,
        );
        assert.equal(
            getNavigationPuck3DMapScale({
                variant: 'auto-play',
                zoomLevel: midpointZoomLevel,
            }),
            midpointMapScale,
        );
    });

    test('uses the measured puck slot center as the camera anchor', () => {
        assert.equal(
            getNavigationPuckAnchorY({
                layoutY: 520,
            }),
            520 + NAVIGATION_PUCK_SIZE / 2,
        );
    });

    test('translates car-host layout coordinates into map coordinates', () => {
        assert.equal(
            getNavigationPuckAnchorY({
                layoutY: 380,
                puckSize: AUTO_PLAY_NAVIGATION_PUCK_SIZE,
                viewportTop: 60,
            }),
            60 + 380 + AUTO_PLAY_NAVIGATION_PUCK_SIZE / 2,
        );
    });

    test('rejects incomplete layout measurements', () => {
        assert.equal(getNavigationPuckAnchorY({ layoutY: undefined }), null);
        assert.equal(getNavigationPuckAnchorY({ layoutY: null }), null);
        assert.equal(
            getNavigationPuckAnchorY({ layoutY: 100, viewportTop: NaN }),
            null,
        );
        assert.equal(
            getNavigationPuckAnchorY({ layoutY: 100, puckSize: NaN }),
            null,
        );
    });

    test('keeps road context visible during active navigation', () => {
        assert.equal(
            shouldShowCurrentRoadPill({
                roadText: 'Main Street',
                routeIsActive: true,
            }),
            true,
        );
        assert.equal(shouldShowCurrentRoadPill({ roadText: '   ' }), false);
    });

    test('retains the last road through location fixes without road context', () => {
        assert.equal(
            getRetainedCurrentRoadText('Main Street', {
                latitude: 41.8,
                longitude: -87.6,
            }),
            'Main Street',
        );
    });

    test('replaces retained roads and clears explicit off-road matches', () => {
        assert.equal(
            getRetainedCurrentRoadText('Main Street', {
                roadMatch: {
                    roadContext: { primaryText: 'Oak Avenue' },
                },
            }),
            'Oak Avenue',
        );
        assert.equal(
            getRetainedCurrentRoadText('Oak Avenue', {
                roadMatch: { isOffRoad: true },
            }),
            '',
        );
        assert.equal(getRetainedCurrentRoadText('Oak Avenue', null), '');
    });
});
