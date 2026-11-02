import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    createNativeNavigationActions,
    getNativeNavigationHeader,
    resolveNativeNavigationActions,
} from '../../root/native-navigation-actions.js';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

test('the top overlay replaces underlying actions and dismissal restores them', () => {
    const actions = createNativeNavigationActions();
    const calls = [];
    const base = {
        kind: 'back',
        priority: 0,
        label: 'Back',
        onPress: () => calls.push('base'),
    };
    const search = {
        kind: 'back',
        priority: 300,
        label: 'Saved locations',
        onPress: () => calls.push('saved'),
    };
    const close = {
        kind: 'close',
        priority: 300,
        label: 'Cancel search',
        onPress: () => calls.push('close'),
    };
    const removeBase = actions.register('page', base);
    const panel = {
        kind: 'close',
        label: 'Close panel',
        priority: 200,
        onPress() {},
    };
    const removePanel = actions.register('panel', panel);
    const removeSearch = actions.register('search', search);
    const removeClose = actions.register('close', close);
    assert.deepEqual(actions.getSnapshot(), [search, close]);
    const header = getNativeNavigationHeader(actions.getSnapshot(), '#11151B');
    header.headerLeftBarButtonItems[0].onPress();
    header.headerRightBarButtonItems[0].onPress();
    assert.deepEqual(calls, ['saved', 'close']);
    removeClose();
    removeSearch();
    assert.deepEqual(actions.getSnapshot(), [panel]);
    removePanel();
    assert.deepEqual(actions.getSnapshot(), [base]);
    removeBase();
    assert.deepEqual(actions.getSnapshot(), []);
    assert.equal(getNativeNavigationHeader([], '#11151B').hidden, true);
});

test('Back and Close are native symbol bar items with priority, labels, and no custom views', () => {
    const header = getNativeNavigationHeader(
        [
            { kind: 'back', label: 'Back', onPress() {} },
            {
                kind: 'close',
                label: 'Close editor',
                onPress() {},
                tintColor: '#A9B2BD',
            },
        ],
        '#F5F7F9',
    );
    assert.equal(header.backgroundColor, 'transparent');
    assert.equal(header.translucent, true);
    assert.equal(header.hideShadow, true);
    assert.equal(header.hideBackButton, true);
    assert.equal(header.headerLeftBarButtonItems[0].icon.name, 'chevron.left');
    assert.equal(header.headerRightBarButtonItems[0].icon.name, 'xmark');
    assert.equal(
        header.headerRightBarButtonItems[0].accessibilityLabel,
        'Close editor',
    );
    assert.equal(header.headerRightBarButtonItems[0].tintColor, '#A9B2BD');
    for (const item of [
        ...header.headerLeftBarButtonItems,
        ...header.headerRightBarButtonItems,
    ]) {
        assert.equal(item.type, 'button');
        assert.equal(item.visibilityPriority, 'high');
        assert.equal(item.icon.type, 'sfSymbol');
        assert.equal(item.customView, undefined);
        assert.equal(item.width, 44);
    }
});

test('Duo tools retain design order and disabled state across remounts', () => {
    const actions = createNativeNavigationActions();
    actions.register('edit', {
        kind: 'tool',
        order: 5,
        label: 'Edit',
        symbol: 'pencil',
        priority: 0,
    });
    actions.register('recenter', {
        kind: 'tool',
        order: 4,
        label: 'Recenter',
        symbol: 'location',
        disabled: true,
        priority: 0,
    });
    actions.register('zoom', {
        kind: 'tool',
        order: 2,
        label: 'Zoom in',
        symbol: 'plus',
        priority: 0,
    });
    const items = getNativeNavigationHeader(
        actions.getSnapshot(),
        '#fff',
    ).headerRightBarButtonItems;
    assert.deepEqual(
        items.map((item) => item.icon.name),
        ['plus', 'location', 'pencil'],
    );
    assert.equal(items[1].disabled, true);
    assert.ok(items.every((item) => item.sharesBackground === false));
    const close = actions.register('panel', {
        kind: 'close',
        label: 'Close panel',
        priority: 200,
    });
    assert.deepEqual(
        actions.getSnapshot().map((item) => item.label),
        ['Close panel'],
    );
    close();
    assert.equal(actions.getSnapshot().length, 3);
});

