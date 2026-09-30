import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import {
    getAutoPlayBoundsFitPadding,
    getAutoPlayViewportMetrics,
} from '../../auto-play-map-viewport.js';
import { getFollowCameraPadding } from '../follow-camera-padding.js';
import { getNavigationPuckAnchorY } from '../navigation-puck-layout.js';

const mapSurfaceContentSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const mapStatusOverlaySource = readFileSync(
    new URL('../../auto-play-map-status-overlay.js', import.meta.url),
    'utf8',
);

const CAMERA_ANCHOR_PIXEL_TOLERANCE = 0.5;

function assertApproximatelyEqual(actual, expected) {
    assert.ok(Math.abs(actual - expected) <= CAMERA_ANCHOR_PIXEL_TOLERANCE);
}

function getCameraAnchor({ height, padding, width }) {
    return {
        x: (padding.paddingLeft + width - padding.paddingRight) / 2,
        y: (padding.paddingTop + height - padding.paddingBottom) / 2,
    };
}

function getFollowPadding(viewportMetrics, followViewportAnchorY) {
    return getFollowCameraPadding({
        followViewportAnchorY,
        maxTopPaddingRatio: 0.95,
        viewportHeight: viewportMetrics.height,
        viewportInsets: viewportMetrics.cameraPadding,
    });
}

