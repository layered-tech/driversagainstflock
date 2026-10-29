import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createBottomSheetModalLifecycle } from '../bottom-sheet-modal-lifecycle.js';
import {
    getDuoBottomSheetLayout,
    getDuoPaneLayout,
} from '../duo-bottom-sheet-layout.js';
import { createHookHarness } from './tour-test-helpers.mjs';
import * as responsiveMapLayout from '../responsive-map-layout.js';

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
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({ left: 0, right: 0 }),
        },
        'expo-status-bar': { useVerticalBarEdgeIOS: () => null },
        '../root/native-navigation': {
            NativeNavigationContainer: 'NativeNavigationContainer',
            useNativeNavigationActions: () => null,
            useNativeNavigationAction() {},
        },
        'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
        'react-native': {
            useWindowDimensions: () => ({ width: 466, height: 678 }),
        },
        'react-native-reanimated': {
            __esModule: true,
            default: { View: 'AnimatedView' },
            useSharedValue: (value) => ({ value }),
            useAnimatedStyle: (factory) => factory(),
        },
        './responsive-map-layout': {},
        './duo-bottom-sheet-layout': {
            getDuoBottomSheetLayout,
            getDuoPaneLayout,
        },
        '../root/duo-device-context': { useDuoDevice: () => false },
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
    const tree = components.NativeWindBottomSheet({});
    assert.equal(tree.props.accessible, false);
    const sheet = tree.type;
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

test('Duo sheet scrolling uses content padding without duplicating the window safe area', () => {
    const { NativeWindBottomSheetScrollView } = loadNativeComponents({
        '../root/duo-device-context': { useDuoDevice: () => true },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({ bottom: 50 }),
        },
    });
    const tree = NativeWindBottomSheetScrollView({
        className: 'bg-white dark:bg-daf-surface-dark',
        contentContainerStyle: { paddingBottom: 62, paddingHorizontal: 24 },
    });
    assert.deepEqual(tree.props.contentContainerStyle, {
        paddingBottom: 20,
        paddingHorizontal: 24,
    });
});