test('native rail preserves template artwork, tint, badge and the action handler', () => {
    let presses = 0;
    const icon = { type: 'templateSource', templateSource: 17 };
    const items = getNativeNavigationHeader(
        [
            {
                kind: 'tool',
                label: 'Recenter',
                symbol: 'scope',
                icon,
                onPress: () => presses++,
                tintColor: '#1FBF6B',
                badge: 2,
            },
        ],
        '#11151B',
    ).headerRightBarButtonItems;
    assert.equal(items[0].icon, icon);
    assert.equal(items[0].tintColor, '#1FBF6B');
    assert.deepEqual(items[0].badge, { value: '2' });
    items[0].onPress();
    assert.equal(presses, 1);
});

test('route choices register Back beside a Close action at the same priority', () => {
    const actions = createNativeNavigationActions();
    const back = {
        kind: 'back',
        label: 'Back from route choices',
        priority: 200,
    };
    const close = { kind: 'close', label: 'Close panel', priority: 200 };
    actions.register('route', back);
    actions.register('panel', close);
    assert.deepEqual(actions.getSnapshot(), [back, close]);
});

function loadNavigation(platform, tablet = false) {
    const hooks = createHookHarness();
    const actions = createNativeNavigationActions();
    let focused = true;
    let duoDevice = false;
    let verticalBarEdge = null;
    let nextId = 0;
    let windowWidth = tablet ? 1194 : 390;
    const contexts = [];
    const styleResolvers = [];
    const react = {
        ...hooks.react,
        createContext(value) {
            const context = { value: contexts.length === 0 ? actions : value };
            contexts.push(context);
            return context;
        },
        useContext: (context) => context.value,
        useId: () => hooks.react.useRef(`action-${nextId++}`).current,
        useLayoutEffect: hooks.react.useEffect,
        useSyncExternalStore: (_, snapshot) => snapshot(),
    };
    const navigation = loadTourModule(
        new URL('../../root/native-navigation.js', import.meta.url),
        {
            react,
            'expo-router': { useIsFocused: () => focused },
            'expo-status-bar': { useVerticalBarEdgeIOS: () => verticalBarEdge },
            nativewind: {
                cssInterop: (component, mapping) => {
                    styleResolvers.push({ component, mapping });
                    return component;
                },
            },
            'react-native': {
                Platform: { OS: platform, isPad: tablet },
                View: 'View',
                useColorScheme: () => 'dark',
                useWindowDimensions: () => ({
                    width: windowWidth,
                    height: 834,
                }),
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({
                    top: 24,
                    bottom: 20,
                    left: 0,
                    right: 84,
                }),
                SafeAreaInsetsOverrideProvider:
                    'SafeAreaInsetsOverrideProvider',
            },
            'react-native-safe-area-context': {
                SafeAreaProvider: 'SafeAreaProvider',
            },
            'react-native-screens': {
                ScreenStack: 'ScreenStack',
                ScreenStackItem: 'ScreenStackItem',
            },
            './duo-device-context': { useDuoDevice: () => duoDevice },
            './native-navigation-actions': {
                createNativeNavigationActions,
                getNativeNavigationHeader,
                resolveNativeNavigationActions,
            },
        },
    );
    return {
        ...navigation,
        hooks,
        actions,
        contexts,
        styleResolvers,
        setDuoDevice: (value) => {
            duoDevice = value;
        },
        setFocused: (value) => {
            focused = value;
        },
        setVerticalBarEdge: (value) => {
            verticalBarEdge = value;
        },
        setWindowWidth: (value) => {
            windowWidth = value;
        },
    };
}

test('native screen hosts resolve NativeWind styles before forwarding to Fabric', () => {
    assert.deepEqual(loadNavigation('ios').styleResolvers, [
        { component: 'ScreenStack', mapping: { className: 'style' } },
        { component: 'ScreenStackItem', mapping: { className: 'style' } },
    ]);
});

test('tablet navigation keeps Close inside its pane without registering a window-wide bar', () => {
    const nav = loadNavigation('ios', true);
    const control = { type: 'Button', props: { onPress() {} } };
    const result = nav.hooks.render(() =>
        nav.NativeNavigationAction({
            kind: 'close',
            label: 'Close',
            children: control,
        }),
    );
    assert.equal(result, control);
    assert.deepEqual(nav.actions.getSnapshot(), []);
});

