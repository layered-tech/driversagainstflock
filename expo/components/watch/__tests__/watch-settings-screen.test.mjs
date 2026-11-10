import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createHookHarness,
    loadTourModule,
} from '../../map/__tests__/tour-test-helpers.mjs';

function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (typeof node.type === 'function') return nodes(node.type(node.props));
    return [node, ...nodes(node.props?.children)];
}
const find = (tree, testID) =>
    nodes(tree).find((node) => node.props?.testID === testID);
function text(tree) {
    if (tree === null || tree === undefined || typeof tree === 'boolean')
        return '';
    if (typeof tree !== 'object') return String(tree);
    if (Array.isArray(tree)) return tree.map(text).join(' ');
    return text(
        typeof tree.type === 'function'
            ? tree.type(tree.props)
            : tree.props?.children,
    );
}
function screen({
    width = 448,
    height = 997,
    duo = false,
    tablet = false,
    connected = true,
    platform = 'android',
    dark = false,
    insets = { top: 30, bottom: 24, left: 0, right: 0 },
} = {}) {
    const harness = createHookHarness();
    const calls = {
        haptics: [],
        camera: [],
        previews: 0,
        alerts: [],
        toasts: [],
        back: 0,
        replacements: [],
    };
    let hapticsListener, cameraListener;
    let connection = connected;
    let preview = async () => {};
    let save = async () => {};
    let canGoBack = true;
    const theme = {
        text: { secondary: '#4A5562', tertiary: '#828D9B', brand: '#0F7D45' },
    };
    const { WatchSettingsScreen } = loadTourModule(
        new URL('../watch-settings-screen.js', import.meta.url),
        {
            react: harness.react,
            expo: {
                requireOptionalNativeModule: () => ({
                    openHapticsOnWatch: async () => {
                        calls.previews++;
                        await preview();
                    },
                }),
            },
            'expo-router': {
                useIsFocused: () => true,
                useRouter: () => ({
                    canGoBack: () => canGoBack,
                    back: () => calls.back++,
                    replace: (path) => calls.replacements.push(path),
                }),
            },
            'react-native': {
                Platform: { OS: platform, isPad: tablet },
                View: 'View',
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                Switch: 'Switch',
                useColorScheme: () => (dark ? 'dark' : 'light'),
                useWindowDimensions: () => ({ width, height }),
                Alert: { alert: (...args) => calls.alerts.push(args) },
                ToastAndroid: {
                    SHORT: 'short',
                    show: (...args) => calls.toasts.push(args),
                },
            },
            '../../lib/safe-area-insets': { useSafeAreaInsets: () => insets },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/tokens': {
                dafThemes: { light: theme, dark: theme },
            },
            '../map/native-components': {
                NativeWindBottomSheet: 'BottomSheet',
                NativeWindBottomSheetScrollView: 'SheetScrollView',
            },
            '../root/duo-device-context': { useDuoDevice: () => duo },
            '../root/native-navigation': {
                NativeNavigationAction: 'NativeNavigationAction',
            },
            './use-connected-watch': { useConnectedWatch: () => connection },
            './watch-haptic-preferences': {
                watchHapticsEnabled: () => true,
                loadWatchHapticPreferences: async () => true,
                subscribeWatchHaptics: (fn) => {
                    hapticsListener = fn;
                    return () => {
                        hapticsListener = null;
                    };
                },
                setWatchHapticsEnabled: async (value) => {
                    calls.haptics.push(value);
                    await save();
                    hapticsListener(value);
                },
            },
            './watch-camera-preferences': {
                getWatchCameraPreferences: () => ({ alertsEnabled: true }),
                loadWatchCameraPreferences: async () => ({
                    alertsEnabled: true,
                }),
                subscribeWatchCameraPreferences: (fn) => {
                    cameraListener = fn;
                    return () => {
                        cameraListener = null;
                    };
                },
                setWatchCameraPreferences: async (value) => {
                    calls.camera.push(value);
                    await save();
                    cameraListener(value);
                },
            },
        },
    );
    return {
        calls,
        render: () => harness.render(WatchSettingsScreen),
        cleanup: harness.cleanup,
        connect: (value) => {
            connection = value;
        },
        preview: (fn) => {
            preview = fn;
        },
        save: (fn) => {
            save = fn;
        },
        noHistory: () => {
            canGoBack = false;
        },
    };
}

test('phone shows live status and places both switches after their descriptions', () => {
    const ui = screen();
    const tree = ui.render();
    assert.match(text(find(tree, 'watch-connection-status')), /Connected/);
    assert.match(text(tree), /DAF on Wear OS/);
    assert.doesNotMatch(text(tree), /synced 2 min ago/);
    assert.match(
        text(tree),
        /Alert distance and camera types follow your Alerts settings/,
    );
    const switches = nodes(tree).filter((node) => node.type === 'Switch');
    assert.equal(switches.length, 2);
    for (const toggle of switches) {
        const row = nodes(tree).find(
            (node) =>
                Array.isArray(node.props?.children) &&
                node.props.children.some(
                    (child) => child?.props?.testID === toggle.props.testID,
                ),
        );
        assert.equal(
            row.props.children.at(-1).props.testID,
            toggle.props.testID,
        );
    }
    assert.equal(find(tree, 'watch-preview-patterns').props.disabled, false);
    assert.ok(!find(tree, 'watch-settings-close'));
    ui.cleanup();
});

