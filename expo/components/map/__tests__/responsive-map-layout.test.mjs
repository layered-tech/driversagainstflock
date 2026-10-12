import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    getResponsiveMapLayout,
    mapUsesSideSheetLayout,
} from '../responsive-map-layout.js';

test('compact and folded windows retain the phone layout', () => {
    for (const width of [320, 390, 448, 599]) {
        const layout = getResponsiveMapLayout(width);
        assert.equal(layout.isWide, false);
        assert.equal(layout.railWidth, 0);
        assert.equal(layout.paneWidth, width);
        assert.equal(layout.mapLeftInset, 0);
    }
});

test('unfolded panels stop before the center hinge with a twelve pixel gutter', () => {
    const layout = getResponsiveMapLayout(776);
    assert.equal(layout.isWide, true);
    assert.equal(layout.railWidth, 0);
    assert.equal(layout.paneWidth, 364);
    assert.equal(layout.mapLeftInset, 388);
    assert.equal(12 + layout.paneWidth + 12, 776 / 2);
});

test('tablet panes reserve the design rail and leave the remaining map usable', () => {
    const layout = getResponsiveMapLayout(1194);
    assert.equal(layout.railWidth, 84);
    assert.equal(layout.contentWidth, 1110);
    assert.equal(layout.paneWidth, 376);
    assert.equal(layout.mapLeftInset, 400);
    assert.equal(layout.contentWidth - layout.mapLeftInset, 710);
});

test('active navigation removes the tablet rail while retaining the steps pane', () => {
    const layout = getResponsiveMapLayout(1194, true);
    assert.equal(layout.railWidth, 0);
    assert.equal(layout.contentWidth, 1194);
    assert.equal(layout.mapLeftInset, 400);
});

test('pane geometry follows resizing, rotation and split screen without device identification', () => {
    for (const width of [600, 640, 776, 834, 1023, 1024, 1194, 1600]) {
        const layout = getResponsiveMapLayout(width);
        assert.ok(layout.paneWidth >= 276 && layout.paneWidth <= 376);
        assert.ok(layout.contentWidth - layout.mapLeftInset >= 300);
        assert.ok(layout.paneWidth + 24 <= layout.contentWidth / 2);
    }
    assert.equal(getResponsiveMapLayout(1194).isTablet, true);
    assert.equal(getResponsiveMapLayout(834).isTablet, false);
    assert.equal(getResponsiveMapLayout(390).isWide, false);
});

test('invalid dimensions never activate a rail or side pane', () => {
    for (const width of [NaN, Infinity, undefined, null, -1]) {
        assert.equal(mapUsesSideSheetLayout(width), false);
        assert.equal(getResponsiveMapLayout(width).railWidth, 0);
    }
});
