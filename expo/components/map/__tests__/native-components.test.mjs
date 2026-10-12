import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createBottomSheetModalLifecycle } from '../bottom-sheet-modal-lifecycle.js';
import { createHookHarness } from './tour-test-helpers.mjs';
import { getResponsiveMapLayout } from '../responsive-map-layout.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function loadNativeComponents(overrides = {}) {
    const module = { exports: {} };
    const source = transformSync(
        readFileSync(
            new URL('../native-components.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                [
                    require('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
                require('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    ).code;
    const mocks = {
        '@gorhom/bottom-sheet': {
            __esModule: true,
            default: 'BottomSheet',
            BottomSheetModal: 'BottomSheetModal',
            BottomSheetFlatList: 'BottomSheetFlatList',
            BottomSheetScrollView: 'BottomSheetScrollView',
            BottomSheetView: 'BottomSheetView',
            TouchableOpacity: 'BottomSheetTouchableOpacity',
        },
        '@rnmapbox/maps': { MapView: 'MapView' },
        'expo-glass-effect': { GlassView: 'GlassView' },
        nativewind: {
            cssInterop: (component, mapping) => ({
                component,
                mapping,
                resolvesStyles: true,
            }),
            remapProps: (component, mapping) => ({
                component,
                mapping,
                resolvesStyles: false,
            }),
        },
        react: { forwardRef: (fn) => fn },
        'react-native': {},
        './use-responsive-map-layout': {
            useResponsiveMapLayout: () => ({ isWide: false }),
        },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({
                top: 24,
                bottom: 28,
                left: 0,
                right: 0,
            }),
        },
        '../design-system/icon': { Icon: 'Icon' },
        './safe-area-view-with-bottom-offset': {},
        ...overrides,
    };
    new Function('require', 'module', 'exports', source)(
        (name) => mocks[name],
        module,
        module.exports,
    );

    return module.exports;
}

test('the persistent bottom sheet resolves themed styles before passing them to the library', () => {
    const components = loadNativeComponents();
    const sheet = components.NativeWindBottomSheet;
    assert.equal(sheet.component, 'BottomSheet');
    assert.equal(
        sheet.resolvesStyles,
        true,
        'Gorhom renders its background without NativeWind, so deferred class placeholders leave the default white background',
    );
    assert.deepEqual(sheet.mapping, {
        backgroundClassName: 'backgroundStyle',
        handleIndicatorClassName: 'handleIndicatorStyle',
    });
    const touchable = components.NativeWindBottomSheetTouchableOpacity;
    assert.equal(touchable.component, 'BottomSheetTouchableOpacity');
    assert.equal(touchable.resolvesStyles, true);
    assert.deepEqual(touchable.mapping, { className: 'style' });
});

test('wide modals dock beside the rail and restore phone snap points on resize', () => {
    const harness = createHookHarness();
    let width = 1194;
    let lifecycleOptions;
    const { NativeWindBottomSheetModal } = loadNativeComponents({
        react: {
            ...harness.react,
            forwardRef: (fn) => fn,
            useLayoutEffect: harness.react.useEffect,
            useImperativeHandle: (ref, factory) => {
                ref.current = factory();
            },
        },
        'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
        'react-native': { useColorScheme: () => 'dark' },
        './use-responsive-map-layout': {
            useResponsiveMapLayout: () => ({
                ...getResponsiveMapLayout(width),
                width,
            }),
        },
        './bottom-sheet-modal-lifecycle': {
            createBottomSheetModalLifecycle: (options) => {
                lifecycleOptions = options;
                return { activate() {}, setModal() {}, dispose() {} };
            },
        },
    });
    const ref = { current: null };
    const props = { snapPoints: ['40%', '80%'], enablePanDownToClose: true };
    const render = () =>
        harness.render(() => NativeWindBottomSheetModal(props, ref));
    const wideSheet = render();
    assert.deepEqual(wideSheet.props.snapPoints, ['100%']);
    assert.deepEqual(wideSheet.props.style[0], {
        marginLeft: 96,
        marginRight: 722,
    });
    assert.equal(wideSheet.props.topInset, 36);
    assert.equal(wideSheet.props.bottomInset, 40);
    assert.equal(wideSheet.props.backdropComponent, null);
    assert.equal(wideSheet.props.enablePanDownToClose, false);
    assert.equal(typeof wideSheet.props.handleComponent, 'function');
    const snapped = [];
    wideSheet.props.ref.current = {
        snapToIndex: (index) => snapped.push(index),
    };
    lifecycleOptions.getModal().snapToIndex(1);
    assert.deepEqual(snapped, [0]);
    const originalRef = ref.current;
    width = 390;
    const phoneSheet = render();
    assert.equal(ref.current, originalRef);
    assert.deepEqual(phoneSheet.props.snapPoints, ['40%', '80%']);
    assert.equal(phoneSheet.props.enablePanDownToClose, true);
    assert.equal(phoneSheet.props.style[0], null);
});

test('all modal callers use a stable guarded ref while Gorhom retains its own object ref', () => {
    const harness = createHookHarness();
    const frames = new Map();
    let nextFrame = 0;
    const { NativeWindBottomSheetModal } = loadNativeComponents({
        react: {
            ...harness.react,
            forwardRef: (fn) => fn,
            useLayoutEffect: harness.react.useEffect,
            useImperativeHandle: (ref, factory) => {
                ref.current = factory();
            },
        },
        'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
        'react-native': {
            useColorScheme: () => 'light',
            View: 'View',
            Pressable: 'Pressable',
        },
        './bottom-sheet-modal-lifecycle': {
            createBottomSheetModalLifecycle: (options) =>
                createBottomSheetModalLifecycle({
                    ...options,
                    requestFrame: (callback) => {
                        frames.set(++nextFrame, callback);
                        return nextFrame;
                    },
                    cancelFrame: (id) => frames.delete(id),
                }),
        },
    });
    const ref = { current: null };
    const changes = [];
    let props = { onChange: (index) => changes.push(['old', index]) };
    const render = () =>
        harness.render(() => NativeWindBottomSheetModal(props, ref));
    const node = render();
    const guardedRef = ref.current;
    assert.equal(
        typeof node.props.ref,
        'object',
        'Gorhom stores this ref in its modal stack',
    );
    const calls = [];
    node.props.ref.current = {
        present: () => calls.push('old present'),
        dismiss: () => calls.push('dismiss'),
    };
    ref.current.dismiss();
    ref.current.present();
    // Gorhom replaces its imperative handle when its own mount state changes.
    node.props.ref.current = {
        present: () => calls.push('new present'),
        dismiss: () => calls.push('dismiss'),
    };
    const flush = () => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback());
    };
    flush();
    assert.deepEqual(calls, ['new present']);
    ref.current.dismiss();
    assert.deepEqual(calls, ['new present']);
    props = { onChange: (index) => changes.push(['new', index]) };
    const updated = render();
    assert.equal(ref.current, guardedRef);
    updated.props.onChange(0);
    assert.deepEqual(changes, [['new', 0]]);
    assert.deepEqual(calls, ['new present', 'dismiss']);
    ref.current.present();
    updated.props.onDismiss();
    harness.cleanup();
    flush();
    assert.deepEqual(calls, ['new present', 'dismiss']);
});