test('compact iPad windows retain native Close and switch cleanly to the tablet pane', () => {
    const nav = loadNavigation('ios', true);
    let presses = 0;
    const control = { type: 'Button', props: { onPress: () => presses++ } };
    const render = () =>
        nav.hooks.render(() =>
            nav.NativeNavigationAction({
                kind: 'close',
                label: 'Close',
                children: control,
            }),
        );
    nav.setWindowWidth(600);
    assert.equal(render(), null);
    assert.equal(nav.actions.getSnapshot().length, 1);
    nav.actions.getSnapshot()[0].onPress();
    assert.equal(presses, 1);
    nav.setWindowWidth(768);
    assert.equal(render(), control);
    assert.equal(nav.actions.getSnapshot().length, 0);
    nav.setWindowWidth(767);
    assert.equal(render(), null);
    assert.equal(nav.actions.getSnapshot().length, 1);
    nav.hooks.cleanup();
    assert.equal(nav.actions.getSnapshot().length, 0);
});

test('iOS content reserves horizontal rails and consumes their insets once', () => {
    const nav = loadNavigation('ios');
    const content = nav.HorizontalSafeAreaContent({ children: 'content' });
    assert.deepEqual(content.props.style, { paddingLeft: 0, paddingRight: 84 });
    assert.deepEqual(content.props.children.props.insets, {
        top: 24,
        bottom: 20,
        left: 0,
        right: 0,
    });
    assert.equal(
        content.props.children.props.children.props.children,
        'content',
    );
    nav.contexts[2].value = { left: 0, right: 84 };
    const header = nav.FullWidthSafeAreaBand({
        children: 'header',
        gutter: 16,
    });
    assert.deepEqual(header.props.style[0], {
        marginLeft: -0,
        marginRight: -84,
        paddingLeft: 16,
        paddingRight: 100,
    });
    assert.equal(
        loadNavigation('android').HorizontalSafeAreaContent({
            children: 'content',
        }),
        'content',
    );
});

test('information pages use horizontal safe content while the main map remains full bleed', () => {
    const nav = loadNavigation('ios');
    const map = nav.nativeNavigationScreenLayout({
        children: 'map',
        route: { name: 'index' },
    });
    const faq = nav.nativeNavigationScreenLayout({
        children: 'faq',
        route: { name: 'faqs' },
    });
    assert.equal(map.props.children, 'map');
    assert.equal(faq.props.children.type, nav.HorizontalSafeAreaContent);
    const hotlist = nav.nativeNavigationScreenLayout({
        children: 'hotlist',
        route: { name: 'hotlist' },
    });
    assert.equal(
        hotlist.props.children,
        'hotlist',
        'Hotlist insets its bands rather than clipping its header at the rail',
    );
});

test('Android retains its original controls and has no additional native container', () => {
    const nav = loadNavigation('android');
    const children = { type: 'ExistingButton', props: { onPress() {} } };
    assert.equal(nav.NativeNavigationContainer({ children }), children);
    assert.equal(
        nav.hooks.render(() =>
            nav.NativeNavigationAction({ children, onPress() {} }),
        ),
        children,
    );
    assert.deepEqual(nav.actions.getSnapshot(), []);
});

test('iOS registers only focused actions, uses the latest handler, and cleans up on unmount', () => {
    const nav = loadNavigation('ios');
    const calls = [];
    let onPress = () => calls.push('original');
    const render = () =>
        nav.hooks.render(() =>
            nav.NativeNavigationAction({
                onPress,
                kind: 'close',
                label: 'Close editor',
                children: 'custom',
                placeholder: 'space',
            }),
        );
    assert.equal(render(), 'space');
    const item = getNativeNavigationHeader(nav.actions.getSnapshot(), '#fff')
        .headerRightBarButtonItems[0];
    item.onPress();
    onPress = () => calls.push('latest');
    render();
    item.onPress();
    assert.deepEqual(calls, ['original', 'latest']);
    nav.setFocused(false);
    render();
    assert.deepEqual(nav.actions.getSnapshot(), []);
    nav.setFocused(true);
    render();
    assert.equal(nav.actions.getSnapshot().length, 1);
    nav.hooks.cleanup();
    assert.deepEqual(nav.actions.getSnapshot(), []);
});

