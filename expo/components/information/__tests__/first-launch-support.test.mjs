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

test('mounts the launch gate around adaptive navigation and uses a scrollable screen', () => {
    const layout = readFileSync(
        new URL('../../../app/_layout.js', import.meta.url),
        'utf8',
    );
    const screen = readFileSync(
        new URL('../first-launch-support-screen.js', import.meta.url),
        'utf8',
    );
    assert.match(
        layout,
        /<FirstLaunchSupportGate>\s*<View style=\{\{ flex: 1 \}\}>\s*<AdaptiveNavigationShell>/,
    );
    assert.match(
        layout,
        /<\/AdaptiveNavigationShell>[\s\S]*<ScorecardArrivalRecap \/>\s*<\/View>\s*<\/FirstLaunchSupportGate>/,
    );
    assert.match(screen, /<ScrollView/);
    assert.match(screen, /paddingTop: layout.paddingTop/);
    assert.match(screen, /paddingBottom: layout.paddingBottom/);
    assert.match(screen, /Maybe later/);
    assert.match(screen, /Your routes stay ours\{'\\n'\}to run/);
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
