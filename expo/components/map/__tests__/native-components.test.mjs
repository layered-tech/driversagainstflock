import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createBottomSheetModalLifecycle } from '../bottom-sheet-modal-lifecycle.js';
import { createHookHarness } from './tour-test-helpers.mjs';

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
        './responsive-map-layout': {},
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
        'react-native': { useWindowDimensions: () => ({ width: 400 }) },
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
