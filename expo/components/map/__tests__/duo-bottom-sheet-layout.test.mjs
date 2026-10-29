import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    getDuoBottomSheetLayout,
    getDuoMapCenterPoint,
    getDuoPaneLayout,
} from '../duo-bottom-sheet-layout.js';
import { getTabletPaneLayout } from '../responsive-map-layout.js';

const insets = { top: 0, bottom: 16, left: 0, right: 84 };

test('tablet panes match the gallery width while fitting portrait and split windows', () => {
    assert.deepEqual(getTabletPaneLayout(1194), {
        left: 12,
        right: 776,
        width: 406,
    });
    assert.equal(getTabletPaneLayout(767), null);
    const narrow = getTabletPaneLayout(768, { left: 20, right: 20 });
    assert.equal(narrow.left, 32);
    assert.equal(narrow.width, 340);
    assert.ok(narrow.right >= narrow.width);
});

test('tablet sheets float at the left and permission cards stay centered', () => {
    const safe = { top: 24, bottom: 36, left: 0, right: 0 };
    const options = {
        tabletDevice: true,
        width: 1194,
        height: 834,
        insets: safe,
    };
    const pane = getDuoBottomSheetLayout(options);
    assert.deepEqual(pane.style, { marginLeft: 12, marginRight: 776 });
    assert.equal(pane.maxDynamicContentSize, 760);
    assert.equal(pane.detached, true);
    assert.equal(pane.enableContentPanningGesture, false);
    const centered = getDuoBottomSheetLayout({ ...options, fullScreen: true });
    assert.equal(
        1194 - centered.style.marginLeft - centered.style.marginRight,
        480,
    );
    assert.equal(centered.style.marginLeft, centered.style.marginRight);
    assert.equal(centered.enableDynamicSizing, true);
});

test('open Duo panes occupy the left half and reserve the rest for the map in landscape', () => {
    const landscape = getDuoPaneLayout(982, insets);
    assert.deepEqual(landscape, { left: 12, right: 545, width: 425 });
    assert.ok(landscape.right - insets.right > 400);
    assert.equal(getDuoPaneLayout(466, insets), null);
    const portrait = getDuoBottomSheetLayout({
        duoDevice: true,
        width: 678,
        height: 982,
        insets: { top: 44, bottom: 20, left: 0, right: 0 },
    });
    assert.equal(portrait.detached, undefined);
    assert.deepEqual(portrait.style, { marginLeft: 0, marginRight: 0 });
    assert.equal(portrait.maxDynamicContentSize, 648);
});

test('Duo sheets fit their content with a two-thirds ceiling and leave the rail over the map', () => {
    const layout = getDuoBottomSheetLayout({
        railEdge: 'trailing',
        height: 678,
        insets,
    });
    assert.deepEqual(layout.style, { marginLeft: 0, marginRight: 84 });
    assert.equal(layout.maxDynamicContentSize, 447);
    assert.equal(layout.enableDynamicSizing, true);
    assert.equal(layout.snapPoints, undefined);
});

test('shorter caller limits survive and a leading rail insets the whole sheet', () => {
    const layout = getDuoBottomSheetLayout({
        railEdge: 'leading',
        height: 678,
        insets: { ...insets, left: 84, right: 0 },
        maxDynamicContentSize: 250,
    });
    assert.equal(layout.maxDynamicContentSize, 250);
    assert.deepEqual(layout.style, { marginLeft: 84, marginRight: 0 });
});

test('full-screen permission forms keep their full height and ordinary phones keep caller detents', () => {
    assert.deepEqual(
        getDuoBottomSheetLayout({ railEdge: null, height: 844, insets }),
        {},
    );
    const fullScreen = getDuoBottomSheetLayout({
        railEdge: 'trailing',
        height: 678,
        insets,
        fullScreen: true,
    });
    assert.deepEqual(fullScreen, {
        bottomInset: 0,
        style: { marginLeft: 0, marginRight: 84 },
    });
});

test('open Duo onboarding uses a centered content-sized 480px card with space around every edge', () => {
    const layout = getDuoBottomSheetLayout({
        duoDevice: true,
        width: 982,
        height: 678,
        insets,
        fullScreen: true,
    });
    assert.equal(982 - layout.style.marginLeft - layout.style.marginRight, 480);
    assert.equal(
        layout.style.marginLeft,
        layout.style.marginRight - insets.right,
    );
    assert.equal(layout.enableDynamicSizing, true);
    assert.equal(layout.detached, true);
    assert.equal(layout.maxDynamicContentSize, 630);
});

test('open portrait uses the closed layout for panes, camera centers and full-screen sheets', () => {
    for (const width of [466, 678, 720, 767]) {
        assert.equal(getDuoPaneLayout(width, insets), null);
        assert.equal(getDuoMapCenterPoint(width, 982, insets), null);
        const layout = getDuoBottomSheetLayout({
            duoDevice: true,
            width,
            height: 982,
            insets,
            fullScreen: true,
        });
        assert.deepEqual(layout, {
            bottomInset: 0,
            style: { marginLeft: 0, marginRight: 84 },
        });
    }
    assert.ok(getDuoPaneLayout(768, insets));
});

test('tablet confirmation dialogs center a 420px content-sized card while keeping other devices unchanged', () => {
    const options = {
        tabletDevice: true,
        tabletPresentation: 'confirmation',
        width: 1194,
        height: 834,
        insets: { top: 24, bottom: 36, left: 0, right: 0 },
        maxDynamicContentSize: 600,
    };
    const layout = getDuoBottomSheetLayout(options);
    assert.equal(
        1194 - layout.style.marginLeft - layout.style.marginRight,
        420,
    );
    assert.equal(layout.style.marginLeft, layout.style.marginRight);
    assert.equal(layout.enableDynamicSizing, true);
    assert.equal(layout.snapPoints, undefined);
    assert.equal(layout.maxDynamicContentSize, 600);
    assert.equal(layout.enableContentPanningGesture, false);
    assert.equal(layout.enableHandlePanningGesture, false);
    const duo = { ...options, tabletDevice: false, duoDevice: true };
    assert.deepEqual(
        getDuoBottomSheetLayout(duo),
        getDuoBottomSheetLayout({ ...duo, tabletPresentation: 'pane' }),
    );
    const phone = {
        ...options,
        tabletDevice: false,
        duoDevice: false,
        width: 390,
    };
    assert.deepEqual(getDuoBottomSheetLayout(phone), {});
    const sidePane = getDuoBottomSheetLayout({
        ...options,
        tabletPresentation: 'pane',
    });
    assert.equal(
        1194 - sidePane.style.marginLeft - sidePane.style.marginRight,
        406,
    );
});
