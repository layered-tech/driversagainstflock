import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getAutoPlaySpeedLimitOverlayLayout } from '../../auto-play-map-status-layout.js';
import {
    AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE,
    getSpeedLimitBadgeLayout,
} from '../speed-limit-layout.js';

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
