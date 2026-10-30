import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';
import {
    getDuoMapSheetLayout,
    getDuoTrailCameraPadding,
} from '../duo-map-sheet-layout.js';

test('tablet map detail and trail cameras clear the fixed left pane', () => {
    const insets = { top: 24, bottom: 36, left: 0, right: 0 };
    const details = getDuoMapSheetLayout(834, insets, 1194, true);
    assert.equal(details.sheetHeight, 760);
    assert.deepEqual(details.cameraPadding, [48, 24, 24, 442]);
    assert.deepEqual(
        getDuoTrailCameraPadding(insets, 76, 110, 1194, true),
        [48, 64, 60, 482],
    );
});

test('the closed Duo leaves its map visible above the sheet and clear of the rail', () => {
    const layout = getDuoMapSheetLayout(678, {
        top: 0,
        bottom: 20,
        left: 0,
        right: 84,
    });
    assert.equal(layout.sheetHeight, 352.56);
    assert.deepEqual(layout.cameraPadding, [32, 108, 376.56, 24]);
    assert.ok(678 - layout.cameraPadding[0] - layout.cameraPadding[2] > 200);
});

test('the map sheet follows window size and supports a leading rail', () => {
    const insets = { top: 12, bottom: 20, left: 84, right: 0 };
    const closed = getDuoMapSheetLayout(678, insets);
    const open = getDuoMapSheetLayout(982, insets);
    assert.ok(open.sheetHeight > closed.sheetHeight);
    assert.deepEqual(open.cameraPadding.slice(0, 2), [44, 24]);
    assert.equal(open.cameraPadding[3], 108);
    assert.ok(open.sheetHeight < 982 - 150);
});

test('an open Duo moves Scorecard details beside the map instead of leaving a narrow bottom panel', () => {
    const layout = getDuoMapSheetLayout(
        678,
        { top: 0, bottom: 16, left: 0, right: 84 },
        982,
    );
    assert.equal(layout.sheetHeight, 650);
    assert.deepEqual(layout.cameraPadding, [24, 108, 24, 461]);
});

test('trail camera fits between its measured floating cards and clears either rail edge', () => {
    for (const insets of [
        { top: 0, bottom: 16, left: 0, right: 84 },
        { top: 44, bottom: 20, left: 84, right: 0 },
    ]) {
        const padding = getDuoTrailCameraPadding(insets, 72, 138);
        assert.deepEqual(padding, [
            insets.top + 96,
            insets.right + 24,
            insets.bottom + 194,
            insets.left + 24,
        ]);
        assert.ok(678 - padding[0] - padding[2] > 300);
        assert.ok(
            padding[2] - (insets.bottom + 12 + 138) >= 40,
            'camera marker and its timestamp clear the legend',
        );
        assert.ok(
            padding[3] < 120,
            'the trail uses the whole map rather than excluding a half-width detail pane',
        );
    }
});

test('open portrait Scorecard details stay below the map like the closed Duo', () => {
    const insets = { top: 44, bottom: 20, left: 0, right: 0 };
    assert.deepEqual(
        getDuoMapSheetLayout(982, insets, 678),
        getDuoMapSheetLayout(982, insets, 466),
    );
});

for (const scheme of ['light', 'dark']) {
    for (const floatingHeader of [false, true]) {
        for (const platform of ['ios', 'android']) {
            test(`${platform} map-sheet Close stays above the ${floatingHeader ? 'trail header' : 'detail sheet'} in ${scheme} mode`, () => {
                let closeCount = 0;
                const onClose = () => closeCount++;
                const { DuoMapSheet } = loadTourModule(
                    new URL('../duo-map-sheet.js', import.meta.url),
                    {
                        'react-native': {
                            Platform: { OS: platform },
                            Pressable: 'Pressable',
                            ScrollView: 'ScrollView',
                            View: 'View',
                            useColorScheme: () => scheme,
                            useWindowDimensions: () => ({
                                width: 1194,
                                height: 834,
                            }),
                        },
                        '../../lib/safe-area-insets': {
                            useSafeAreaInsets: () => ({
                                top: 42,
                                bottom: 20,
                                left: 0,
                                right: 0,
                            }),
                        },
                        '../root/native-navigation': {
                            NativeNavigationAction: 'NativeNavigationAction',
                        },
                        '../root/duo-device-context': {
                            DuoPaneContentContext: { Provider: 'PaneProvider' },
                        },
                        '../design-system/icon': { Icon: 'Icon' },
                    },
                );
                const tree = DuoMapSheet({
                    tabletDevice: platform === 'ios',
                    onClose,
                    header: floatingHeader ? 'Long trail heading' : undefined,
                    footer: floatingHeader ? 'Legend' : undefined,
                    children: 'Long camera title',
                    map: 'Map',
                    sheetHeight: 758,
                });
                const layers = tree.props.children.filter(Boolean);
                const action = layers.at(-1);
                assert.equal(
                    action.type,
                    'NativeNavigationAction',
                    'Close renders after every floating surface',
                );
                assert.equal(action.props.kind, 'close');
                const button = action.props.children;
                assert.equal(button.props.accessibilityLabel, 'Close');
                assert.equal(button.props.style.top, 64);
                assert.equal(
                    button.props.style.right,
                    platform === 'ios' ? 784 : 617,
                );
                assert.equal(button.props.style.zIndex, 10);
                assert.equal(
                    button.props.children.props.color,
                    scheme === 'dark' ? '#F5F7F9' : '#11151B',
                );
                button.props.onPress();
                assert.equal(closeCount, 1);
                action.props.onPress();
                assert.equal(
                    closeCount,
                    2,
                    'native Close uses the same callback',
                );
            });
        }
    }
}

test('Android Fold trail camera leaves the complete left pane clear', () => {
    const padding = getDuoTrailCameraPadding(
        { top: 24, bottom: 24, left: 0, right: 0 },
        76,
        110,
        852,
        false,
        true,
    );
    assert.deepEqual(padding, [48, 64, 48, 478]);
    assert.ok(852 - padding[1] - padding[3] > 300);
});
