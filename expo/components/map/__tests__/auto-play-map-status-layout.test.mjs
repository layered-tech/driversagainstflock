import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    getAutoPlayCurrentRoadPillLayout,
    getAutoPlaySpeedLimitBadgeSize,
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
const androidAutoPlatformSource = readFileSync(
    new URL('../../auto-play-platform.android.js', import.meta.url),
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
const speedLimitSource = readFileSync(
    new URL('../speed-limit.js', import.meta.url),
    'utf8',
);
const mapSurfaceContentSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const currentRoadContextSource = readFileSync(
    new URL('../current-road-context.js', import.meta.url),
    'utf8',
);

describe('Auto Play speed-limit layout', () => {
    test('keeps the default badge aligned to the bottom-right control inset', () => {
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

    test('uses the Android Auto compact badge only for portrait map slots', () => {
        const layouts = [
            {
                expectedSize: 56,
                viewportMetrics: {
                    visibleHeight: 1080,
                    visibleWidth: 1042,
                },
            },
            {
                expectedSize: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
                viewportMetrics: {
                    visibleHeight: 720,
                    visibleWidth: 1280,
                },
            },
            {
                expectedSize: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
                viewportMetrics: {
                    visibleHeight: 800,
                    visibleWidth: 800,
                },
            },
            {
                expectedSize: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
                viewportMetrics: {},
            },
        ];

        layouts.forEach(({ expectedSize, viewportMetrics }) => {
            assert.equal(
                getAutoPlaySpeedLimitBadgeSize({
                    portraitSize: 56,
                    size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
                    viewportMetrics,
                }),
                expectedSize,
            );
        });
    });

    test('keeps the current-speed dial in the full badge frame without a limit', () => {
        assert.match(
            mapStatusOverlaySource,
            /getCurrentSpeedMph,[\s\S]*?const currentSpeedMps = getRouteCurrentSpeedMps\(userLocation\);[\s\S]*?const currentSpeedWithoutLimitIsVisible = Boolean\([\s\S]*?Platform\.OS === 'android'[\s\S]*?currentSpeedMph > 0,[\s\S]*?\);[\s\S]*?const speedStatusIsVisible =[\s\S]*?speedLimitIsVisible \|\| currentSpeedWithoutLimitIsVisible;/,
        );
        assert.match(
            mapStatusOverlaySource,
            /markerLoadingIsVisible \|\| speedStatusIsVisible[\s\S]*?speedStatusIsVisible \?[\s\S]*?style=\{speedLimitOverlayLayout\.alignmentFrameStyle\}[\s\S]*?<SpeedLimitSign[\s\S]*?currentSpeedMps=\{currentSpeedMps\}[\s\S]*?currentSpeedWithoutLimitVisible=\{[\s\S]*?currentSpeedWithoutLimitIsVisible[\s\S]*?\}[\s\S]*?speedLimit=\{speedLimit\}/,
        );
        assert.match(
            speedLimitSource,
            /currentSpeedWithoutLimitVisible = false,[\s\S]*?const currentSpeedDialIsVisible =[\s\S]*?speedLimitIsVisible \|\| currentSpeedWithoutLimitVisible[\s\S]*?if \(!speedLimitIsVisible && !currentSpeedDialIsVisible\) \{[\s\S]*?return null;/,
        );
        assert.match(
            speedLimitSource,
            /<View[\s\S]*?height: layout\.containerHeight,[\s\S]*?width: layout\.containerWidth,[\s\S]*?\{speedLimitIsVisible \? \([\s\S]*?\{currentSpeedDialIsVisible \? \(/,
        );
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
            gap: 8,
            mapControlLayoutInsets,
            size: 56,
            viewportMetrics,
        });
        const speedLimitOverlayLayout = getAutoPlaySpeedLimitOverlayLayout({
            mapControlLayoutInsets,
            size: 56,
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

        assert.ok(roadPillRight <= speedLimitLeft - 8);
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

    test('gives Android Auto road text more room with its compact gap', () => {
        const viewportMetrics = {
            visibleRect: { left: 0, right: 400 },
            width: 400,
        };
        const defaultLayout = getAutoPlayCurrentRoadPillLayout({
            mapControlLayoutInsets,
            size: 56,
            viewportMetrics,
        });
        const androidAutoLayout = getAutoPlayCurrentRoadPillLayout({
            gap: 8,
            mapControlLayoutInsets,
            size: 56,
            viewportMetrics,
        });

        assert.equal(
            androidAutoLayout.maximumWidth,
            defaultLayout.maximumWidth + 16,
        );
    });

    test('leaves the existing layout unconstrained until the viewport mounts', () => {
        assert.deepEqual(
            getAutoPlayCurrentRoadPillLayout({
                mapControlLayoutInsets,
                size: AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
                viewportMetrics: {},
            }),
            {
                maximumWidth: undefined,
            },
        );
    });

    test('uses surface-specific road text sizing', () => {
        assert.match(
            androidAutoMapSurfaceSource,
            /currentRoadPill:\s*\{[\s\S]*?reserveSpeedLimitSpace:\s*true,[\s\S]*?speedLimitGap:\s*8,[\s\S]*?speedLimitAdjacentTextStyle:\s*\{[\s\S]*?fontSize:\s*12,[\s\S]*?lineHeight:\s*16,[\s\S]*?textStyle:\s*\{[\s\S]*?fontSize:\s*14,[\s\S]*?lineHeight:\s*20/,
        );
        assert.doesNotMatch(
            carPlayMapSurfaceSource,
            /speedLimitGap|portraitSize/,
        );
        assert.match(
            carPlayMapSurfaceSource,
            /currentRoadPill:\s*\{[\s\S]*?textStyle:\s*\{[\s\S]*?fontSize:\s*11,[\s\S]*?lineHeight:\s*16/,
        );
        assert.match(
            mapStatusOverlaySource,
            /rendersSpeedLimit &&[\s\S]*?speedStatusIsVisible &&[\s\S]*?currentRoadPill\?\.reserveSpeedLimitSpace[\s\S]*?getAutoPlayCurrentRoadPillLayout\(\{[\s\S]*?gap:\s*currentRoadPill\.speedLimitGap/,
        );
        assert.match(
            mapStatusOverlaySource,
            /currentRoadPillStyle=[\s\S]*?maxWidth:[\s\S]*?currentRoadPillLayout\.maximumWidth/,
        );
        assert.match(
            mapStatusOverlaySource,
            /currentRoadPillTextStyle=\{[\s\S]*?rendersSpeedLimit[\s\S]*?currentRoadPill\?\.speedLimitAdjacentTextStyle[\s\S]*?currentRoadPill\?\.textStyle/,
        );
        assert.match(
            currentRoadContextSource,
            /text-\[16px\][\s\S]*?leading-\[22px\][\s\S]*?ellipsizeMode="tail"[\s\S]*?style=\{textStyle\}/,
        );
    });

    test('uses a dedicated map-only surface on the Android Auto cluster', () => {
        assert.match(
            autoPlaySource,
            /AutoPlayCluster\.setComponent\(\s*autoPlayPlatform\.ClusterSurface \?\? autoPlayPlatform\.MapSurface/,
        );
        assert.match(
            androidAutoMapSurfaceSource,
            /export const AndroidAutoClusterSurface = createAutoPlayMapSurface\(\{[\s\S]*?hostOwnsNavigationUI:\s*true/,
        );
        assert.match(
            androidAutoPlatformSource,
            /ClusterSurface:\s*AndroidAutoClusterSurface/,
        );
        assert.doesNotMatch(
            androidAutoMapSurfaceSource,
            /showDrivingStatusOnSecondarySurfaces|showSpeedLimitOnSecondarySurfaces/,
        );
        assert.doesNotMatch(
            androidAutoPlatformSource,
            /ClusterSurface:\s*AndroidAutoMapSurface/,
        );
        assert.doesNotMatch(
            androidAutoPlatformSource,
            /supportsSearchAutocomplete|usesHeaderDrivingModeButton/,
        );
    });

    test('keeps the root Android Auto status layout compact', () => {
        assert.match(
            androidAutoMapSurfaceSource,
            /speedLimitBadge:\s*\{[\s\S]*?portraitSize:\s*56/,
        );
        assert.match(
            mapSurfaceContentSource,
            /speedLimitBadge,[\s\S]*?<AutoPlayMapStatusOverlay[\s\S]*?speedLimitBadge=\{speedLimitBadge\}/,
        );
        assert.match(
            mapStatusOverlaySource,
            /const speedLimitBadgeSize = getAutoPlaySpeedLimitBadgeSize\([\s\S]*?size:\s*speedLimitBadgeSize,[\s\S]*?getAutoPlayCurrentRoadPillLayout\([\s\S]*?size:\s*speedLimitBadgeSize,[\s\S]*?<SpeedLimitSign[\s\S]*?size=\{speedLimitBadgeSize\}/,
        );
    });
});