test('all modal callers use a stable guarded ref while Gorhom retains its own object ref', () => {
    const harness = createHookHarness();
    const frames = new Map();
    const navigationCalls = [];
    const parentActions = { label: 'parent registry' };
    let nextFrame = 0;
    let railEdge = null;
    let duoDevice = false;
    let tabletDevice = false;
    let dimensions = { width: 466, height: 678 };
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
            Platform: {
                get isPad() {
                    return tabletDevice;
                },
            },
            View: 'View',
            useColorScheme: () => 'dark',
            useWindowDimensions: () => dimensions,
        },
        './responsive-map-layout': responsiveMapLayout,
        'expo-status-bar': { useVerticalBarEdgeIOS: () => railEdge },
        '../root/duo-device-context': { useDuoDevice: () => duoDevice },
        '../../lib/safe-area-insets': {
            useSafeAreaInsets: () => ({
                top: 0,
                bottom: 16,
                left: 0,
                right: railEdge ? 84 : 0,
            }),
        },
        '../root/native-navigation': {
            NativeNavigationContainer: 'NativeNavigationContainer',
            useNativeNavigationActions: () => parentActions,
            useNativeNavigationAction: (options) =>
                navigationCalls.push(options),
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
    assert.equal(node.props.accessible, false);
    const host = node.props.containerComponent({ children: 'sheet' });
    assert.equal(
        host,
        'sheet',
        'standard phones must not have a native screen intercepting map controls above the sheet',
    );
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
    render();
    assert.equal(navigationCalls.at(-1).enabled, true);
    props = { ...props, nativeCloseAction: false };
    render();
    assert.equal(navigationCalls.at(-1).enabled, false);
    railEdge = 'trailing';
    duoDevice = true;
    props = { ...props, enableDynamicSizing: false, snapPoints: ['80%'] };
    const duo = render();
    const duoHost = duo.props.containerComponent({ children: 'sheet' });
    assert.equal(duoHost.type, 'View');
    assert.match(duoHost.props.className, /absolute inset-0/);
    assert.equal(duoHost.props.accessibilityViewIsModal, true);
    assert.equal(duoHost.props.children.props.inheritedActions, parentActions);
    assert.equal(duoHost.props.children.props.children.props.children, 'sheet');
    assert.equal(duo.props.enableDynamicSizing, true);
    assert.equal(duo.props.snapPoints, undefined);
    assert.equal(duo.props.maxDynamicContentSize, 447);
    assert.deepEqual(duo.props.style.at(-1), {
        marginLeft: 0,
        marginRight: 84,
    });
    assert.equal(duo.props.backgroundStyle.at(-1).backgroundColor, '#11151B');
    assert.equal(duo.props.backgroundStyle.at(-1).borderTopRightRadius, 22);
    dimensions = { width: 982, height: 678 };
    const open = render();
    assert.deepEqual(open.props.style.at(-1), {
        marginLeft: 12,
        marginRight: 545,
    });
    assert.equal(open.props.detached, true);
    assert.equal(open.props.enableContentPanningGesture, false);
    assert.equal(open.props.enableHandlePanningGesture, false);
    const floatingHost = open.props.containerComponent({ children: 'sheet' });
    const animatedPane = floatingHost.props.children.props.children;
    assert.equal(animatedPane.type, 'AnimatedView');
    assert.equal(animatedPane.props.style.transform[0].translateY, 14 - 678);
    assert.equal(open.props.bottomInset, 12);
    assert.equal(open.props.backgroundStyle.at(-1).borderBottomRightRadius, 24);
    assert.equal(open.props.handleComponent().props.className, 'h-3.5');
    assert.equal(duo.props.handleComponent, undefined);
    railEdge = null;
    dimensions = { width: 678, height: 982 };
    const portrait = render();
    assert.equal(portrait.props.detached, undefined);
    assert.equal(
        navigationCalls.at(-1).railOnly,
        false,
        'Open portrait Duo retains a native Close in the horizontal navigation bar',
    );
    assert.deepEqual(portrait.props.style.at(-1), {
        marginLeft: 0,
        marginRight: 0,
    });
    dimensions = { width: 982, height: 678 };
    props = { ...props, snapPoints: ['100%'], backdropComponent: 'Backdrop' };
    const centered = render();
    const centeredHost = centered.props.containerComponent({
        children: 'permission',
    });
    const backdrop = centered.props.backdropComponent({ animatedIndex: 0 });
    assert.equal(backdrop.props.children.type, 'Backdrop');
    assert.equal(
        centeredHost.props.children.props.children.props.style.transform[0]
            .translateY + backdrop.props.style.transform[0].translateY,
        0,
        'centering the card must not move the backdrop off the display',
    );
    assert.deepEqual(calls, ['new present', 'dismiss']);
    duoDevice = false;
    tabletDevice = true;
    dimensions = { width: 1194, height: 834 };
    props = { ...props, snapPoints: ['80%'] };
    const tablet = render();
    assert.deepEqual(tablet.props.style.at(-1), {
        marginLeft: 12,
        marginRight: 776,
    });
    assert.equal(tablet.props.detached, true);
    assert.equal(tablet.props.enableDynamicSizing, true);
    assert.equal(tablet.props.maxDynamicContentSize, 804);
    const tabletHost = tablet.props.containerComponent({
        children: 'tablet panel',
    });
    assert.equal(
        tabletHost.props.children.props.children.props.style.transform[0]
            .translateY,
        14 - 834,
    );
    props = {
        ...props,
        tabletPresentation: 'confirmation',
        backdropComponent: 'Backdrop',
        maxDynamicContentSize: 500,
        animatedPosition: { value: 500 },
    };
    const confirmation = render();
    assert.equal(confirmation.props.tabletPresentation, undefined);
    assert.deepEqual(confirmation.props.style.at(-1), {
        marginLeft: 387,
        marginRight: 387,
    });
    assert.equal(confirmation.props.enableDynamicSizing, true);
    assert.equal(confirmation.props.snapPoints, undefined);
    assert.equal(confirmation.props.maxDynamicContentSize, 500);
    assert.equal(
        confirmation.props.backgroundStyle.at(-1).borderBottomRightRadius,
        32,
    );
    const confirmationHost = confirmation.props.containerComponent({
        children: 'confirm',
    });
    const confirmationBackdrop = confirmation.props.backdropComponent({
        animatedIndex: 0,
    });
    const cardTranslation =
        confirmationHost.props.children.props.children.props.style.transform[0]
            .translateY;
    const backdropTranslation =
        confirmationBackdrop.props.style.transform[0].translateY;
    assert.equal(cardTranslation, (12 - 16 - 500) / 2);
    const measuredCardHeight =
        dimensions.height - 12 - props.animatedPosition.value;
    assert.equal(
        props.animatedPosition.value + cardTranslation + measuredCardHeight / 2,
        (dimensions.height - 16) / 2,
        'the measured content stays centered inside the safe display height',
    );
    assert.equal(cardTranslation + backdropTranslation, 0);
    assert.equal(confirmationBackdrop.props.children.type, 'Backdrop');
    ref.current.present();
    updated.props.onDismiss();
    harness.cleanup();
    flush();
    assert.deepEqual(calls, ['new present', 'dismiss']);
});
