import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createPresenceCoordinator } from '../alpr-presence-coordinator.js';
import { createPresenceState } from '../alpr-presence-policy.js';
import {
    createAutomotiveAlertHistory,
    getAutomotiveAlertHistoryEntry,
} from '../automotive-alert-policy.js';
import {
    DEBUG_OVERLAY_UPCOMING_ALERTS,
    getDebugOverlayVisibilityWithDefaults,
} from '../debug-overlays.js';
import {
    buildUpcomingAlertDebugSnapshot,
    createUpcomingAlertDebugStore,
    formatUpcomingAlertDebugSnapshot,
} from '../upcoming-alert-debug.js';

const node = {
    id: 'reader',
    type: 'alpr',
    coordinate: [0, 0.014],
    distanceMeters: 1800,
};
const history = createAutomotiveAlertHistory('drive');
const input = {
    enabled: true,
    hasTemplate: true,
    upcomingAlerts: [node],
    userLocation: { latitude: 0, longitude: 0 },
    alertHistory: history,
    pathSource: 'route',
    pathPointCount: 25,
    alprNodeCount: 10,
};

test('diagnostics report direct range, route range, history and missing data separately', () => {
    const snapshot = buildUpcomingAlertDebugSnapshot(input, 1000);
    assert.equal(snapshot.eligibleCount, 1);
    assert.equal(snapshot.candidates[0].pathMeters, 1800);
    assert.ok(snapshot.candidates[0].geographicMeters > 1500);
    const near = buildUpcomingAlertDebugSnapshot({
        ...input,
        upcomingAlerts: [{ ...node, coordinate: [0, 0.001] }],
    });
    assert.deepEqual(near.candidates[0].blockers, ['Inside 0.5 mile minimum']);
    const far = buildUpcomingAlertDebugSnapshot({
        ...input,
        upcomingAlerts: [{ ...node, coordinate: [0, 0.04] }],
    });
    assert.deepEqual(far.candidates[0].blockers, ['Outside 2 mile maximum']);
    const recorded = buildUpcomingAlertDebugSnapshot({
        ...input,
        alertHistory: {
            ...history,
            entries: [getAutomotiveAlertHistoryEntry(node)],
        },
    });
    assert.equal(recorded.eligibleCount, 0);
    assert.match(
        recorded.candidates[0].blockers[0],
        /Already shown this drive/,
    );
    const missing = buildUpcomingAlertDebugSnapshot({
        ...input,
        enabled: false,
        blockers: ['Route preview active'],
        hasTemplate: false,
        alertHistory: null,
        userLocation: null,
    });
    assert.deepEqual(missing.blockers, [
        'Route preview active',
        'Car map template unavailable',
        'Warning history unavailable',
    ]);
    assert.ok(missing.candidates[0].blockers.includes('Location unavailable'));
    assert.ok(!JSON.stringify(snapshot).includes('coordinate'));
    assert.ok(!JSON.stringify(snapshot).includes('latitude'));
});

test('debug recording defaults off, throttles snapshots, caps events and retains paused state', () => {
    assert.equal(
        getDebugOverlayVisibilityWithDefaults({})[
            DEBUG_OVERLAY_UPCOMING_ALERTS
        ],
        false,
    );
    const store = createUpcomingAlertDebugStore();
    let calls = 0;
    const sample = () => {
        calls++;
        return { marker: calls };
    };
    store.record(sample, 1000);
    assert.equal(calls, 0);
    store.setEnabled(true);
    store.record(sample, 1000);
    store.record(sample, 1500);
    assert.equal(calls, 1);
    for (let i = 0; i < 65; i++) store.event('Host callback', i, 2000 + i);
    assert.equal(store.getSnapshot().events.length, 60);
    store.setEnabled(false);
    store.record(sample, 3000);
    store.event('ignored');
    assert.equal(store.getSnapshot().latest.marker, 1);
    assert.equal(store.getSnapshot().events.length, 60);
    assert.match(
        formatUpcomingAlertDebugSnapshot(store.getSnapshot()),
        /Upcoming car alerts/,
    );
    store.clear();
    assert.equal(store.getSnapshot().latest, null);
    assert.deepEqual(store.getSnapshot().events, []);
});

