import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    getAutoPlayCurrentRoadPillLayout,
    getAutoPlaySpeedLimitOverlayLayout,
    getAutoPlayTopRightStatusOverlayLayout,
} from '../../auto-play-map-status-layout.js';
import {
    AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
    getSpeedLimitBadgeLayout,
} from '../speed-limit-layout.js';

const androidAutoMapSurfaceSource = readFileSync(
    new URL('../../android-auto-map-surface.js', import.meta.url),
    'utf8',
);
const carPlayMapSurfaceSource = readFileSync(
    new URL('../../carplay-map-surface.js', import.meta.url),
    'utf8',
);
const mapStatusOverlaySource = readFileSync(
    new URL('../../auto-play-map-status-overlay.js', import.meta.url),
    'utf8',
);
const mapSurfaceContentSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const currentRoadContextSource = readFileSync(
    new URL('../current-road-context.js', import.meta.url),
    'utf8',
);

describe('Auto Play speed-limit layout', () => {
    test('aligns the visible right and bottom edges to the control inset', () => {
        const mapControlLayoutInsets = {
            bottom: 37,
            left: 25,
            right: 29,
            top: 21,
        };
        const overlayLayout = getAutoPlaySpeedLimitOverlayLayout({
            mapControlLayoutInsets,
            size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
        });
        const badgeLayout = getSpeedLimitBadgeLayout(
            AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
        );
        const viewport = { height: 800, width: 1000 };
        const frameLeft =
            viewport.width -
            overlayLayout.positionStyle.right -
            overlayLayout.alignmentFrameStyle.width;
        const frameTop =
            viewport.height -
            overlayLayout.positionStyle.bottom -
            overlayLayout.alignmentFrameStyle.height;
        const currentSpeedRight =
            frameLeft +
            badgeLayout.containerWidth +
            badgeLayout.currentSpeedCornerOverhang;
        const currentSpeedBottom = frameTop + badgeLayout.containerHeight;

        assert.equal(
            currentSpeedRight,
            viewport.width - mapControlLayoutInsets.right,
        );
        assert.equal(
            currentSpeedBottom,
            viewport.height - mapControlLayoutInsets.bottom,
        );
        assert.deepEqual(overlayLayout.positionStyle, {
            bottom: 37,
            right: 29,
        });
    });
});

describe('Auto Play top-right status layout', () => {
    test('aligns alerts and route loading to the same safe-area edge', () => {
        const mapControlLayoutInsets = {
            bottom: 37,
            left: 25,
            right: 29,
            top: 21,
        };

        assert.deepEqual(
            getAutoPlayTopRightStatusOverlayLayout({
                mapControlLayoutInsets,
            }).positionStyle,
            {
                right: 29,
                top: 21,
            },
        );
    });
});

describe('Auto Play current-road pill layout', () => {
    const mapControlLayoutInsets = {
        bottom: 12,
        left: 12,
        right: 12,
        top: 12,
    };

    test('truncates portrait labels before the speed-limit badge', () => {
        const viewportMetrics = {
            visibleRect: { left: 0, right: 400 },
            width: 400,
        };
        const currentRoadPillLayout = getAutoPlayCurrentRoadPillLayout({
            mapControlLayoutInsets,
            size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
            viewportMetrics,
        });
        const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
            mapControlLayoutInsets,
            size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
        });
        const speedLimitLeft =
            viewportMetrics.width -
            speedLimitOverlayLayout.positionStyle.right -
            speedLimitOverlayLayout.alignmentFrameStyle.width;
        const roadPillRight =
            (viewportMetrics.visibleRect.left +
                viewportMetrics.visibleRect.right) /
                2 +
            currentRoadPillLayout.maximumWidth / 2;

        assert.ok(roadPillRight <= speedLimitLeft - 16);
    });

    test('keeps wide-display labels comfortably bounded', () => {
        assert.equal(
            getAutoPlayCurrentRoadPillLayout({
                mapControlLayoutInsets,
                size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
                viewportMetrics: {
                    visibleRect: { left: 0, right: 800 },
                    width: 800,
                },
            }).maximumWidth,
            320,
        );
    });

    test('leaves the existing layout unconstrained until the viewport mounts', () => {
        assert.equal(
            getAutoPlayCurrentRoadPillLayout({
                mapControlLayoutInsets,
                size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
                viewportMetrics: {},
            }).maximumWidth,
            undefined,
        );
    });

    test('shares the larger road text while truncating only on Android Auto', () => {
        assert.match(
            androidAutoMapSurfaceSource,
            /currentRoadPill:\s*\{[\s\S]*?reserveSpeedLimitSpace:\s*true,[\s\S]*?textStyle:\s*\{[\s\S]*?fontSize:\s*14,[\s\S]*?lineHeight:\s*20/,
        );
        assert.doesNotMatch(carPlayMapSurfaceSource, /currentRoadPill:/);
        assert.match(
            mapStatusOverlaySource,
            /currentRoadPill\?\.reserveSpeedLimitSpace[\s\S]*?getAutoPlayCurrentRoadPillLayout/,
        );
        assert.match(
            mapStatusOverlaySource,
            /currentRoadPillStyle=[\s\S]*?maxWidth:[\s\S]*?currentRoadPillLayout\.maximumWidth/,
        );
        assert.match(
            mapStatusOverlaySource,
            /currentRoadPillTextStyle=\{currentRoadPill\?\.textStyle\}/,
        );
        assert.match(
            currentRoadContextSource,
            /text-\[16px\][\s\S]*?leading-\[22px\][\s\S]*?ellipsizeMode="tail"[\s\S]*?style=\{textStyle\}/,
        );
    });

    test('reuses the shared driving stack on the Android Auto cluster', () => {
        assert.match(
            androidAutoMapSurfaceSource,
            /showDrivingStatusOnSecondarySurfaces:\s*true/,
        );
        assert.match(
            mapSurfaceContentSource,
            /getAutoPlayDrivingStatusVisibility\(\{[\s\S]*?showDrivingStatusOnSecondarySurfaces/,
        );
        assert.match(
            mapSurfaceContentSource,
            /freeDriveIsActive=\{[\s\S]*?secondaryDrivingStatusIsVisible/,
        );
        assert.match(
            mapStatusOverlaySource,
            /useRouteSpeedLimit\([\s\S]*?<DrivingLocationRoadStack[\s\S]*?onLocationAnchorLayout/,
        );
    });
});
