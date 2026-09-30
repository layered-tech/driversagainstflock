import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createPresenceCoordinator } from '../alpr-presence-coordinator.js';
import * as automotivePolicy from '../automotive-alert-policy.js';
import * as drivingAlerts from '../driving-alerts.js';

const require = createRequire(import.meta.url);

function createOverlayHarness(
    coordinator,
    clock = { now: Date.now(), timers: [] },
    carConnected = false,
) {
    const babel = require('@babel/core');
    const { code } = babel.transformSync(
        readFileSync(
            new URL('../driving-alerts-overlay.js', import.meta.url),
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
    const slots = [];
    let cursor = 0;
    let changed = false;
    let effects = [];
    const sameDependencies = (left, right) =>
        left?.length === right?.length &&
        left.every((value, index) => Object.is(value, right[index]));
    const react = {
        useState(initial) {
            const index = cursor++;
            if (!(index in slots))
                slots[index] =
                    typeof initial === 'function' ? initial() : initial;
            return [
                slots[index],
                (next) => {
                    const value =
                        typeof next === 'function' ? next(slots[index]) : next;
                    if (!Object.is(value, slots[index])) {
                        slots[index] = value;
                        changed = true;
                    }
                },
            ];
        },
        useRef(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = { current: initial };
            return slots[index];
        },
        useMemo(create, dependencies) {
            const index = cursor++;
            if (
                !slots[index] ||
                !sameDependencies(slots[index].dependencies, dependencies)
            )
                slots[index] = { dependencies, value: create() };
            return slots[index].value;
        },
        useCallback(callback, dependencies) {
            const index = cursor++;
            if (
                !slots[index] ||
                !sameDependencies(slots[index].dependencies, dependencies)
            )
                slots[index] = { dependencies, value: callback };
            return slots[index].value;
        },
        useEffect(effect, dependencies) {
            const index = cursor++;
            if (
                !slots[index] ||
                !sameDependencies(slots[index].dependencies, dependencies)
            ) {
                const prior = slots[index];
                effects.push(() => {
                    prior?.cleanup?.();
                    slots[index] = { dependencies, cleanup: effect() };
                });
            }
        },
    };
    const jsx = (type, props) => ({ type, props });
    const mocks = {
        react,
        'react/jsx-runtime': { jsx, jsxs: jsx },
        'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
        '../auto-play-session-state': {
            getAutoPlaySessionState: () => ({ isConnected: carConnected }),
            addAutoPlaySessionStateListener: (listener) => {
                listener({ isConnected: carConnected });
                return () => {};
            },
        },
        '../design-system/icon': { Icon: 'Icon' },
        '../design-system/tokens': { dafColors: { ink: { 400: '#999' } } },
        './alpr-presence-runtime': {
            presenceCoordinator: coordinator,
            startPresenceRuntime: () => {},
        },
        './automotive-alert-policy': automotivePolicy,
        './driving-alerts': drivingAlerts,
        './upcoming-alert-distance-track': {
            UpcomingAlertDistanceTrack: 'Track',
        },
    };
    const exports = {};
    new Function(
        'require',
        'exports',
        'Date',
        'setTimeout',
        'clearTimeout',
        code,
    )(
        (name) => {
            assert.ok(mocks[name], name);
            return mocks[name];
        },
        exports,
        { now: () => clock.now },
        (callback, delay) => {
            const timer = {
                callback,
                dueAt: clock.now + delay,
                cancelled: false,
            };
            clock.timers.push(timer);
            return timer;
        },
        (timer) => {
            if (timer) timer.cancelled = true;
        },
    );

    return {
        render(alerts, unrestrictedFixture = false) {
            let view = null;
            for (let attempt = 0; attempt < 10; attempt++) {
                cursor = 0;
                changed = false;
                effects = [];
                const root = exports.DrivingAlertsOverlay({
                    alerts,
                    unrestrictedFixture,
                });
                const overlay = root.type(root.props);
                view = overlay.type(overlay.props);
                effects.forEach((run) => run());
                if (!changed) return view;
            }
            throw new Error('Driving alert overlay did not settle');
        },
        unmount() {
            slots.forEach((slot) => slot?.cleanup?.());
        },
        advance(milliseconds) {
            clock.now += milliseconds;
            for (const timer of clock.timers) {
                if (!timer.cancelled && timer.dueAt <= clock.now) {
                    timer.cancelled = true;
                    timer.callback();
                }
            }
        },
    };
}

test('phone card records its shown alert and shares once-per-drive history with car', async () => {
    let stored = null;
    const coordinator = createPresenceCoordinator({
        load: async () => stored,
        save: async (value) => {
            stored = value;
        },
        randomId: () => 'd'.repeat(32),
        send: async () => {},
    });
    await coordinator.hydrate();
    const alert = {
        coordinate: [0, 0.01],
        distanceMeters: 500,
        id: 'camera-1',
        type: 'alpr',
    };
    const harness = createOverlayHarness(coordinator);
    harness.render([alert]);
    await new Promise((resolve) => setImmediate(resolve));
    const card = harness.render([alert]);
    assert.ok(card);
    assert.equal(coordinator.state.automotiveAlertHistory.entries.length, 0);
    assert.equal(
        coordinator.claimAutomotiveAlert(
            automotivePolicy.getAutomotiveAlertHistoryEntry(alert),
        ),
        null,
        'the pending phone card reserves the shared warning slot',
    );
    card.props.onLayout();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(coordinator.automotiveAlertHistory.entries.length, 1);
    assert.ok(harness.render([alert]));
    harness.unmount();

    const remounted = createOverlayHarness(coordinator);
    remounted.render([alert]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(remounted.render([alert]), null);
    remounted.unmount();
});

test('phone card leaves car-connected warnings to the car banner', async () => {
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async () => {},
        randomId: () => 'd'.repeat(32),
        send: async () => {},
    });
    await coordinator.hydrate();
    const alert = {
        coordinate: [0, 0.01],
        distanceMeters: 500,
        id: 'camera-1',
        type: 'alpr',
    };
    const harness = createOverlayHarness(
        coordinator,
        { now: Date.now(), timers: [] },
        true,
    );
    harness.render([alert]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.render([alert]), null);
    assert.deepEqual(coordinator.automotiveAlertHistory.entries, []);
    harness.unmount();
});

test('phone card waits two minutes before presenting a different upcoming alert', async () => {
    const clock = { now: 1000, timers: [] };
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async () => {},
        randomId: () => 'd'.repeat(32),
        now: () => clock.now,
        send: async () => {},
    });
    await coordinator.hydrate();
    const first = {
        coordinate: [0, 0.01],
        distanceMeters: 300,
        id: 'police-1',
        type: 'police',
    };
    const second = {
        coordinate: [0, 0.02],
        distanceMeters: 500,
        id: 'alpr-1',
        type: 'alpr',
    };
    const harness = createOverlayHarness(coordinator, clock);
    harness.render([first, second]);
    await new Promise((resolve) => setImmediate(resolve));
    const firstCard = harness.render([first, second]);
    assert.equal(
        firstCard.props.children.props.presentation.alerts[0].id,
        'police-1',
    );
    firstCard.props.onLayout();
    firstCard.props.children.props.onDismiss();
    assert.equal(harness.render([first, second]), null);
    harness.advance(automotivePolicy.AUTOMOTIVE_ALERT_MINIMUM_SPACING_MS - 1);
    assert.equal(harness.render([first, second]), null);
    harness.advance(1);
    const nextCard = harness.render([first, second]);
    assert.equal(
        nextCard.props.children.props.presentation.alerts[0].id,
        'alpr-1',
    );
    harness.unmount();
});

test('layout fixture keeps the combined phone card available for E2E checks', () => {
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async () => {},
        randomId: () => 'd'.repeat(32),
        send: async () => {},
    });
    const harness = createOverlayHarness(coordinator);
    const view = harness.render(
        [
            { distanceMeters: 300, id: 'police', type: 'police' },
            { distanceMeters: 500, id: 'camera', type: 'alpr' },
        ],
        true,
    );
    assert.equal(view.props.children.type.name, 'CombinedDrivingAlertsCard');
    harness.unmount();
});