test('switches save through existing preferences and reflect subscription updates', async () => {
    const ui = screen();
    await find(ui.render(), 'watch-haptics-toggle').props.onValueChange(false);
    await find(ui.render(), 'watch-camera-alerts-toggle').props.onValueChange(
        false,
    );
    assert.deepEqual(ui.calls.haptics, [false]);
    assert.deepEqual(ui.calls.camera, [{ alertsEnabled: false }]);
    assert.equal(find(ui.render(), 'watch-haptics-toggle').props.value, false);
    assert.equal(
        find(ui.render(), 'watch-camera-alerts-toggle').props.value,
        false,
    );
    ui.cleanup();
});

test('failed saves preserve toggle values and show an actionable error', async () => {
    const ui = screen();
    ui.save(async () => {
        throw new Error('storage unavailable');
    });
    await find(ui.render(), 'watch-haptics-toggle').props.onValueChange(false);
    await find(ui.render(), 'watch-camera-alerts-toggle').props.onValueChange(
        false,
    );
    assert.equal(find(ui.render(), 'watch-haptics-toggle').props.value, true);
    assert.equal(
        find(ui.render(), 'watch-camera-alerts-toggle').props.value,
        true,
    );
    assert.equal(ui.calls.alerts.length, 2);
    assert.equal(ui.calls.alerts[0][0], 'Could not save');
    ui.cleanup();
});

test('disconnected preview is disabled and recovers on reconnect', async () => {
    const ui = screen({ connected: false });
    let row = find(ui.render(), 'watch-preview-patterns');
    assert.equal(row.props.disabled, true);
    assert.equal(row.props.accessibilityState.disabled, true);
    assert.match(text(row), /Watch not connected/);
    await row.props.onPress();
    assert.equal(ui.calls.previews, 0);
    ui.connect(true);
    row = find(ui.render(), 'watch-preview-patterns');
    assert.equal(row.props.disabled, false);
    await row.props.onPress();
    assert.equal(ui.calls.previews, 1);
    assert.deepEqual(ui.calls.toasts, [['Check your wrist.', 'short']]);
    ui.cleanup();
});

test('preview blocks repeated requests while pending and recovers after failure', async () => {
    const ui = screen();
    let reject;
    ui.preview(
        () =>
            new Promise((_resolve, rejectRequest) => {
                reject = rejectRequest;
            }),
    );
    const pending = find(ui.render(), 'watch-preview-patterns').props.onPress();
    const row = find(ui.render(), 'watch-preview-patterns');
    assert.equal(row.props.disabled, true);
    assert.equal(row.props.accessibilityState.busy, true);
    await row.props.onPress();
    assert.equal(ui.calls.previews, 1);
    reject(new Error('disconnected'));
    await pending;
    assert.equal(
        find(ui.render(), 'watch-preview-patterns').props.disabled,
        false,
    );
    assert.equal(ui.calls.alerts[0][0], 'Watch not connected');
    assert.deepEqual(ui.calls.toasts, []);
    ui.cleanup();
});

for (const [name, options, expectedWidth] of [
    ['fold', { width: 800, height: 844, duo: true }, 376],
    [
        'tablet',
        { width: 1194, height: 834, tablet: true, platform: 'ios' },
        406,
    ],
    [
        'Duo right rail',
        {
            width: 982,
            height: 678,
            duo: true,
            insets: { left: 0, right: 84, top: 0, bottom: 20 },
        },
        406,
    ],
    [
        'Duo left rail',
        {
            width: 982,
            height: 678,
            duo: true,
            insets: { left: 84, right: 0, top: 0, bottom: 20 },
        },
        406,
    ],
]) {
    test(`${name} uses a bounded floating panel and working close action`, () => {
        const ui = screen(options);
        const tree = ui.render();
        const panel = find(tree, 'watch-settings-screen');
        assert.equal(panel.props.style.width, expectedWidth);
        assert.equal(panel.props.style.left, (options.insets?.left ?? 0) + 12);
        assert.ok(panel.props.style.maxHeight < options.height);
        assert.match(text(tree), /Haptics and camera alerts on your wrist/);
        find(tree, 'watch-settings-close').props.onPress();
        assert.equal(ui.calls.back, 1);
        ui.noHistory();
        find(ui.render(), 'watch-settings-close').props.onPress();
        assert.deepEqual(ui.calls.replacements, ['/']);
        ui.cleanup();
    });
}

test('closed Duo uses a scrollable, dismissible bottom sheet', () => {
    const ui = screen({
        width: 466,
        height: 678,
        duo: true,
        insets: { top: 0, bottom: 20, left: 0, right: 84 },
    });
    const tree = ui.render();
    assert.equal(tree.type, 'BottomSheet');
    assert.equal(tree.props.enablePanDownToClose, true);
    assert.deepEqual(tree.props.snapPoints, [560]);
    assert.equal(find(tree, 'watch-settings-screen').type, 'SheetScrollView');
    assert.match(text(tree), /Alert distance and camera types follow/);
    tree.props.onClose();
    assert.equal(ui.calls.back, 1);
    ui.cleanup();
});

test('Apple Watch uses platform-specific wording in dark mode', () => {
    const ui = screen({ platform: 'ios', dark: true });
    const tree = ui.render();
    assert.match(text(tree), /Apple Watch/);
    assert.match(text(tree), /Tap for upcoming turns/);
    assert.match(text(tree), /Three quick taps/);
    assert.doesNotMatch(text(tree), /Wear OS|Three quick ticks/);
    ui.cleanup();
});

test('watch route uses the existing responsive map modal host', () => {
    const { default: Route } = loadTourModule(
        new URL('../../../app/watch-settings.js', import.meta.url),
        {
            '../components/root/duo-pane-screen': {
                DuoMapModalScreen: 'MapModal',
            },
            '../components/watch/watch-settings-screen': {
                WatchSettingsScreen: 'WatchSettings',
            },
        },
    );
    assert.equal(Route().type, 'MapModal');
    assert.equal(Route().props.children.type, 'WatchSettings');
});