test('iOS keeps non-navigation controls such as the Scorecard menu custom', () => {
    const nav = loadNavigation('ios');
    assert.equal(
        nav.hooks.render(() =>
            nav.NativeNavigationAction({ native: false, children: 'menu' }),
        ),
        'menu',
    );
    assert.deepEqual(nav.actions.getSnapshot(), []);
});

test('rail-only actions return to custom controls when the device leaves vertical-bar mode', () => {
    const nav = loadNavigation('ios');
    const render = () =>
        nav.hooks.render(() =>
            nav.NativeNavigationAction({
                railOnly: true,
                kind: 'tool',
                symbol: 'plus',
                label: 'Zoom in',
                children: 'custom',
                onPress() {},
            }),
        );
    assert.equal(render(), 'custom');
    assert.equal(nav.actions.getSnapshot().length, 0);
    nav.setVerticalBarEdge('trailing');
    assert.equal(render(), null);
    assert.equal(nav.actions.getSnapshot()[0].symbol, 'plus');
    nav.setVerticalBarEdge(null);
    assert.equal(render(), 'custom');
    assert.equal(nav.actions.getSnapshot().length, 0);
});

test('the native screen keeps every map edge unpadded and reserves only the measured control height', () => {
    const nav = loadNavigation('ios');
    const container = nav.NativeNavigationContainer({ children: 'map' });
    const tree = nav.hooks.render(() => container.type(container.props));
    const screen = tree.props.children.props.children;
    assert.equal(screen.type, 'ScreenStackItem');
    assert.deepEqual(screen.props.unstable_safeAreaEdges, {
        top: false,
        bottom: false,
        left: false,
        right: false,
    });
    assert.equal(screen.props.children.props.children.props.children, 'map');
    nav.contexts[1].value = 103;
    assert.equal(nav.useNativeNavigationTopInset(59), 103);
    nav.contexts[1].value = 0;
    assert.equal(nav.useNativeNavigationTopInset(59), 59);
});

test('a vertical Duo rail never reserves its height above the map', () => {
    const nav = loadNavigation('ios');
    const container = nav.NativeNavigationContainer({ children: 'map' });
    const render = () =>
        nav.hooks.render(() => container.type(container.props));
    let tree = render();
    const actions = tree.props.value;
    actions.register('close', {
        kind: 'close',
        label: 'Close',
        priority: 0,
        onPress() {},
    });
    tree.props.children.props.children.props.onHeaderHeightChange({
        nativeEvent: { headerHeight: 700 },
    });
    nav.setVerticalBarEdge('trailing');
    tree = render();
    assert.equal(
        tree.props.children.props.children.props.children.props.children.props
            .value,
        0,
    );
    nav.setVerticalBarEdge('leading');
    assert.equal(
        render().props.children.props.children.props.children.props.children
            .props.value,
        0,
    );
    nav.setVerticalBarEdge(null);
    assert.equal(
        render().props.children.props.children.props.children.props.children
            .props.value,
        700,
    );
});

test('all routed screens have a native host and native modals own their host', () => {
    const root = readFileSync(
        new URL('../../../app/_layout.js', import.meta.url),
        'utf8',
    );
    assert.match(
        root,
        /<Drawer\s+screenLayout=\{\s*nativeNavigationScreenLayout\s*\}/,
    );
    for (const file of [
        'map/route-export-modal.js',
        'contribute/camera-form.js',
    ]) {
        const source = readFileSync(
            new URL(`../../${file}`, import.meta.url),
            'utf8',
        );
        assert.match(
            source,
            /<Modal[\s\S]*?<NativeModalContent>[\s\S]*?<NativeNavigationAction[\s\S]*?kind="close"/,
        );
    }
});

test('native actions inherit the existing button handler and identifier', () => {
    const nav = loadNavigation('ios');
    let pressed = 0;
    const children = {
        type: 'Pressable',
        props: {
            onPress: () => {
                pressed++;
            },
            testID: 'existing-back-button',
        },
    };
    assert.equal(
        nav.hooks.render(() =>
            nav.NativeNavigationAction({ children, placeholder: 'space' }),
        ),
        'space',
    );
    const item = getNativeNavigationHeader(nav.actions.getSnapshot(), '#fff')
        .headerLeftBarButtonItems[0];
    assert.equal(item.identifier, 'existing-back-button');
    item.onPress();
    assert.equal(pressed, 1);
});