test('warning history reset persists, invalidates old claims and preserves confirmation state', async () => {
    const original = createPresenceState('x'.repeat(32), 1000);
    original.drive.count = 3;
    original.lastPromptAt = 999;
    original.nodeTimes = { 123: 999 };
    original.automotiveAlertHistory.entries = [
        getAutomotiveAlertHistoryEntry(node),
    ];
    let stored = JSON.stringify(original);
    const coordinator = createPresenceCoordinator({
        load: async () => stored,
        save: async (value) => {
            stored = value;
        },
        randomId: () => 'x'.repeat(32),
        send: async () => {},
    });
    await coordinator.hydrate();
    const pending = coordinator.claimAutomotiveAlert(
        getAutomotiveAlertHistoryEntry({
            ...node,
            id: 'police',
            type: 'police',
        }),
    );
    assert.ok(pending);
    await coordinator.resetAutomotiveAlertHistory();
    assert.equal(pending.commit(), false);
    assert.deepEqual(coordinator.automotiveAlertHistory.entries, []);
    assert.deepEqual(JSON.parse(stored).automotiveAlertHistory.entries, []);
    assert.deepEqual(coordinator.state.drive, original.drive);
    assert.equal(coordinator.state.lastPromptAt, 999);
    assert.deepEqual(coordinator.state.nodeTimes, original.nodeTimes);
    assert.deepEqual(coordinator.state.outbox, original.outbox);
    assert.ok(
        coordinator
            .claimAutomotiveAlert(getAutomotiveAlertHistoryEntry(node))
            ?.release(),
    );
});

test('reset failure is surfaced and does not report successful clearing', async () => {
    let fail = false;
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async () => {
            if (fail) throw new Error('disk');
        },
        randomId: () => 'x'.repeat(32),
        send: async () => {},
    });
    await coordinator.hydrate();
    fail = true;
    await assert.rejects(coordinator.resetAutomotiveAlertHistory(), /disk/);
    assert.equal(coordinator.state, null);
});

