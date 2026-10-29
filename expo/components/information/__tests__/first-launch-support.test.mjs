import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    createHookHarness,
    loadTourModule,
} from '../../map/__tests__/tour-test-helpers.mjs';
import { contributePage } from '../community-content.js';
import * as supportState from '../first-launch-support-state.js';
import { getFirstLaunchSupportLayout } from '../first-launch-support-layout.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createStorage() {
    const values = new Map();
    return {
        values,
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => values.set(key, value),
    };
}

function createGate(storage = createStorage(), openURL = async () => {}) {
    const harness = createHookHarness();
    let backHandler;
    const { FirstLaunchSupportGate } = loadTourModule(
        new URL('../first-launch-support-gate.js', import.meta.url),
        {
            react: harness.react,
            '@react-native-async-storage/async-storage': {
                default: storage,
                __esModule: true,
            },
            'react-native': {
                ActivityIndicator: 'ActivityIndicator',
                View: 'View',
                Linking: { openURL },
                BackHandler: {
                    addEventListener: (event, handler) => {
                        assert.equal(event, 'hardwareBackPress');
                        backHandler = handler;
                        return {
                            remove: () => {
                                backHandler = null;
                            },
                        };
                    },
                },
            },
            './community-content': { contributePage },
            './first-launch-support-screen': {
                FirstLaunchSupportScreen: 'SupportScreen',
            },
            './first-launch-support-state': supportState,
        },
    );
    return {
        ...harness,
        storage,
        render: () =>
            harness.render(() => FirstLaunchSupportGate({ children: 'App' })),
        pressBack: () => backHandler(),
    };
}

test('waits for storage, shows on first launch, and never returns after Maybe later', async () => {
    const gate = createGate();
    assert.equal(gate.render().props.children.type, 'ActivityIndicator');
    await flush();
    const screen = gate.render();
    assert.equal(screen.type, 'SupportScreen');
    await screen.props.onDismiss();
    assert.equal(gate.render().props.children, 'App');
    assert.equal(
        gate.storage.values.get(supportState.FIRST_LAUNCH_SUPPORT_STORAGE_KEY),
        'true',
    );
    gate.cleanup();

    const relaunch = createGate(gate.storage);
    relaunch.render();
    await flush();
    assert.equal(relaunch.render().props.children, 'App');
    relaunch.cleanup();
});

test('Android back saves the same permanent dismissal', async () => {
    const gate = createGate();
    gate.render();
    await flush();
    gate.render();
    assert.equal(gate.pressBack(), true);
    await flush();
    assert.equal(gate.render().props.children, 'App');
    assert.equal(
        await supportState.shouldShowFirstLaunchSupport(gate.storage),
        false,
    );
    gate.cleanup();
});

test('donation saves completion before opening the existing donation URL', async () => {
    const storage = createStorage();
    const urls = [];
    const gate = createGate(storage, async (url) => {
        assert.equal(
            await supportState.shouldShowFirstLaunchSupport(storage),
            false,
        );
        urls.push(url);
    });
    gate.render();
    await flush();
    await gate.render().props.onDonate();
    assert.deepEqual(urls, [contributePage.donationUrl]);
    assert.equal(gate.render().props.children, 'App');
    gate.cleanup();
});

test('rapid taps wait for one durable write before continuing', async () => {
    const storage = createStorage();
    let finishWrite;
    let writes = 0;
    storage.setItem = () => {
        writes += 1;
        return new Promise((resolve) => {
            finishWrite = resolve;
        });
    };
    const gate = createGate(storage);
    gate.render();
    await flush();
    const screen = gate.render();
    const dismissal = screen.props.onDismiss();
    await screen.props.onDismiss();
    assert.equal(gate.render().type, 'SupportScreen');
    assert.equal(gate.render().props.busy, true);
    assert.equal(writes, 1);
    finishWrite();
    await dismissal;
    assert.equal(gate.render().props.children, 'App');
    gate.cleanup();
});

test('a failed save keeps the ask open for retry without opening a donation link', async () => {
    const storage = createStorage();
    let opened = false;
    storage.setItem = async () => {
        throw new Error('disk failure');
    };
    const gate = createGate(storage, async () => {
        opened = true;
    });
    gate.render();
    await flush();
    await gate.render().props.onDismiss();
    assert.match(gate.render().props.error, /Could not save/);
    assert.equal(gate.render().props.busy, false);
    await gate.render().props.onDonate();
    assert.equal(opened, false);
    gate.cleanup();
});

