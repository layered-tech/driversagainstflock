import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
    getSpeedLimitBadgeLayout,
    MOBILE_SPEED_LIMIT_BADGE_SIZE,
    SPEED_LIMIT_BADGE_SIZES,
} from '../speed-limit-layout.js';

function assertApproximatelyEqual(actual, expected) {
    assert.ok(Math.abs(actual - expected) < Number.EPSILON * 100);
}

describe('getSpeedLimitBadgeLayout', () => {
    test('shares the same modest iOS reduction across phone and CarPlay badges and fallback pucks', async () => {
        const { getNavigationPuckSize } =
            await import('../navigation-puck-layout.js');
        for (const size of ['sm', 'md', 'lg', 62]) {
            const android = getSpeedLimitBadgeLayout(size, {
                platform: 'android',
            });
            const ios = getSpeedLimitBadgeLayout(size, { platform: 'ios' });
            assertApproximatelyEqual(ios.signWidth, android.signWidth * 0.85);
            assert.deepEqual(android, getSpeedLimitBadgeLayout(size));
        }
        for (const variant of ['default', 'auto-play']) {
            for (const viewport of [
                {},
                { viewportHeight: 480, viewportWidth: 800 },
            ]) {
                const options = { variant, ...viewport };
                const android = getNavigationPuckSize({
                    ...options,
                    platform: 'android',
                });
                const ios = getNavigationPuckSize({
                    ...options,
                    platform: 'ios',
                });
                assertApproximatelyEqual(ios, android * 0.85);
                assert.equal(android, getNavigationPuckSize(options));
            }
        }
    });
    test('matches every named design-system size', () => {
        assert.equal(getSpeedLimitBadgeLayout('sm').signWidth, 44);
        assert.equal(getSpeedLimitBadgeLayout('md').signWidth, 58);
        assert.equal(getSpeedLimitBadgeLayout('lg').signWidth, 80);
        assert.deepEqual(SPEED_LIMIT_BADGE_SIZES, {
            sm: 44,
            md: 58,
            lg: 80,
        });
    });

    test('derives the design-system corner geometry from a raw size', () => {
        const layout = getSpeedLimitBadgeLayout(72);

        assertApproximatelyEqual(layout.signHeight, 86.4);
        assertApproximatelyEqual(layout.signOuterWidth, 78.48);
        assertApproximatelyEqual(layout.signOuterHeight, 92.88);
        assertApproximatelyEqual(layout.currentSpeedContentDiameter, 33.12);
        assertApproximatelyEqual(layout.currentSpeedDiameter, 43.2);
        assertApproximatelyEqual(layout.currentSpeedCornerOverhang, 16.56);
        assert.equal(layout.containerWidth, 72);
        assertApproximatelyEqual(layout.containerHeight, 102.96);

        const dialCenterX =
            layout.containerWidth +
            layout.currentSpeedCornerOverhang -
            layout.currentSpeedDiameter / 2;
        const dialCenterY =
            layout.containerHeight - layout.currentSpeedDiameter / 2;

        assertApproximatelyEqual(
            dialCenterX,
            layout.signWidth - layout.currentSpeedBorderWidth,
        );
        assertApproximatelyEqual(
            dialCenterY,
            layout.signHeight - layout.currentSpeedBorderWidth,
        );

        const horizontalOverlap =
            layout.signOuterWidth -
            (layout.containerWidth +
                layout.currentSpeedCornerOverhang -
                layout.currentSpeedDiameter);

        assert.ok(horizontalOverlap / layout.currentSpeedDiameter > 0.75);
    });

    test('falls back to md for unsupported sizes', () => {
        assert.deepEqual(
            getSpeedLimitBadgeLayout('unsupported'),
            getSpeedLimitBadgeLayout('md'),
        );
        assert.deepEqual(
            getSpeedLimitBadgeLayout(Number.NaN),
            getSpeedLimitBadgeLayout('md'),
        );
    });

    test('uses the contextual sizes from the navigation designs', () => {
        assert.equal(
            getSpeedLimitBadgeLayout(MOBILE_SPEED_LIMIT_BADGE_SIZE).signWidth,
            80,
        );
        assert.equal(
            getSpeedLimitBadgeLayout(AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE)
                .signWidth,
            62,
        );
    });

    test('uses native iOS number line boxes without changing Android metrics', () => {
        const iosLayout = getSpeedLimitBadgeLayout('lg', {
            platform: 'ios',
        });
        const androidLayout = getSpeedLimitBadgeLayout('lg', {
            platform: 'android',
        });

        assert.equal(iosLayout.valueLineHeight, undefined);
        assert.equal(iosLayout.currentSpeedLineHeight, undefined);
        assertApproximatelyEqual(
            androidLayout.valueLineHeight,
            androidLayout.valueFontSize * 0.92,
        );
        assert.equal(
            androidLayout.currentSpeedLineHeight,
            androidLayout.currentSpeedFontSize,
        );
    });
});
