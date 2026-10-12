import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getResponsiveCameraPadding } from '../camera-padding-geometry.js';
import { getResponsiveMapLayout } from '../responsive-map-layout.js';

test('route fitting keeps its center in the exposed map beside each design pane', () => {
    for (const width of [600, 776, 1024, 1194, 1600]) {
        const layout = getResponsiveMapLayout(width);
        const [top, right, bottom, left] = getResponsiveCameraPadding({
            windowWidth: layout.contentWidth,
            windowHeight: 844,
            horizontalPadding: 24,
            topPadding: 64,
            minBottomPadding: 400,
            sideSheetLayoutIsActive: true,
            sidePaneWidth: layout.mapLeftInset,
        });
        assert.equal(top, 64);
        assert.equal(bottom, right);
        assert.equal(left, layout.mapLeftInset + right);
        assert.ok(layout.contentWidth - left - right >= 240);
        assert.ok(
            (left + layout.contentWidth - right) / 2 > layout.mapLeftInset,
        );
    }
});

test('phone route fitting leaves the minimum visible viewport above its sheet', () => {
    const [top, right, bottom, left] = getResponsiveCameraPadding({
        windowWidth: 390,
        windowHeight: 844,
        horizontalPadding: 24,
        topPadding: 104,
        minBottomPadding: 520,
        sideSheetLayoutIsActive: false,
    });
    assert.equal(left, right);
    assert.ok(bottom >= 520);
    assert.ok(844 - top - bottom >= 120);
});

test('short split-screen windows never acquire negative padding', () => {
    const padding = getResponsiveCameraPadding({
        windowWidth: 600,
        windowHeight: 200,
        horizontalPadding: 24,
        topPadding: 100,
        minBottomPadding: 500,
        sideSheetLayoutIsActive: false,
    });
    assert.ok(padding.every((value) => value >= 0 && Number.isFinite(value)));
    assert.ok(padding[2] <= 100);
});