for (const platform of ['ios', 'android']) {
    for (const theme of ['light', 'dark']) {
        test(`${platform} system bars retain ${theme} icons and allow the Duo rail`, () => {
            const hooks = createHookHarness();
            const calls = [];
            const { SystemBars } = loadTourModule(
                new URL('../../root/system-bars.js', import.meta.url),
                {
                    react: hooks.react,
                    'react-native': {
                        Platform: { OS: platform },
                        useColorScheme: () => theme,
                    },
                    'expo-status-bar': { StatusBar: 'StatusBar' },
                    'expo-system-ui': {
                        setBackgroundColorAsync: (color) => {
                            calls.push(color);
                            return Promise.resolve();
                        },
                    },
                    'expo-navigation-bar': {
                        setStyle: (style) => calls.push(style),
                        setVisibilityAsync: () => Promise.resolve(),
                    },
                },
            );
            const tree = hooks.render(SystemBars);
            assert.equal(tree.props.style, theme === 'dark' ? 'light' : 'dark');
            assert.equal(tree.props.verticalBarBehaviorIOS, 'automatic');
            assert.equal(tree.props.backgroundColor, undefined);
            assert.equal(calls[0], theme === 'dark' ? '#0a0a0a' : '#ffffff');
            assert.equal(calls.includes('auto'), platform === 'android');
        });
    }
}

test('native draft badges preserve the pending change count', () => {
    const header = getNativeNavigationHeader(
        [{ kind: 'tool', symbol: 'pencil', badge: 3 }],
        '#fff',
    );
    assert.deepEqual(header.headerRightBarButtonItems[0].badge, { value: '3' });
});

test('a sheet host combines inherited Back with its own Close at the active layer', () => {
    const back = { kind: 'back', priority: 200, label: 'Back to search' };
    const close = { kind: 'close', priority: 200, label: 'Close sheet' };
    assert.deepEqual(
        resolveNativeNavigationActions([
            { kind: 'tool', priority: 0, label: 'Zoom in' },
            back,
            close,
        ]),
        [back, close],
    );
});

test('portal hosts hide the underlying native screen until the last overlay unmounts', () => {
    const actions = createNativeNavigationActions();
    const releaseFirst = actions.acquireOverlayHost();
    const releaseSecond = actions.acquireOverlayHost();
    assert.equal(actions.getOverlayHostCount(), 2);
    releaseFirst();
    assert.equal(actions.getOverlayHostCount(), 1);
    releaseSecond();
    assert.equal(actions.getOverlayHostCount(), 0);
});

test('native modals measure their own safe area instead of inheriting an inset-free content pane', () => {
    const nav = loadNavigation('ios');
    const modal = nav.NativeModalContent({ children: 'camera preview' });
    assert.equal(modal.type, 'SafeAreaProvider');
    const override = modal.props.children;
    assert.equal(override.type, 'SafeAreaInsetsOverrideProvider');
    assert.equal(override.props.insets, null);
    const content = override.props.children.props.children;
    assert.equal(content.type, nav.HorizontalSafeAreaContent);
    assert.equal(content.props.children, 'camera preview');
});