function paneHarness() {
    const require = createRequire(import.meta.url);
    const babel = require('@babel/core');
    const { code } = babel.transformSync(
        readFileSync(
            new URL('../upcoming-alert-debug-pane.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                [
                    require.resolve('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
                require.resolve('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    );
    const store = createUpcomingAlertDebugStore();
    const state = [];
    let cursor = 0,
        calls = 0,
        resolveReset,
        rejectReset;
    const mocks = {
        react: {
            useRef: (value) => {
                const index = cursor++;
                if (!(index in state)) state[index] = { current: value };
                return state[index];
            },
            useState: (value) => {
                const index = cursor++;
                if (!(index in state)) state[index] = value;
                return [
                    state[index],
                    (next) => {
                        state[index] = next;
                    },
                ];
            },
            useSyncExternalStore: (_subscribe, get) => get(),
        },
        'react/jsx-runtime': {
            jsx: (type, props) => ({ type, props }),
            jsxs: (type, props) => ({ type, props }),
            Fragment: 'Fragment',
        },
        'react-native': {
            View: 'View',
            Text: 'Text',
            Pressable: 'Pressable',
            Share: { share: async () => {} },
        },
        './upcoming-alert-debug': {
            upcomingAlertDebugStore: store,
            formatUpcomingAlertDebugSnapshot,
        },
        './upcoming-alert-debug-runtime': {
            resetUpcomingAlertDebugHistory: () => {
                calls++;
                return new Promise((resolve, reject) => {
                    resolveReset = resolve;
                    rejectReset = reject;
                });
            },
        },
    };
    const exports = {};
    new Function('require', 'exports', code)((name) => {
        assert.ok(mocks[name], name);
        return mocks[name];
    }, exports);
    const flatten = (node) =>
        !node || typeof node !== 'object'
            ? []
            : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
    return {
        store,
        render: () => {
            cursor = 0;
            return flatten(exports.UpcomingAlertDebugPane({}));
        },
        calls: () => calls,
        resolve: () => resolveReset(),
        reject: () => rejectReset(new Error('disk')),
    };
}
test('debug pane reset prevents double taps, exposes errors, and captures a frozen snapshot', async () => {
    const h = paneHarness();
    const find = (id) => h.render().find((node) => node.props.testID === id);
    const button = find('upcoming-alert-debug-reset-limits');
    const work = button.props.onPress();
    await button.props.onPress();
    assert.equal(h.calls(), 1);
    assert.equal(
        find('upcoming-alert-debug-reset-limits').props.disabled,
        true,
    );
    h.resolve();
    await work;
    assert.match(
        find('upcoming-alert-debug-reset-status').props.children,
        /history reset/,
    );
    const failed = find('upcoming-alert-debug-reset-limits').props.onPress();
    h.reject();
    await failed;
    assert.match(
        find('upcoming-alert-debug-reset-status').props.children,
        /failed/,
    );
    find('upcoming-alert-debug-capture').props.onPress();
    const captured = find('upcoming-alert-debug-snapshot').props.children;
    h.store.setEnabled(true);
    h.store.event('New event');
    assert.equal(
        find('upcoming-alert-debug-snapshot').props.children,
        captured,
    );
});

test('announcer records real submission, host callback and dismissal separately', async () => {
    const require = createRequire(import.meta.url);
    const babel = require('@babel/core');
    const policy = await import('../../auto-play-navigation-alert.js');
    const debug = await import('../upcoming-alert-debug.js');
    const store = createUpcomingAlertDebugStore();
    store.setEnabled(true);
    const effects = [],
        timers = [];
    let banner,
        commits = 0;
    const mocks = {
        react: {
            useCallback: (fn) => fn,
            useRef: (value) => ({ current: value }),
            useState: (value) => [value, () => {}],
            useEffect: (fn) => effects.push(fn),
        },
        'react-native': { Platform: { OS: 'android' } },
        '@iternio/react-native-auto-play': {
            useMapTemplate: () => ({
                showAlert: (value) => {
                    banner = value;
                },
                dismissAlert: () => {},
            }),
        },
        './auto-play-navigation-alert': policy,
        './map/upcoming-alert-debug': {
            ...debug,
            upcomingAlertDebugStore: store,
        },
        './map/upcoming-alert-debug-runtime': {
            startUpcomingAlertDebug: () => {},
            addUpcomingAlertDebugResetListener: () => () => {},
        },
        './map/alpr-presence-runtime': {
            startPresenceRuntime: () => {},
            presenceCoordinator: {
                automotiveAlertHistory: history,
                subscribe: () => () => {},
                hydrate: async () => {},
                claimAutomotiveAlert: () => ({
                    commit: () => {
                        commits++;
                        return true;
                    },
                    release: () => true,
                }),
            },
        },
        '../assets/auto-play/road-circle-exclamation.png': 1,
    };
    const { code } = babel.transformSync(
        readFileSync(
            new URL(
                '../../auto-play-navigation-alert-announcer.js',
                import.meta.url,
            ),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                require.resolve('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    );
    const exports = {};
    new Function('require', 'exports', 'setTimeout', 'clearTimeout', code)(
        (name) => {
            assert.ok(mocks[name], name);
            return mocks[name];
        },
        exports,
        (fn) => {
            timers.push(fn);
            return timers.length;
        },
        () => {},
    );
    exports.useAutoPlayNavigationAlerts({
        ...input,
        currentSpeedMps: 20,
        debugOwner: true,
        debugContext: {
            pathSource: 'route',
            pathPointCount: 25,
            alprNodeCount: 10,
        },
    });
    effects.forEach((effect) => effect());
    assert.ok(banner);
    assert.equal(store.getSnapshot().latest.pathSource, 'route');
    assert.equal(store.getSnapshot().latest.transition, 'show');
    assert.equal(commits, 0);
    assert.equal(
        store.getSnapshot().events.at(-1).event,
        'Submitting banner to host',
    );
    banner.onWillShow();
    assert.equal(commits, 1);
    assert.match(
        store.getSnapshot().events.at(-1).event,
        /visibility not verified/,
    );
    banner.onDidDismiss('system');
    assert.equal(
        store.getSnapshot().events.at(-1).event,
        'Host dismissed banner: system',
    );
});
