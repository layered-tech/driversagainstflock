import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    getAutoPlayFollowViewportAnchorY,
    getAutoPlayViewportMetrics,
} from '../../auto-play-map-viewport.js';
import { getFollowCameraPadding } from '../follow-camera-padding.js';

function assertApproximatelyEqual(actual, expected) {
    assert.ok(Math.abs(actual - expected) < Number.EPSILON * 100);
}

function getCameraAnchor({ height, padding, width }) {
    return {
        x: (padding.paddingLeft + width - padding.paddingRight) / 2,
        y: (padding.paddingTop + height - padding.paddingBottom) / 2,
    };
}

function getFollowPadding(viewportMetrics) {
    return getFollowCameraPadding({
        followViewportAnchorY:
            getAutoPlayFollowViewportAnchorY(viewportMetrics),
        followViewportBottomOffset: 0,
        followViewportYRatio: 0.9,
        maxTopPaddingRatio: 0.95,
        viewportHeight: viewportMetrics.height,
        viewportInsets: viewportMetrics.cameraPadding,
    });
}

describe('Auto Play map viewport geometry', () => {
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
            padding: getFollowPadding(viewportMetrics),
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

    test('anchors each host layout inside its live visible rectangle', () => {
        const layouts = [
            {
                expected: { x: 960, y: 972 },
                name: 'widescreen dedicated',
                safeAreaInsets: { bottom: 0, left: 0, right: 0, top: 0 },
                windowInfo: { height: 1080, width: 1920 },
            },
            {
                expected: { x: 1110, y: 654 },
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
                expected: { x: 600, y: 1728 },
                name: 'portrait dedicated',
                safeAreaInsets: { bottom: 0, left: 120, right: 0, top: 0 },
                windowInfo: { height: 1920, width: 1080 },
            },
            {
                expected: { x: 600, y: 1152 },
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

        layouts.forEach(({ expected, name, safeAreaInsets, windowInfo }) => {
            const viewportMetrics = getAutoPlayViewportMetrics({
                safeAreaInsets,
                windowInfo,
            });
            const anchor = getCameraAnchor({
                height: viewportMetrics.height,
                padding: getFollowPadding(viewportMetrics),
                width: viewportMetrics.width,
            });

            assertApproximatelyEqual(anchor.x, expected.x);
            assertApproximatelyEqual(anchor.y, expected.y);
            assert.ok(
                anchor.y < viewportMetrics.visibleRect.bottom,
                `${name} should keep the location above the visible bottom`,
            );
            assertApproximatelyEqual(
                viewportMetrics.visibleRect.bottom - anchor.y,
                viewportMetrics.visibleHeight * 0.1,
            );
        });
    });
});