test('map groups sort independently of registration order and retain overflow preferences', () => {
    const actions = createNativeNavigationActions();
    const add = (id, group, order, visibilityPriority, extra = {}) =>
        actions.register(id, {
            kind: 'tool',
            label: id,
            testID: id,
            priority: 0,
            group,
            order,
            visibilityPriority,
            ...extra,
        });
    add('recenter', 'map', 3, 'high');
    add('zoom-out', 'map', 2, 'low', { sharesBackground: true });
    add('edit', 'activity', 0, 'standard', { badge: 3 });
    add('layers', 'map', 0, 'low');
    add('menu', 'navigation', 0, 'high');
    add('zoom-in', 'map', 1, 'low', { sharesBackground: true });
    add('start-driving', 'activity', 1, 'low', { overflowOnly: true });
    assert.deepEqual(
        actions.getSnapshot().map((item) => item.label),
        [
            'menu',
            'edit',
            'start-driving',
            'layers',
            'zoom-in',
            'zoom-out',
            'recenter',
        ],
    );
    const header = getNativeNavigationHeader(actions.getSnapshot(), '#fff');
    assert.equal(header.headerLeftBarButtonItems[0].title, 'menu');
    const right = header.headerRightBarButtonItems;
    assert.deepEqual(
        right.map((item) => item.visibilityPriority),
        ['standard', 'low', 'low', 'low', 'low', 'high'],
    );
    assert.equal(right[1].identifier, 'daf-map-overflow:start-driving');
    assert.deepEqual(
        right.slice(2).map((item) => item.identifier),
        [
            'daf-map-toolbar:layers',
            'daf-map-toolbar:zoom-in',
            'daf-map-toolbar:zoom-out',
            'daf-map-toolbar:recenter',
        ],
    );
    assert.deepEqual(
        right.slice(2).map((item) => item.sharesBackground),
        [false, true, true, false],
    );
    assert.deepEqual(right[0].badge, { value: '3' });
    const close = actions.register('close', {
        kind: 'close',
        label: 'Close',
        priority: 10,
    });
    assert.deepEqual(
        getNativeNavigationHeader(
            actions.getSnapshot(),
            '#fff',
        ).headerRightBarButtonItems.map((item) => item.title),
        ['Close'],
    );
    close();
    assert.equal(actions.getSnapshot().length, 7);
});

test('native action registration forwards grouping and refreshes overflow state', () => {
    const nav = loadNavigation('ios');
    nav.setVerticalBarEdge('trailing');
    let overflowOnly = true;
    const render = () =>
        nav.hooks.render(() =>
            nav.NativeNavigationAction({
                kind: 'tool',
                railOnly: true,
                group: 'activity',
                order: 1,
                visibilityPriority: 'low',
                sharesBackground: true,
                overflowOnly,
                label: 'Start free drive',
                onPress() {},
            }),
        );
    render();
    assert.equal(nav.actions.getSnapshot()[0].group, 'activity');
    assert.equal(nav.actions.getSnapshot()[0].visibilityPriority, 'low');
    assert.equal(nav.actions.getSnapshot()[0].sharesBackground, true);
    assert.equal(nav.actions.getSnapshot()[0].overflowOnly, true);
    overflowOnly = false;
    render();
    assert.equal(nav.actions.getSnapshot()[0].overflowOnly, false);
    nav.setVerticalBarEdge(null);
    render();
    assert.deepEqual(nav.actions.getSnapshot(), []);
});

test('Duo portrait keeps navigation controls native without moving ordinary phone controls', () => {
    for (const action of [
        { kind: 'back', label: 'Back from route choices' },
        { kind: 'close', label: 'Close place details' },
        { kind: 'back', label: 'Back to map' },
        { kind: 'tool', symbol: 'line.3.horizontal', label: 'Open menu' },
    ]) {
        const nav = loadNavigation('ios');
        const render = () =>
            nav.hooks.render(() =>
                nav.NativeNavigationAction({
                    ...action,
                    railOnly: true,
                    children: 'inline',
                    onPress() {},
                }),
            );
        assert.equal(render(), 'inline');
        nav.setDuoDevice(true);
        assert.equal(render(), null);
        assert.equal(nav.actions.getSnapshot()[0].label, action.label);
        nav.setVerticalBarEdge('trailing');
        assert.equal(render(), null);
        nav.setVerticalBarEdge(null);
        assert.equal(render(), null);
        nav.hooks.cleanup();
        assert.deepEqual(nav.actions.getSnapshot(), []);
    }
});

test('native screen measures safe areas inside its controller instead of inheriting root window insets', () => {
    const nav = loadNavigation('ios');
    const container = nav.NativeNavigationContainer({ children: 'map' });
    const tree = nav.hooks.render(() => container.type(container.props));
    const screen = tree.props.children.props.children;
    const provider = screen.props.children;
    assert.equal(provider.type, 'SafeAreaProvider');
    assert.equal(
        provider.props.initialMetrics,
        undefined,
        'the root metrics must not seed a resized controller',
    );
    assert.equal(provider.props.children.props.children, 'map');
    assert.deepEqual(
        screen.props.unstable_safeAreaEdges,
        { top: false, bottom: false, left: false, right: false },
        'map backgrounds stay edge to edge while content consumes measured insets',
    );
});