describe('Auto Play map viewport geometry', () => {
    test('dashboard camera uses the measured pane for its bottom puck slot', () => {
        const metricsStart = mapSurfaceContentSource.indexOf(
            'const viewportMetrics = useMemo(',
        );
        const callbackStart = mapSurfaceContentSource.indexOf(
            '() =>',
            metricsStart,
        );
        const callbackEnd = mapSurfaceContentSource.indexOf(
            '        [',
            callbackStart,
        );
        const callback = mapSurfaceContentSource
            .slice(callbackStart, callbackEnd)
            .trim()
            .replace(/,$/, '');
        for (const layout of [
            { height: 240, width: 360, top: 0, bottom: 0, slotY: 176 },
            { height: 320, width: 480, top: 16, bottom: 24, slotY: 200 },
            { height: 280, width: 400, top: 12, bottom: 8, slotY: 184 },
        ]) {
            const context = {
                autoPlaySafeAreaInsets: {
                    top: layout.top,
                    bottom: layout.bottom,
                    left: 8,
                    right: 0,
                },
                getAutoPlayViewportMetrics,
                isDashboardMapSurface: true,
                layoutSize: { height: layout.height, width: layout.width },
                ornamentSafeAreaLeftScale: 1,
                windowInfo: { height: 720, width: 1280 },
            };
            const metrics = vm.runInNewContext(`(${callback})()`, context);
            assert.equal(metrics.height, layout.height);
            assert.equal(metrics.width, layout.width);
            // The measured slot already reflects safe areas and any road pill
            // beneath it. Both layout and camera must use dashboard points.
            const slotAnchorY = getNavigationPuckAnchorY({
                layoutY: layout.slotY,
                puckSize: 44,
            });
            const anchor = getCameraAnchor({
                height: metrics.height,
                width: metrics.width,
                padding: getFollowPadding(metrics, slotAnchorY),
            });
            assertApproximatelyEqual(anchor.y, slotAnchorY);
            assert.ok(anchor.y > metrics.center.y);
            assert.ok(anchor.y + 22 < metrics.visibleRect.bottom);
            const rootMetrics = vm.runInNewContext(`(${callback})()`, {
                ...context,
                isDashboardMapSurface: false,
            });
            assert.equal(rootMetrics.height, 720);
            assert.equal(rootMetrics.width, 1280);
        }
    });

    test('centers the navigation puck on the measured CarPlay slot', () => {
        const viewportMetrics = getAutoPlayViewportMetrics({
            safeAreaInsets: { bottom: 120, left: 24, right: 12, top: 16 },
            windowInfo: { height: 480, width: 800 },
        });
        const padding = getFollowPadding(viewportMetrics, 248);
        const anchor = getCameraAnchor({
            height: viewportMetrics.height,
            padding,
            width: viewportMetrics.width,
        });

        assert.deepEqual(padding, {
            paddingBottom: 120,
            paddingLeft: 24,
            paddingRight: 12,
            paddingTop: 136,
        });
        assertApproximatelyEqual(anchor.y, 248);
    });

    test('centres the puck when nothing measured an anchor', () => {
        const viewportMetrics = getAutoPlayViewportMetrics({
            safeAreaInsets: { bottom: 120, left: 24, right: 12, top: 16 },
            windowInfo: { height: 480, width: 800 },
        });
        const anchor = getCameraAnchor({
            height: viewportMetrics.height,
            padding: getFollowPadding(viewportMetrics, undefined),
            width: viewportMetrics.width,
        });

        assertApproximatelyEqual(anchor.y, viewportMetrics.center.y);
    });

    test('measures the follow anchor on host-owned surfaces too', () => {
        // Regression: the CarPlay Dashboard and both instrument clusters hide
        // the app's status chrome but still follow the driver, so an overlay
        // mounted only for the chrome left them on the centred fallback above.
        assert.doesNotMatch(
            mapSurfaceContentSource,
            /rendersAppOverlays && !searchResultsMapIsActive \? \(\s*<AutoPlayMapStatusOverlay/,
        );
        assert.match(
            mapSurfaceContentSource,
            /<AutoPlayMapStatusOverlay[\s\S]*?onLocationAnchorLayout=\{handleLocationAnchorLayout\}[\s\S]*?statusChromeIsVisible=\{\s*rendersAppOverlays && !searchResultsMapIsActive\s*\}/,
        );
        // The puck slot rides `drivingStatusIsVisible`; only the pill drawn
        // beneath it answers to the chrome and confirmation visibility flags.
        assert.match(
            mapStatusOverlaySource,
            /drivingStatusIsVisible \? \([\s\S]*?onLocationAnchorLayout=\{onLocationAnchorLayout\}/,
        );
        assert.match(
            mapStatusOverlaySource,
            /currentRoadPillIsVisible=\{\s*statusChromeIsVisible && !confirmationIsActive\s*\}/,
        );
    });

    test('uses raw host insets for the camera while retaining the ornament adjustment', () => {
        const viewportMetrics = getAutoPlayViewportMetrics({
            layoutSize: { height: 320, width: 480 },
            ornamentSafeAreaLeftScale: 0.65,
            safeAreaInsets: { bottom: 0, left: 300, right: 0, top: 0 },
            windowInfo: { height: 1080, width: 1920 },
        });

        assert.deepEqual(viewportMetrics.cameraPadding, {
            paddingBottom: 0,
            paddingLeft: 300,
            paddingRight: 0,
            paddingTop: 0,
        });
        assert.equal(viewportMetrics.safeAreaInsets.left, 195);
        assert.equal(viewportMetrics.width, 1920);
        assert.equal(viewportMetrics.height, 1080);
        assertApproximatelyEqual(viewportMetrics.center.x, 1110);

        const anchor = getCameraAnchor({
            height: viewportMetrics.height,
            padding: getFollowPadding(
                viewportMetrics,
                viewportMetrics.center.y,
            ),
            width: viewportMetrics.width,
        });

        assertApproximatelyEqual(anchor.x, 1110);
    });

    test('keeps vertical ornaments above the full host-obscured area', () => {
        const viewportMetrics = getAutoPlayViewportMetrics({
            ornamentSafeAreaLeftScale: 0.65,
            safeAreaInsets: { bottom: 640, left: 300, right: 0, top: 0 },
            windowInfo: { height: 1080, width: 1920 },
        });

        assert.equal(viewportMetrics.safeAreaInsets.bottom, 640);
        assert.equal(viewportMetrics.safeAreaInsets.left, 195);
    });

    test('preserves a usable bounds-fit area in narrow host map slots', () => {
        const requestedPadding = {
            paddingBottom: 112,
            paddingLeft: 96,
            paddingRight: 96,
            paddingTop: 88,
        };
        const layouts = [
            {
                expectedPadding: {
                    paddingBottom: 0,
                    paddingLeft: 0,
                    paddingRight: 0,
                    paddingTop: 0,
                },
                expectedVisibleHeight: 120,
                expectedVisibleWidth: 192,
                safeAreaInsets: {
                    bottom: 200,
                    left: 808,
                    right: 0,
                    top: 280,
                },
            },
            {
                expectedPadding: {
                    paddingBottom: 44.8,
                    paddingLeft: 72,
                    paddingRight: 72,
                    paddingTop: 35.2,
                },
                expectedVisibleHeight: 200,
                expectedVisibleWidth: 384,
                safeAreaInsets: {
                    bottom: 160,
                    left: 616,
                    right: 0,
                    top: 240,
                },
            },
            {
                expectedPadding: requestedPadding,
                expectedVisibleHeight: 320,
                expectedVisibleWidth: 432,
                safeAreaInsets: {
                    bottom: 80,
                    left: 568,
                    right: 0,
                    top: 200,
                },
            },
        ];

        layouts.forEach(
            ({
                expectedPadding,
                expectedVisibleHeight,
                expectedVisibleWidth,
                safeAreaInsets,
            }) => {
                const viewportMetrics = getAutoPlayViewportMetrics({
                    safeAreaInsets,
                    windowInfo: { height: 600, width: 1000 },
                });
                const fitPadding = getAutoPlayBoundsFitPadding({
                    padding: requestedPadding,
                    viewportMetrics,
                });

                assert.equal(
                    viewportMetrics.visibleWidth,
                    expectedVisibleWidth,
                );
                assert.equal(
                    viewportMetrics.visibleHeight,
                    expectedVisibleHeight,
                );
                assert.deepEqual(viewportMetrics.cameraPadding, {
                    paddingBottom: safeAreaInsets.bottom,
                    paddingLeft: safeAreaInsets.left,
                    paddingRight: safeAreaInsets.right,
                    paddingTop: safeAreaInsets.top,
                });
                Object.entries(expectedPadding).forEach(([key, value]) => {
                    assertApproximatelyEqual(fitPadding[key], value);
                });
                assert.ok(
                    viewportMetrics.visibleWidth -
                        fitPadding.paddingLeft -
                        fitPadding.paddingRight >=
                        Math.min(viewportMetrics.visibleWidth, 240),
                );
                assert.ok(
                    viewportMetrics.visibleHeight -
                        fitPadding.paddingTop -
                        fitPadding.paddingBottom >=
                        Math.min(viewportMetrics.visibleHeight, 120),
                );
            },
        );
    });

    test('anchors each host layout inside its live visible rectangle', () => {
        const layouts = [
            {
                expectedX: 960,
                name: 'widescreen dedicated',
                safeAreaInsets: { bottom: 0, left: 0, right: 0, top: 0 },
                windowInfo: { height: 1080, width: 1920 },
            },
            {
                expectedX: 1110,
                name: 'widescreen menu below',
                safeAreaInsets: {
                    bottom: 360,
                    left: 300,
                    right: 0,
                    top: 60,
                },
                windowInfo: { height: 1080, width: 1920 },
            },
            {
                expectedX: 600,
                name: 'portrait dedicated',
                safeAreaInsets: { bottom: 0, left: 120, right: 0, top: 0 },
                windowInfo: { height: 1920, width: 1080 },
            },
            {
                expectedX: 600,
                name: 'portrait split',
                safeAreaInsets: {
                    bottom: 640,
                    left: 120,
                    right: 0,
                    top: 0,
                },
                windowInfo: { height: 1920, width: 1080 },
            },
        ];

        layouts.forEach(({ expectedX, name, safeAreaInsets, windowInfo }) => {
            const viewportMetrics = getAutoPlayViewportMetrics({
                safeAreaInsets,
                windowInfo,
            });
            const measuredLayoutAnchorY =
                viewportMetrics.center.y + viewportMetrics.visibleHeight / 4;
            const anchor = getCameraAnchor({
                height: viewportMetrics.height,
                padding: getFollowPadding(
                    viewportMetrics,
                    measuredLayoutAnchorY,
                ),
                width: viewportMetrics.width,
            });

            assertApproximatelyEqual(anchor.x, expectedX);
            assertApproximatelyEqual(anchor.y, measuredLayoutAnchorY);
            assert.ok(
                anchor.y < viewportMetrics.visibleRect.bottom,
                `${name} should keep the location above the visible bottom`,
            );
        });
    });
});