test('a failed browser launch allows Maybe later and remains completed on restart', async () => {
    const gate = createGate(createStorage(), async () => {
        throw new Error('no browser');
    });
    gate.render();
    await flush();
    await gate.render().props.onDonate();
    assert.match(gate.render().props.error, /Could not open/);
    await gate.render().props.onDismiss();
    assert.equal(gate.render().props.children, 'App');
    assert.equal(
        await supportState.shouldShowFirstLaunchSupport(gate.storage),
        false,
    );
    gate.cleanup();
});

test('storage read failure leaves the app usable', async () => {
    const storage = createStorage();
    storage.getItem = async () => {
        throw new Error('read failure');
    };
    const gate = createGate(storage);
    gate.render();
    await flush();
    assert.equal(gate.render().props.children, 'App');
    gate.cleanup();
});

test('mounts the launch gate around the phone navigator and uses a scrollable screen', () => {
    const layout = readFileSync(
        new URL('../../../app/_layout.js', import.meta.url),
        'utf8',
    );
    const screen = readFileSync(
        new URL('../first-launch-support-screen.js', import.meta.url),
        'utf8',
    );
    assert.match(layout, /<FirstLaunchSupportGate>\s*<Drawer/);
    assert.match(screen, /<ScrollView/);
    assert.match(screen, /paddingTop: layout.paddingTop/);
    assert.match(screen, /paddingBottom: layout.paddingBottom/);
    assert.match(screen, /Maybe later/);
    assert.match(screen, /Your routes stay ours/);
    assert.doesNotMatch(screen, /StyleSheet/);
});

test('scales spacing, type and icon sizes together from the 390-point design', () => {
    const reference = getFirstLaunchSupportLayout(390, { top: 44, bottom: 20 });
    assert.equal(reference.scale, 1);
    assert.equal(reference.paddingTop, 68);
    assert.equal(reference.paddingBottom, 36);
    assert.equal(reference.variables['--support-32'], 32);
    assert.equal(reference.variables['--support-22'], 22);
    for (const width of [320, 448, 560]) {
        const layout = getFirstLaunchSupportLayout(width, {
            top: 0,
            bottom: 0,
        });
        assert.equal(layout.scale, width / 390);
        assert.ok(
            Math.abs(layout.variables['--support-32'] - (32 * width) / 390) <
                0.000001,
        );
        assert.ok(
            Math.abs(layout.variables['--support-58'] - (58 * width) / 390) <
                0.000001,
        );
        assert.ok(Math.abs(layout.paddingTop - (68 * width) / 390) < 0.000001);
    }
    assert.deepEqual(
        getFirstLaunchSupportLayout(1000, { top: 44, bottom: 20 }),
        getFirstLaunchSupportLayout(560, { top: 44, bottom: 20 }),
    );
});

test('Duo support sizing excludes either rail and does not keep the phone notch gap', () => {
    for (const horizontal of [
        { left: 0, right: 84 },
        { left: 84, right: 0 },
    ]) {
        const layout = getFirstLaunchSupportLayout(466, {
            top: 0,
            bottom: 20,
            ...horizontal,
        });
        assert.equal(layout.scale, 382 / 390);
        assert.equal(layout.paddingTop, 24 * layout.scale);
        assert.equal(layout.variables['--support-28'], 28 * layout.scale);
    }
});

test('open Duo onboarding keeps the design type scale inside its centered card', () => {
    const layout = getFirstLaunchSupportLayout(
        982,
        { top: 0, bottom: 0, left: 0, right: 84 },
        true,
    );
    assert.equal(layout.centered, true);
    assert.equal(layout.scale, 1);
    assert.equal(layout.variables['--support-32'], 32);
    assert.equal(layout.variables['--support-22'], 22);
    assert.equal(
        getFirstLaunchSupportLayout(466, { top: 0, bottom: 0, right: 84 }, true)
            .centered,
        false,
    );
});

test('open portrait Duo onboarding follows the closed layout', () => {
    const insets = { top: 44, bottom: 20, left: 0, right: 0 };
    assert.deepEqual(
        getFirstLaunchSupportLayout(678, insets, true),
        getFirstLaunchSupportLayout(466, insets, true),
    );
});

test('iPad onboarding keeps the unscaled centered card in portrait and landscape', () => {
    for (const width of [834, 1194, 1376]) {
        const layout = getFirstLaunchSupportLayout(
            width,
            { top: 24, bottom: 20, left: 0, right: 0 },
            false,
            true,
        );
        assert.equal(layout.centered, true);
        assert.equal(layout.scale, 1);
        assert.equal(layout.paddingTop, 24);
        assert.equal(layout.paddingBottom, 24);
        assert.equal(layout.variables['--support-32'], 32);
    }
    assert.equal(
        getFirstLaunchSupportLayout(600, { top: 24, bottom: 20 }, false, true)
            .centered,
        false,
        'a narrow multitasking window keeps the phone flow',
    );
});

test('iPad support renders a map behind the centered card and a fixed action gap', () => {
    const { FirstLaunchSupportScreen } = loadTourModule(
        new URL('../first-launch-support-screen.js', import.meta.url),
        {
            nativewind: { vars: (values) => values },
            'react-native': {
                Platform: { OS: 'ios', isPad: true },
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                View: 'View',
                useColorScheme: () => 'light',
                useWindowDimensions: () => ({ width: 1194, height: 834 }),
            },
            '../../lib/safe-area-insets': {
                useSafeAreaInsets: () => ({ top: 24, bottom: 20 }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            './first-launch-support-layout': { getFirstLaunchSupportLayout },
            '../areas/area-map': { AreaMap: 'AreaMap' },
        },
    );
    const tree = FirstLaunchSupportScreen({ busy: false });
    const [backdrop, scroll] = tree.props.children;
    assert.equal(backdrop.props.children[0].type, 'AreaMap');
    assert.equal(scroll.props.contentContainerClassName, 'grow justify-center');
    const card = scroll.props.children;
    assert.match(card.props.className, /max-w-\[480px\]/);
    assert.match(card.props.className, /rounded-daf2xl/);
    assert.ok(
        card.props.children.some((child) => child?.props?.className === 'h-6'),
    );
});

function createSupportRoute({
    tablet = true,
    width = 1194,
    openURL = async () => {},
} = {}) {
    const hooks = createHookHarness();
    const routes = [];
    const { ContributeScreen } = loadTourModule(
        new URL('../contribute-screen.js', import.meta.url),
        {
            react: hooks.react,
            'expo-router': {
                router: { replace: (route) => routes.push(route) },
            },
            'react-native': {
                Linking: { openURL },
                Platform: { OS: 'ios', isPad: tablet },
                Pressable: 'Pressable',
                ScrollView: 'ScrollView',
                Text: 'Text',
                View: 'View',
                useWindowDimensions: () => ({ width, height: 834 }),
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../design-system/tokens': { dafSemanticColors: {} },
            './community-content': { contributePage },
            './information-screen': { InformationHeader: 'InformationHeader' },
            './first-launch-support-screen': {
                FirstLaunchSupportScreen: 'SupportScreen',
            },
        },
    );
    const route = ContributeScreen();
    return {
        route,
        routes,
        render: () => hooks.render(() => route.type(route.props)),
    };
}

test('drawer support on iPad reuses the designed card and returns to the map', async () => {
    const opened = [];
    let finishOpen;
    const route = createSupportRoute({
        openURL: (url) => {
            opened.push(url);
            return new Promise((resolve) => {
                finishOpen = resolve;
            });
        },
    });
    let screen = route.render();
    assert.equal(screen.type, 'SupportScreen');
    const opening = screen.props.onDonate();
    await screen.props.onDonate();
    assert.deepEqual(opened, [contributePage.donationUrl]);
    assert.equal(route.render().props.busy, true);
    finishOpen();
    await opening;
    screen = route.render();
    assert.equal(screen.props.busy, false);
    screen.props.onDismiss();
    assert.deepEqual(route.routes, ['/']);
});

test('drawer support keeps the tablet card available after a failed browser launch', async () => {
    const route = createSupportRoute({
        openURL: async () => {
            throw new Error('No browser');
        },
    });
    await route.render().props.onDonate();
    const screen = route.render();
    assert.equal(screen.props.busy, false);
    assert.match(screen.props.error, /Please try again/);
});

test('phone, Duo and narrow iPad drawer support retain the existing funding page', () => {
    for (const options of [
        { tablet: false, width: 390 },
        { tablet: false, width: 982 },
        { tablet: true, width: 600 },
    ]) {
        const { route } = createSupportRoute(options);
        assert.equal(route.props.testID, 'contribute-info-screen');
        assert.equal(route.props.children[0].type, 'InformationHeader');
        assert.equal(route.props.children[0].props.title, 'Support Us');
    }
});
