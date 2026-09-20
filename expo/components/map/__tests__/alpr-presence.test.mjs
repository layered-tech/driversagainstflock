import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresenceCoordinator } from '../alpr-presence-coordinator.js';
import {
    canStartPresencePrompt,
    createPresencePassDetector,
    createPresenceState,
    getPresenceFocus,
    getPresenceMotionPath,
    parsePresenceState,
    PRESENCE_POLICY,
    presenceGuardsHold,
    recordPresencePrompt,
    updatePresenceDrive,
} from '../alpr-presence-policy.js';
import { createPresencePrompt } from '../alpr-presence-prompt.js';
import { getAutomotiveAlertHistoryEntry } from '../automotive-alert-policy.js';

const node = {
    id: 'osm-node-8',
    osm_id: 987654321,
    latitude: 30,
    longitude: -97,
    osm_version: 2,
};
const coordinates = [
    [-97.002, 30],
    [-96.99, 30],
];

test('rejects distant inventory before pairwise isolation and route projections', () => {
    let coordinateReads = 0;
    const nodes = Array.from({ length: 200 }, (_, index) => ({
        osm_id: index + 1,
        latitude: 31,
        get longitude() {
            coordinateReads += 1;
            return -97 + index * 0.002;
        },
    }));
    const detector = createPresencePassDetector();
    detector.update({
        coordinates,
        coverageComplete: true,
        location: {
            latitude: 30,
            longitude: -97.001,
            heading: 90,
            accuracy: 4,
        },
        navigationActive: true,
        nodes,
        now: 1000,
        routeKey: 'route',
    });

    assert.equal(detector.inspect().trackedApproaches, 0);
    assert.ok(
        coordinateReads <= nodes.length * 2,
        `${coordinateReads} coordinate reads`,
    );
});
const location = (x, time) => ({
    longitude: x,
    latitude: 30,
    accuracy: 4,
    speed: 10,
    heading: 90,
    recordedAt: time,
    roadMatch: {
        isOffRoad: false,
        edgeMatchProbability: 0.99,
        wayId: 'road-1',
        roadClass: 'residential',
    },
});
const formerEligibilityGates = [
    ['missing timestamp', (value) => ({ ...value, recordedAt: undefined })],
    ['old repeated timestamp', (value) => ({ ...value, recordedAt: 1 })],
    ['future timestamp', (value) => ({ ...value, recordedAt: 999999 })],
    ['invalid timestamp', (value) => ({ ...value, recordedAt: 'invalid' })],
    [
        'backward timestamp',
        (value, index) => ({ ...value, recordedAt: 100000 - index * 1000 }),
    ],
    ['reported stopped speed', (value) => ({ ...value, speed: 0 })],
    ['reported high speed', (value) => ({ ...value, speed: 40 })],
    ['unavailable speed', (value) => ({ ...value, speed: undefined })],
    [
        'teleport flag',
        (value) => ({
            ...value,
            roadMatch: { ...value.roadMatch, isTeleport: true },
        }),
    ],
    [
        'roundabout flag',
        (value) => ({
            ...value,
            roadMatch: { ...value.roadMatch, isRoundabout: true },
        }),
    ],
    [
        'off-road flag',
        (value) => ({
            ...value,
            roadMatch: { ...value.roadMatch, isOffRoad: true },
        }),
    ],
    [
        'motorway class',
        (value) => ({
            ...value,
            roadMatch: { ...value.roadMatch, roadClass: 'motorway' },
        }),
    ],
    [
        'interchange class',
        (value) => ({
            ...value,
            roadMatch: { ...value.roadMatch, roadClass: 'motorway_link' },
        }),
    ],
    ['unavailable road context', (value) => ({ ...value, roadMatch: null })],
    [
        'changing matched road identity',
        (value, index) => ({
            ...value,
            roadMatch: { ...value.roadMatch, wayId: `road-${index}` },
        }),
    ],
];
const viewport = {
    visibleWidth: 900,
    visibleHeight: 600,
    cameraPadding: { top: 60, left: 100, right: 10, bottom: 40 },
};
function pass(transformLocation = (value) => value) {
    const detector = createPresencePassDetector();
    const sample = (x, time, index) => ({
        location: transformLocation(location(x, time), index),
        now: time,
        coordinates,
        nodes: [node],
        coverageComplete: true,
        routeKey: 'route-1',
    });
    assert.equal(detector.update(sample(-97.0004, 100000, 0)), null);
    assert.equal(detector.update(sample(-97.0001, 102000, 1)), null);
    return detector.update(sample(-96.9998, 104000, 2));
}
test('a pass requires accurate positional progress and retains the canonical identity', () => {
    const encounter = pass();
    assert.equal(encounter.osmNodeId, 987654321);
    assert.equal(encounter.passedAt, 104000);
    for (const change of [{ accuracy: 50 }]) {
        const detector = createPresencePassDetector();
        const initial = {
            location: location(-97.0004, 100000),
            now: 100000,
            coordinates,
            nodes: [node],
            coverageComplete: true,
            routeKey: 'r',
        };
        detector.update(initial);
        detector.update({
            ...initial,
            location: location(-97.0001, 102000),
            now: 102000,
        });
        assert.equal(
            detector.update({
                ...initial,
                location: { ...location(-96.9998, 104000), ...change },
                now: 104000,
            }),
            null,
        );
    }
});
test('former timestamp, speed and road-context gates do not block a positional pass', () => {
    for (const [name, transformLocation] of formerEligibilityGates) {
        assert.equal(pass(transformLocation)?.osmNodeId, node.osm_id, name);
    }
});
test('disappearance, reroute, nearby point, parallel path and reversal are not passes', () => {
    for (const overrides of [
        { nodes: [] },
        { routeKey: 'new' },
        { location: location(-97.0003, 102000) },
        {
            location: {
                ...location(-96.9998, 102000),
                latitude: 30.0003,
            },
        },
        { location: location(-97.0005, 102000) },
    ]) {
        const detector = createPresencePassDetector();
        const initial = {
            location: location(-97.0004, 100000),
            now: 100000,
            coordinates,
            nodes: [node],
            coverageComplete: true,
            routeKey: 'r',
        };
        detector.update(initial);
        assert.equal(
            detector.update({
                ...initial,
                location: location(-96.9998, 102000),
                now: 102000,
                ...overrides,
            }),
            null,
        );
    }
});
test('stationary samples and one GPS jump alone cannot establish a pass', () => {
    const initial = {
        now: 100000,
        coordinates,
        nodes: [node],
        coverageComplete: true,
        routeKey: 'r',
    };
    const stationary = createPresencePassDetector();
    for (const time of [100000, 102000, 104000]) {
        assert.equal(
            stationary.update({
                ...initial,
                now: time,
                location: location(-97.0004, time),
            }),
            null,
        );
    }

    const jumped = createPresencePassDetector();
    assert.equal(
        jumped.update({
            ...initial,
            location: location(-97.0004, 100000),
        }),
        null,
    );
    assert.equal(
        jumped.update({
            ...initial,
            now: 102000,
            location: location(-96.9995, 102000),
        }),
        null,
    );
    assert.equal(
        jumped.update({
            ...initial,
            now: 104000,
            location: location(-96.9995, 104000),
        }),
        null,
    );
});
test('timing and budget boundaries count repeated nodes and preserve cooldown across drives', () => {
    let state = updatePresenceDrive(createPresenceState('a'.repeat(32), 0), {
        connected: true,
        driving: true,
        now: 0,
    });
    const e = { osmNodeId: 1, passedAt: 100000 };
    assert.equal(canStartPresencePrompt(state, e, 102999), false);
    assert.equal(canStartPresencePrompt(state, e, 103000), true);
    assert.equal(canStartPresencePrompt(state, e, 115000), true);
    assert.equal(canStartPresencePrompt(state, e, 115001), false);
    state = recordPresencePrompt(state, e, 103000);
    assert.equal(
        canStartPresencePrompt(
            state,
            { ...e, passedAt: 220000, osmNodeId: 2 },
            222999,
        ),
        false,
    );
    assert.equal(
        canStartPresencePrompt(
            state,
            { ...e, passedAt: 220000, osmNodeId: 2 },
            223000,
        ),
        true,
    );
    assert.equal(
        canStartPresencePrompt(state, { ...e, passedAt: 400000 }, 402999),
        false,
    );
    assert.equal(
        canStartPresencePrompt(state, { ...e, passedAt: 400000 }, 403000),
        true,
    );
    for (let i = 1; i < 15; i++)
        state = recordPresencePrompt(state, e, 103000 + i * 300000);
    assert.equal(
        canStartPresencePrompt(state, { ...e, passedAt: 5000000 }, 5003000),
        false,
    );
    assert.equal(parsePresenceState(JSON.stringify(state)).drive.count, 15);
    const legacyState = structuredClone(state);
    delete legacyState.automotiveAlertHistory;
    assert.deepEqual(
        parsePresenceState(JSON.stringify(legacyState)).automotiveAlertHistory,
        { driveId: state.drive.id, entries: [] },
    );
    state = updatePresenceDrive(state, {
        connected: true,
        driving: true,
        now: 6000000,
    });
    state = updatePresenceDrive(state, {
        connected: false,
        driving: false,
        now: 6001000,
    });
    assert.equal(
        updatePresenceDrive(state, {
            connected: true,
            driving: false,
            now: 7800999,
        }).drive.count,
        15,
    );
    assert.equal(
        updatePresenceDrive(state, {
            connected: true,
            driving: false,
            now: 7801000,
        }).drive.count,
        0,
    );
    assert.throws(() => parsePresenceState('{"version":1}'));
});
test('focus preserves heading and rejects a second camera in the actual viewport', () => {
    const encounter = pass();
    const context = {
        enabled: true,
        connected: true,
        visible: true,
        blocked: false,
        manual: false,
        routeKey: 'route-1',
        location: location(-96.9995, 107000),
        nodes: [node],
        coverageComplete: true,
        navigationActive: true,
        maneuverSeconds: 60,
        viewport,
    };
    assert.equal(presenceGuardsHold(context, encounter, 107000), true);
    const focus = getPresenceFocus(encounter, context);
    assert.ok(focus);
    assert.equal(focus.heading, 90);
    assert.equal(focus.pitch, 55);
    assert.deepEqual(focus.centerCoordinate, [node.longitude, node.latitude]);
    assert.deepEqual(focus.padding, viewport.cameraPadding);
    assert.equal(
        presenceGuardsHold(
            { ...context, maneuverSeconds: 29.9 },
            encounter,
            107000,
        ),
        false,
    );
    assert.equal(
        presenceGuardsHold({ ...context, blocked: true }, encounter, 107000),
        false,
    );
    assert.equal(
        getPresenceFocus(encounter, {
            ...context,
            nodes: [
                node,
                { osm_id: 9, latitude: 30.0001, longitude: -96.9995 },
            ],
        }),
        null,
    );
});
test('outbox reports only explicit negatives once and retries the same event', async () => {
    let time = 107000,
        stored = null,
        id = 0,
        online = false;
    const sent = [],
        messages = [];
    const runtime = createPresenceCoordinator({
        load: async () => stored,
        save: async (value) => {
            stored = value;
        },
        randomId: () => String(++id).padStart(32, '0'),
        now: () => time,
        send: async (payload) => {
            sent.push(payload);
            if (!online) throw new Error('offline');
        },
        notify: (value) => messages.push(value),
    });
    await runtime.hydrate();
    const reservation = await runtime.reserve(pass());
    await runtime.presented(reservation);
    assert.equal(runtime.state.outbox.length, 0);
    await runtime.reportMissing(reservation, 'android_auto');
    await runtime.reportMissing(reservation, 'android_auto');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.state.outbox.length, 1);
    assert.equal(sent[0].osm_node_id, 987654321);
    online = true;
    time += 60000;
    await runtime.flush();
    assert.equal(runtime.state.outbox.length, 0);
    assert.deepEqual(sent[0], sent[1]);
    assert.ok(messages.includes('Report queued'));
    assert.ok(messages.includes('Report received'));
    const restarted = createPresenceCoordinator({
        load: async () => stored,
        save: async () => {},
        randomId: () => '',
        send: async () => {},
    });
    await restarted.hydrate();
    assert.equal(restarted.state.drive.count, 1);
});
test('failed hydration and writes suppress prompting and refused alerts do not consume limits', async () => {
    const broken = createPresenceCoordinator({
        load: async () => {
            throw new Error('locked');
        },
        save: async () => {},
        randomId: () => '',
        send: async () => {},
    });
    assert.equal(await broken.reserve(pass()), null);
    const runtime = createPresenceCoordinator({
        load: async () => null,
        save: async () => {},
        randomId: () => 'a'.repeat(32),
        send: async () => {},
        now: () => 107000,
    });
    const reservation = await runtime.reserve(pass());
    await runtime.refused(reservation);
    assert.equal(runtime.state.drive.count, 0);
    assert.equal(runtime.state.lastPromptAt, null);
});

function promptHarness({
    refuse = false,
    cameraDelay = false,
    cameraFailure = false,
    traceFailure = false,
    reservationDelay = false,
    reservationFailure = false,
} = {}) {
    let time = 100000,
        saved = null,
        context = {
            enabled: true,
            connected: true,
            visible: true,
            blocked: false,
            manual: false,
            warningBusy: true,
            routeKey: 'route-1',
            coordinates,
            nodes: [node],
            coverageComplete: true,
            navigationActive: true,
            maneuverSeconds: 90,
            viewport,
            location: location(-97.0004, 100000),
        };
    const shown = [],
        frames = [],
        restores = [],
        highlights = [],
        sent = [],
        suppressionEvents = [],
        traces = [];
    let release,
        releaseReservation,
        saveCalls = 0,
        suppressionSequence = 0;
    const reservationGate = reservationDelay
        ? new Promise((resolve) => {
              releaseReservation = resolve;
          })
        : null;
    const coordinator = createPresenceCoordinator({
        load: async () => saved,
        save: async (v) => {
            if (reservationGate) await reservationGate;
            saveCalls += 1;
            if (reservationFailure && saveCalls > 1)
                throw new Error('reservation failed');
            saved = v;
        },
        randomId: () => 'a'.repeat(32),
        now: () => time,
        send: async (p) => {
            sent.push(p);
        },
    });
    const prompt = createPresencePrompt({
        coordinator,
        getContext: () => context,
        now: () => time,
        platform: 'android_auto',
        trace: (event, details) => {
            if (traceFailure && event.startsWith('confirmation-closed:'))
                throw new Error('debug unavailable');
            traces.push({ event, details });
        },
        host: {
            showAlert: (config) => {
                shown.push(config);
                if (!refuse) void config.onWillShow();
            },
            dismissAlert: () => {},
        },
        camera: {
            focus: async (frame, shouldApply) => {
                if (cameraFailure === 'throw')
                    throw new Error('camera unavailable');
                if (cameraFailure) return false;
                if (cameraDelay)
                    await new Promise((resolve) => {
                        release = resolve;
                    });
                if (!shouldApply()) return false;
                frames.push(frame);
                return true;
            },
            restore: (manual) => restores.push(manual),
        },
        highlight: (value) => highlights.push(value),
        suppressAlerts: () => {
            const id = ++suppressionSequence;
            let released = false;
            suppressionEvents.push(`acquire:${id}`);
            return {
                release: () => {
                    if (released) return false;
                    released = true;
                    suppressionEvents.push(`release:${id}`);
                    return true;
                },
            };
        },
    });
    const step = async (x, next, changes = {}) => {
        time = next;
        context = { ...context, location: location(x, next), ...changes };
        prompt.tick();
        await new Promise((resolve) => setImmediate(resolve));
    };
    const start = async () => {
        await step(-97.0004, 100000);
        await step(-97.0001, 102000);
        await step(-96.9998, 104000, { warningBusy: false });
        await step(-96.9996, 106000);
        await step(-96.9995, 107000);
    };
    return {
        prompt,
        coordinator,
        shown,
        frames,
        restores,
        highlights,
        sent,
        suppressionEvents,
        traces,
        step,
        start,
        release: () => release?.(),
        releaseReservation: () => releaseReservation?.(),
    };
}
test('approach tracking stays ownerless and async presentation setup owns suppression', async () => {
    const h = promptHarness({ reservationDelay: true });
    await h.step(-97.0004, 100000);
    await h.step(-97.0001, 102000);
    await h.step(-96.9998, 104000, { warningBusy: false });
    await h.step(-96.9996, 106000);
    assert.deepEqual(h.suppressionEvents, []);
    await h.step(-96.9995, 107000);
    assert.deepEqual(h.suppressionEvents, ['acquire:1']);
    assert.equal(h.shown.length, 0);

    h.releaseReservation();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.shown.length, 1);
    h.shown[0].primaryAction.onPress();
    assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
});
test('presentation persistence failure releases alert suppression', async () => {
    const h = promptHarness({ reservationFailure: true });
    await h.start();
    assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
    assert.equal(h.shown.length, 1);
    assert.equal(h.coordinator.state, null);
});
test('prompt start ignores former timestamp, speed and road-context gates', async () => {
    for (const [name, transformLocation] of formerEligibilityGates) {
        const h = promptHarness();
        for (const [index, [x, time]] of [
            [-97.0004, 100000],
            [-97.0001, 102000],
            [-96.9998, 104000],
            [-96.9996, 106000],
            [-96.9995, 107000],
        ].entries()) {
            await h.step(x, time, {
                warningBusy: time < 104000,
                location: transformLocation(location(x, time), index),
            });
        }
        assert.equal(h.shown.length, 1, name);
        assert.equal(h.prompt.ownsCamera, true, name);
    }
});
test('active prompt continuation ignores former timestamp, speed and road-context gates', async () => {
    for (const [name, transformLocation] of formerEligibilityGates) {
        const h = promptHarness();
        await h.start();
        await h.step(-96.9994, 108000, {
            location: transformLocation(location(-96.9994, 108000), 3),
        });
        assert.equal(h.prompt.ownsCamera, true, name);
    }
});
test('upcoming warnings do not create passes; a separate prompt starts after passing and watchdog owns full twenty seconds', async () => {
    const h = promptHarness();
    await h.start();
    assert.equal(h.shown.length, 1);
    assert.equal(h.coordinator.state.drive.count, 1);
    assert.equal(h.shown[0].priority, 'low');
    assert.equal(h.shown[0].durationMs, 20000);
    assert.equal(h.shown[0].primaryAction.title, 'Still there? / Dismiss');
    assert.equal(h.shown[0].secondaryAction.title, 'Not there');
    await h.step(-96.9993, 109000);
    await h.step(-96.9991, 111000);
    await h.step(-96.9989, 113000);
    await h.step(-96.9987, 115000);
    for (let time = 117000; time <= 125000; time += 2000)
        await h.step(-96.9985 + ((time - 117000) / 1000) * 0.0001, time);
    await h.step(-96.9975, 126999);
    assert.equal(h.prompt.ownsCamera, true);
    await h.step(-96.9975, 127000);
    assert.equal(h.prompt.ownsCamera, false);
    assert.equal(h.highlights.at(-1), null);
    assert.equal(h.sent.length, 0);
    assert.equal(h.restores.at(-1), false);
    assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
});
test('upcoming candidates cannot cancel or displace an active confirmation', async () => {
    const h = promptHarness();
    await h.start();
    await h.step(-96.9994, 108000, { warningBusy: true });
    assert.equal(h.prompt.ownsCamera, true);
    assert.equal(h.shown.length, 1);
    assert.deepEqual(h.suppressionEvents, ['acquire:1']);
});
test('native acknowledgement waits ten seconds before expiring and ignores late callbacks', async () => {
    const h = promptHarness({ refuse: true });
    await h.start();
    assert.equal(h.frames.length, 0);
    await h.step(-96.9994, 116999);
    assert.equal(h.prompt.inspect().phase, 'presenting');
    assert.deepEqual(h.suppressionEvents, ['acquire:1']);
    await h.step(-96.9994, 117000);
    assert.equal(h.prompt.inspect().phase, 'observing');
    assert.equal(h.coordinator.state.drive.count, 0);
    assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
    await h.shown[0].onWillShow();
    assert.equal(h.frames.length, 0);
    assert.equal(h.sent.length, 0);
});
test('manual pan invalidates asynchronous focus and does not restore follow over the gesture', async () => {
    const h = promptHarness({ cameraDelay: true });
    await h.start();
    h.prompt.interrupt(true);
    h.release();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.frames.length, 0);
    assert.equal(h.restores.at(-1), true);
    assert.equal(h.coordinator.state.drive.count, 1);
    assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
    h.shown[0].secondaryAction.onPress();
    assert.equal(h.sent.length, 0);
});
test('dismissal is not a positive vote, explicit negative closes independently and double taps do not duplicate', async () => {
    for (const action of ['primaryAction', 'secondaryAction']) {
        const h = promptHarness();
        await h.start();
        h.shown[0][action].onPress();
        h.shown[0][action].onPress();
        await new Promise((r) => setImmediate(r));
        assert.equal(h.prompt.ownsCamera, false);
        assert.equal(h.sent.length, action === 'secondaryAction' ? 1 : 0);
        assert.equal(h.coordinator.state.drive.count, 1);
        assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
    }
});
test('navigation demands, viewport changes, lost certainty and disconnect permanently preempt', async () => {
    for (const change of [
        { connected: false },
        { blocked: true },
        {
            location: {
                ...location(-96.9994, 108000),
                accuracy: 50,
            },
        },
        { maneuverSeconds: 20 },
        { coverageComplete: false },
        { routeKey: 'route-2' },
        { viewport: { ...viewport, visibleHeight: 100 } },
    ]) {
        const h = promptHarness();
        await h.start();
        await h.step(-96.9994, 108000, change);
        assert.equal(h.prompt.ownsCamera, false);
        await h.step(-96.9993, 109000, {
            warningBusy: false,
            connected: true,
            visible: true,
            blocked: false,
            navigationActive: true,
            maneuverSeconds: 90,
            coverageComplete: true,
            routeKey: 'route-1',
            viewport,
        });
        assert.equal(h.shown.length, 1);
        assert.equal(h.coordinator.state.drive.count, 1);
        assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
    }
});

test('tracker cancellation releases suppression and makes late actions inert', async () => {
    const h = promptHarness();
    await h.start();
    h.prompt.stop();
    assert.equal(h.prompt.ownsCamera, false);
    assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
    h.shown[0].secondaryAction.onPress();
    assert.equal(h.sent.length, 0);
});

test('pending eligibility is retried through fifteen seconds and a late start retains its full display window', async () => {
    const h = promptHarness();
    await h.step(-97.0004, 100000, { maneuverSeconds: 20 });
    await h.start();
    assert.equal(h.shown.length, 0);
    for (let time = 108000; time <= 116000; time += 2000)
        await h.step(-96.9995 + ((time - 107000) / 1000) * 0.00008, time);
    await h.step(-96.99862, 118000, { maneuverSeconds: 90 });
    assert.equal(h.shown.length, 1);
    assert.equal(h.prompt.ownsCamera, true);
    for (let time = 120000; time <= 136000; time += 2000)
        await h.step(-96.99862 + ((time - 118000) / 1000) * 0.00008, time);
    await h.step(-96.9971, 137999);
    assert.equal(h.prompt.ownsCamera, true);
    await h.step(-96.9971, 138000);
    assert.equal(h.prompt.ownsCamera, false);
});
test('unsafe pending encounters expire and native rejection refunds only an undisplayed prompt', async () => {
    const h = promptHarness();
    await h.step(-97.0004, 100000, { maneuverSeconds: 20 });
    await h.start();
    for (let time = 108000; time <= 120000; time += 2000)
        await h.step(-96.9995 + ((time - 107000) / 1000) * 0.00008, time);
    await h.step(-96.9983, 121000, { maneuverSeconds: 90 });
    assert.equal(h.shown.length, 0);
    const rejected = promptHarness();
    await rejected.start();
    rejected.shown[0].onDidDismiss('system');
    await new Promise((r) => setImmediate(r));
    assert.equal(rejected.coordinator.state.drive.count, 0);
    assert.equal(rejected.prompt.ownsCamera, false);
});
test('U-turn after a confident pass preempts instead of asking about a now-ahead camera', async () => {
    const h = promptHarness();
    await h.start();
    await h.step(-96.9995, 108000, {
        location: { ...location(-96.9995, 108000), heading: 270 },
    });
    assert.equal(h.prompt.ownsCamera, false);
    assert.equal(h.sent.length, 0);
});

test('simultaneous car surfaces reserve one budget slot without poisoning encrypted state', async () => {
    const runtime = createPresenceCoordinator({
        load: async () => null,
        save: async () => {},
        randomId: () => 'a'.repeat(32),
        send: async () => {},
        now: () => 107000,
    });
    const results = await Promise.all([
        runtime.reserve(pass()),
        runtime.reserve(pass()),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(runtime.state.drive.count, 0);
    await runtime.presented(results.find(Boolean));
    assert.equal(runtime.state.drive.count, 1);
});
test('automotive alert history survives remounts, coordinates surfaces, and resets with a new drive', async () => {
    let stored = null;
    let time = 107000;
    const makeCoordinator = () =>
        createPresenceCoordinator({
            load: async () => stored,
            save: async (value) => {
                stored = value;
            },
            randomId: () => 'h'.repeat(32),
            now: () => time,
            send: async () => {},
        });
    const alpr = {
        coordinate: [-97, 30],
        id: 'reader-1',
        type: 'alpr',
    };
    const alprEntry = getAutomotiveAlertHistoryEntry(alpr);
    const laterAlprEntry = getAutomotiveAlertHistoryEntry({
        ...alpr,
        coordinate: [-96.996, 30],
        id: 'reader-2',
    });
    const coordinator = makeCoordinator();
    await coordinator.hydrate();

    const refusedClaim = coordinator.claimAutomotiveAlert(alprEntry);
    assert.ok(refusedClaim);
    assert.equal(
        coordinator.claimAutomotiveAlert(alprEntry),
        null,
        'a pending surface owns the alert attempt',
    );
    assert.equal(refusedClaim.release(), true);
    assert.ok(
        coordinator.claimAutomotiveAlert(alprEntry)?.release(),
        'a refused host leaves the alert eligible',
    );

    const acceptedClaim = coordinator.claimAutomotiveAlert(alprEntry);
    const unacceptedClaim = coordinator.claimAutomotiveAlert(laterAlprEntry);
    assert.ok(unacceptedClaim);
    assert.equal(acceptedClaim.commit(), true);
    assert.equal(unacceptedClaim.release(), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(coordinator.automotiveAlertHistory.entries, [alprEntry]);

    const restarted = makeCoordinator();
    await restarted.hydrate();
    assert.equal(restarted.claimAutomotiveAlert(alprEntry), null);
    assert.ok(
        restarted.claimAutomotiveAlert(laterAlprEntry)?.release(),
        'an unaccepted concurrent alert was not recorded',
    );
    assert.ok(
        restarted
            .claimAutomotiveAlert(
                getAutomotiveAlertHistoryEntry({ ...alpr, type: 'police' }),
            )
            ?.release(),
        'mixed alert types remain distinct',
    );

    await restarted.activity(true, false);
    time += 1000;
    await restarted.activity(false, false);
    time += PRESENCE_POLICY.driveEndMs;
    await restarted.activity(true, false);
    assert.deepEqual(restarted.automotiveAlertHistory.entries, []);
    assert.ok(restarted.claimAutomotiveAlert(alprEntry)?.release());
});
test('a failed encrypted write suppresses future prompts without resetting the budget', async () => {
    let fail = false;
    const runtime = createPresenceCoordinator({
        load: async () => null,
        save: async () => {
            if (fail) throw new Error('locked');
        },
        randomId: () => 'a'.repeat(32),
        send: async () => {},
        now: () => 107000,
    });
    await runtime.hydrate();
    fail = true;
    const reservation = await runtime.reserve(pass());
    await assert.rejects(runtime.presented(reservation), /locked/);
    assert.equal(runtime.state, null);
    assert.equal(await runtime.reserve(pass()), null);
});

test('a brief coverage gap at the crossing retains the original pass time', () => {
    const detector = createPresencePassDetector();
    const sample = (x, time, coverageComplete = true) => ({
        location: location(x, time),
        now: time,
        coordinates,
        nodes: [node],
        coverageComplete,
        routeKey: 'same-road',
    });
    detector.update(sample(-97.0004, 100000));
    detector.update(sample(-97.0001, 102000));
    assert.equal(detector.update(sample(-96.9998, 104000, false)), null);
    assert.equal(detector.inspect().trackedApproaches, 1);
    assert.match(
        detector.inspect().reason,
        /Passed camera; waiting for inventory coverage/,
    );
    const encounter = detector.update(sample(-96.9996, 106000));
    assert.equal(encounter.osmNodeId, node.osm_id);
    assert.equal(encounter.passedAt, 104000);
});

test('confirmation applies one node-centered camera with navigation pitch and fixed zoom', async () => {
    const h = promptHarness();
    await h.step(-97.0004, 100000, {
        navigationCamera: { pitch: 55, zoomLevel: 16.7 },
    });
    await h.step(-97.0001, 102000);
    await h.step(-96.9998, 104000, { warningBusy: false });
    await h.step(-96.9995, 107000);
    assert.equal(h.frames.length, 1);
    const frame = h.frames[0];
    assert.deepEqual(frame.centerCoordinate, [node.longitude, node.latitude]);
    assert.equal(frame.pitch, 55);
    assert.equal(frame.zoomLevel, 16.7);
    for (let i = 1; i <= 19; i++) {
        await h.step(-96.9995 + i * 0.0001, 107000 + i * 1000, {
            navigationCamera: { pitch: 54 + i / 10, zoomLevel: 16 + i / 10 },
        });
        assert.equal(h.prompt.ownsCamera, true);
    }
    assert.equal(
        h.frames.length,
        1,
        'GPS and navigation zoom updates cannot move the focused camera',
    );
    await h.step(-96.9975, 127000);
    assert.equal(h.prompt.ownsCamera, false);
    assert.equal(h.restores.at(-1), false);
});

test('debug reset persists drive, global and same-node limits while retaining queued reports and identity', async () => {
    let stored = null;
    const coordinator = createPresenceCoordinator({
        load: async () => stored,
        save: async (value) => {
            stored = value;
        },
        randomId: () => 'r'.repeat(32),
        now: () => 107000,
        send: async () => {
            throw new Error('offline');
        },
    });
    const reservation = await coordinator.reserve(pass());
    await coordinator.presented(reservation);
    await coordinator.reportMissing(reservation, 'android_auto');
    await new Promise((resolve) => setImmediate(resolve));
    const before = structuredClone(coordinator.state);
    assert.equal(before.drive.count, 1);
    assert.equal(before.nodeTimes[node.osm_id], 107000);
    assert.equal(before.lastPromptAt, 107000);
    assert.equal(before.outbox.length, 1);
    await coordinator.resetLimits();
    const after = parsePresenceState(stored);
    assert.equal(after.drive.count, 0);
    assert.equal(after.lastPromptAt, null);
    assert.deepEqual(after.nodeTimes, {});
    assert.equal(after.reporterId, before.reporterId);
    assert.deepEqual(after.drive, { ...before.drive, count: 0 });
    assert.deepEqual(after.outbox, before.outbox);
    assert.ok(
        await coordinator.reserve(pass()),
        'the same node is immediately eligible for another test',
    );
});

test('callbacks from before a reset cannot restore old cooldowns or overwrite a new budget', async () => {
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async () => {},
        randomId: () => 'r'.repeat(32),
        now: () => 107000,
    });
    const old = await coordinator.reserve(pass());
    await coordinator.resetLimits();
    await coordinator.presented(old);
    assert.equal(coordinator.state.lastPromptAt, null);
    assert.deepEqual(coordinator.state.nodeTimes, {});
    const next = await coordinator.reserve(pass());
    await coordinator.presented(next);
    await coordinator.refused(old, true);
    assert.equal(coordinator.state.drive.count, 1);
    assert.equal(coordinator.state.lastPromptAt, 107000);
    assert.equal(coordinator.state.nodeTimes[node.osm_id], 107000);
});

test('a failed reset write rejects instead of reporting successful reset', async () => {
    let fail = false;
    let stored;
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async (value) => {
            if (fail) throw new Error('locked');
            stored = value;
        },
        randomId: () => 'r'.repeat(32),
        now: () => 107000,
    });
    await coordinator.reserve(pass());
    const before = stored;
    fail = true;
    await assert.rejects(coordinator.resetLimits(), /locked/);
    assert.equal(stored, before);
    assert.equal(coordinator.state, null);
});

test('free driving has no maneuver-clearance requirement, while active navigation retains it', () => {
    const encounter = pass();
    const context = {
        enabled: true,
        connected: true,
        visible: true,
        routeKey: 'route-1',
        location: location(-96.9995, 107000),
        nodes: [node],
        coverageComplete: true,
        navigationActive: false,
        maneuverSeconds: null,
    };
    assert.equal(presenceGuardsHold(context, encounter, 107000), true);
    assert.equal(
        presenceGuardsHold(
            { ...context, navigationActive: true },
            encounter,
            107000,
        ),
        false,
    );
    assert.equal(
        presenceGuardsHold(
            { ...context, navigationActive: true, maneuverSeconds: 30 },
            encounter,
            107000,
        ),
        true,
    );
});

test('GPS course detects a roadside pass in every direction without predicted road geometry', () => {
    for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const detector = createPresencePassDetector();
        const radians = (heading * Math.PI) / 180;
        const target = {
            osm_id: 12634608635,
            latitude: 43.1099621,
            longitude: -88.2445066,
        };
        let encounter;
        for (const [index, distance] of [-80, -30, 20].entries()) {
            const time = 100000 + index * 2000;
            const fix = {
                ...location(0, time),
                latitude:
                    target.latitude +
                    (Math.cos(radians) * distance + Math.sin(radians) * 26.46) /
                        111195,
                longitude:
                    target.longitude +
                    (Math.sin(radians) * distance - Math.cos(radians) * 26.46) /
                        (111195 * Math.cos((target.latitude * Math.PI) / 180)),
                heading,
                speed: 25,
            };
            encounter = detector.update({
                location: fix,
                now: time,
                nodes: [target],
                coverageComplete: true,
                routeKey: 'free',
                coordinates: getPresenceMotionPath(fix),
            });
        }
        assert.equal(encounter?.osmNodeId, target.osm_id, `heading ${heading}`);
    }
});

test('GPS update gaps preserve positional approach tracking', () => {
    const detector = createPresencePassDetector();
    const update = (x, now) =>
        detector.update({
            location: location(x, now),
            now,
            coordinates,
            nodes: [node],
            coverageComplete: true,
            routeKey: 'route-1',
        });
    assert.equal(update(-97.0004, 100000), null);
    assert.equal(update(-97.0001, 110000), null);
    const encounter = update(-96.9998, 120000);
    assert.equal(encounter?.osmNodeId, node.osm_id);
    assert.equal(encounter.passedAt, 120000);
});

test('unshown reservations never persist cooldowns or spend the drive budget', async () => {
    let stored;
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async (value) => {
            stored = value;
        },
        randomId: () => 'r'.repeat(32),
        now: () => 107000,
    });
    const reservation = await coordinator.reserve(pass());
    assert.ok(reservation);
    assert.equal(coordinator.state.drive.count, 0);
    assert.equal(parsePresenceState(stored).lastPromptAt, null);
    assert.deepEqual(parsePresenceState(stored).nodeTimes, {});
    assert.equal(await coordinator.reserve(pass()), null);
    await coordinator.refused(reservation);
    await coordinator.presented(reservation);
    assert.equal(coordinator.state.drive.count, 0);
    assert.ok(await coordinator.reserve(pass()));
});

test('slow reservation setup does not start the native acknowledgement timeout', async () => {
    const h = promptHarness({ reservationDelay: true });
    await h.start();
    await h.step(-96.9994, 108500);
    assert.equal(h.prompt.inspect().phase, 'presenting');
    h.releaseReservation();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.shown.length, 1);
    assert.equal(h.coordinator.state.drive.count, 1);
});

test('slow setup gives native acknowledgement its own full timeout window', async () => {
    const h = promptHarness({ reservationDelay: true, refuse: true });
    await h.start();
    await h.step(-96.9994, 108500);
    h.releaseReservation();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.shown.length, 1);
    assert.equal(h.coordinator.state.drive.count, 0);
    await h.step(-96.99935, 109000);
    assert.equal(h.prompt.inspect().phase, 'presenting');
    await h.shown[0].onWillShow();
    assert.equal(h.prompt.inspect().phase, 'showing');
    assert.equal(h.coordinator.state.drive.count, 1);
    assert.equal(h.coordinator.state.lastPromptAt, 109000);
});

test('cancelled or expired setup cannot show late or consume limits', async () => {
    for (const cancel of ['interrupt', 'deadline']) {
        const h = promptHarness({ reservationDelay: true });
        await h.start();
        if (cancel === 'interrupt') h.prompt.interrupt();
        else await h.step(-96.9994, 120000);
        h.releaseReservation();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(h.shown.length, 0, cancel);
        assert.equal(h.coordinator.state.drive.count, 0, cancel);
        assert.equal(h.coordinator.state.lastPromptAt, null, cancel);
        assert.deepEqual(h.coordinator.state.nodeTimes, {}, cancel);
        assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
    }
});

test('late display acknowledgement gets its full wait and display duration', async () => {
    const h = promptHarness({ refuse: true });
    await h.step(-97.0004, 100000, { maneuverSeconds: 20 });
    await h.start();
    await h.step(-96.9994, 118000, { maneuverSeconds: 90 });
    await h.step(-96.9994, 127999);
    assert.equal(h.prompt.inspect().phase, 'presenting');
    await h.shown[0].onWillShow();
    await h.step(-96.9994, 147998);
    assert.equal(h.prompt.inspect().phase, 'showing');
    await h.step(-96.9994, 147999);
    assert.equal(h.prompt.inspect().phase, 'observing');
});

test('late native rejection refunds a locally cancelled prompt once', async () => {
    const h = promptHarness();
    await h.start();
    h.prompt.interrupt();
    h.shown[0].onDidDismiss('system');
    h.shown[0].onDidDismiss('system');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.coordinator.state.drive.count, 0);
    assert.equal(h.coordinator.state.lastPromptAt, null);
    assert.deepEqual(h.coordinator.state.nodeTimes, {});
});

test('free-driving bends preserve pending and visible confirmation while route departures cancel', async () => {
    for (const navigationActive of [false, true]) {
        const h = promptHarness({ refuse: true });
        await h.step(-97.0004, 100000, { navigationActive });
        await h.start();
        const bend = {
            ...location(-96.998, 112000),
            latitude: 30.00014,
            heading: 85,
        };
        await h.step(-96.998, 112000, { location: bend });
        assert.equal(
            h.prompt.inspect().phase,
            navigationActive ? 'observing' : 'presenting',
        );
        await h.shown[0].onWillShow();
        assert.equal(
            h.prompt.inspect().phase,
            navigationActive ? 'observing' : 'showing',
        );
        await h.step(-96.997, 114000, {
            location: { ...bend, longitude: -96.997, latitude: 30.0002 },
        });
        assert.equal(
            h.prompt.inspect().phase,
            navigationActive ? 'observing' : 'showing',
        );
    }
});

test('out-of-order native refunds preserve newer prompts and never restore refused cooldowns', async () => {
    let time = 107000;
    const coordinator = createPresenceCoordinator({
        load: async () => null,
        save: async () => {},
        randomId: () => 'r'.repeat(32),
        now: () => time,
    });
    const first = await coordinator.reserve(pass());
    await coordinator.presented(first);
    time += PRESENCE_POLICY.nodeCooldownMs;
    const second = await coordinator.reserve({
        ...pass(),
        passedAt: time - 3000,
    });
    await coordinator.presented(second);
    await coordinator.refused(first, true);
    assert.equal(coordinator.state.drive.count, 1);
    assert.equal(coordinator.state.lastPromptAt, time);
    assert.equal(coordinator.state.nodeTimes[node.osm_id], time);
    await coordinator.refused(second, true);
    assert.equal(coordinator.state.drive.count, 0);
    assert.equal(coordinator.state.lastPromptAt, null);
    assert.deepEqual(coordinator.state.nodeTimes, {});
});

test('acknowledgement timeout rejects a late response without needing a timer tick', async () => {
    const h = promptHarness({ refuse: true });
    await h.start();
    // Advance the clock without running the prompt watchdog.
    const originalTick = h.prompt.tick;
    h.prompt.tick = () => {};
    await h.step(-96.9994, 117000);
    h.prompt.tick = originalTick;
    await h.shown[0].onWillShow();
    assert.equal(h.prompt.inspect().phase, 'observing');
    assert.equal(h.coordinator.state.drive.count, 0);
});

test('repeated display callbacks never restart or cancel an acknowledged prompt', async () => {
    const h = promptHarness();
    await h.start();
    await h.step(-96.9994, 118000);
    await h.shown[0].onWillShow();
    assert.equal(h.prompt.inspect().phase, 'showing');
    assert.equal(h.prompt.inspect().remainingMs, 9000);
    assert.equal(h.coordinator.state.drive.count, 1);
    assert.equal(h.frames.length, 1);
});

test('free-driving ramp approach follows GPS course through the bend before the pass', () => {
    const detector = createPresencePassDetector();
    const update = (east, north, heading, now) => {
        const sample = {
            ...location(
                node.longitude + east / (111195 * Math.cos(Math.PI / 6)),
                now,
            ),
            latitude: node.latitude + north / 111195,
            heading,
        };
        return detector.update({
            location: sample,
            coordinates: getPresenceMotionPath(sample),
            navigationActive: false,
            now,
            nodes: [node],
            coverageComplete: true,
            routeKey: 'free',
        });
    };
    assert.equal(update(-100, -50, 60, 100000), null);
    assert.equal(update(-50, -10, 75, 102000), null);
    assert.equal(update(-10, 0, 90, 104000), null);
    assert.equal(detector.inspect().trackedApproaches, 1);
    assert.equal(update(20, 0, 90, 106000), null);
    const encounter = update(30, 0, 90, 108000);
    assert.equal(encounter?.osmNodeId, node.osm_id);
    assert.equal(encounter.passedAt, 108000);
});

test('free-driving course changes without forward movement cannot manufacture a pass', () => {
    const detector = createPresencePassDetector();
    const update = (x, heading, now) => {
        const sample = { ...location(x, now), heading };
        return detector.update({
            location: sample,
            coordinates: getPresenceMotionPath(sample),
            navigationActive: false,
            now,
            nodes: [node],
            coverageComplete: true,
            routeKey: 'free',
        });
    };
    assert.equal(update(-97.001, 90, 100000), null);
    assert.equal(update(-97.0007, 90, 102000), null);
    assert.equal(update(-97.0004, 90, 104000), null);
    assert.equal(update(-97.0004, 270, 106000), null);
    assert.equal(update(-97.0007, 270, 108000), null);
});

function freeDrivingSamples() {
    const detector = createPresencePassDetector();
    return (east, north, heading, now) => {
        const sample = {
            ...location(
                node.longitude + east / (111195 * Math.cos(Math.PI / 6)),
                now,
            ),
            latitude: node.latitude + north / 111195,
            heading,
        };
        return detector.update({
            location: sample,
            coordinates: getPresenceMotionPath(sample),
            navigationActive: false,
            now,
            nodes: [node],
            coverageComplete: true,
            routeKey: 'free',
        });
    };
}

test('a right turn can pass a nearby opposite-corner camera without crossing its original travel axis', () => {
    const update = freeDrivingSamples();
    assert.equal(update(-25, -90, 0, 100000), null);
    assert.equal(update(-25, -50, 0, 102000), null);
    assert.equal(update(-20, -25, 45, 104000), null);
    assert.equal(update(15, -25, 90, 106000), null);
    const encounter = update(30, -25, 90, 108000);
    assert.equal(encounter?.osmNodeId, node.osm_id);
});

test('free-driving pass needs two moving behind-plane samples, not repeated GPS or jitter', () => {
    const update = freeDrivingSamples();
    assert.equal(update(-80, 0, 90, 100000), null);
    assert.equal(update(-30, 0, 90, 102000), null);
    assert.equal(update(15, 0, 90, 104000), null);
    assert.equal(update(15, 0, 90, 106000), null);
    assert.equal(update(16, 0, 90, 108000), null);
    assert.equal(update(14, 0, 90, 110000), null);
    assert.equal(update(25, 0, 90, 112000)?.osmNodeId, node.osm_id);
});

test('a camera first seen behind or too far away cannot establish a free-driving pass', () => {
    for (const north of [0, 200]) {
        const update = freeDrivingSamples();
        for (const [index, east] of (north === 0
            ? [20, 40, 60]
            : [-80, -30, 15, 25]
        ).entries())
            assert.equal(update(east, north, 90, 100000 + index * 2000), null);
    }
});

test('intersection plane crossing opens confirmation and allows continuing the turn', async () => {
    const h = promptHarness();
    const step = async (east, north, heading, time) => {
        const sample = {
            ...location(
                node.longitude + east / (111195 * Math.cos(Math.PI / 6)),
                time,
            ),
            latitude: node.latitude + north / 111195,
            heading,
        };
        await h.step(sample.longitude, time, {
            location: sample,
            coordinates: getPresenceMotionPath(sample),
            navigationActive: false,
            warningBusy: false,
        });
    };
    await step(-25, -90, 0, 100000);
    await step(-25, -50, 0, 102000);
    await step(-20, -25, 45, 104000);
    await step(15, -25, 90, 106000);
    await step(30, -25, 90, 108000);
    assert.equal(h.prompt.inspect().phase, 'pending');
    await step(50, -40, 135, 111000);
    assert.equal(h.shown.length, 1);
    assert.equal(h.prompt.inspect().phase, 'showing');
    assert.equal(h.coordinator.state.drive.count, 1);
});

test('render visibility does not reset approach tracking or close confirmation', async () => {
    const h = promptHarness();
    await h.step(-97.0004, 100000, { visible: false });
    await h.start();
    assert.equal(h.shown.length, 1);
    assert.equal(h.prompt.inspect().phase, 'showing');
    await h.step(-96.9994, 108000, { visible: true });
    await h.step(-96.9993, 109000, { visible: false });
    assert.equal(h.prompt.inspect().phase, 'showing');
    assert.equal(h.coordinator.state.drive.count, 1);
});

test('close diagnostics retain the active encounter and guard failure before cleanup', async () => {
    const h = promptHarness();
    await h.start();
    await h.step(-96.9994, 108000, { routeKey: 'route-2' });
    const closed = h.traces.find(
        ({ event }) => event === 'confirmation-closed:guard-failed',
    );
    assert.ok(closed);
    assert.equal(closed.details.snapshot.phase, 'showing');
    assert.equal(closed.details.snapshot.targetNodeId, node.osm_id);
    assert.ok(closed.details.snapshot.blockers.includes('Route changed'));
    assert.equal(closed.details.shownForMs, 1000);
    assert.equal(h.prompt.inspect().encounter, null);
    h.shown[0].onDidDismiss('user');
    assert.equal(
        h.traces.filter(({ event }) => event.startsWith('confirmation-closed:'))
            .length,
        1,
    );
    assert.equal(h.traces.at(-1).event, 'native-dismissed:user');
    assert.equal(h.traces.at(-1).details.appCloseReason, 'guard-failed');
    const exported = JSON.stringify(closed.details);
    for (const field of [
        'latitude',
        'longitude',
        'coordinates',
        'reporterId',
        'routeKey',
    ]) {
        assert.equal(exported.includes(`"${field}"`), false);
    }
});

test('close diagnostics distinguish interruptions, actions, native dismissal and expiration', async () => {
    for (const [reason, close] of [
        ['manual-interruption', (h) => h.prompt.interrupt(true)],
        ['interruption', (h) => h.prompt.interrupt()],
        ['tracker-stopped', (h) => h.prompt.stop()],
        ['dismiss-action', (h) => h.shown[0].primaryAction.onPress()],
        ['report-missing-action', (h) => h.shown[0].secondaryAction.onPress()],
        ['native-dismissed:user', (h) => h.shown[0].onDidDismiss('user')],
        ['duration-expired', (h) => h.step(-96.9994, 127000)],
        [
            'context-unavailable',
            (h) => h.step(-96.9994, 108000, { connected: false }),
        ],
        [
            'focus-invalid',
            (h) =>
                h.step(-96.9994, 108000, {
                    viewport: { ...viewport, visibleHeight: 100 },
                }),
        ],
    ]) {
        const h = promptHarness();
        await h.start();
        await close(h);
        const closed = h.traces.find(
            ({ event }) => event === `confirmation-closed:${reason}`,
        );
        assert.ok(closed, reason);
        assert.equal(closed.details.snapshot.targetNodeId, node.osm_id);
    }
    const h = promptHarness({ refuse: true });
    await h.start();
    await h.step(-96.9994, 117000);
    const closed = h.traces.find(
        ({ event }) => event === 'confirmation-closed:presentation-expired',
    );
    assert.ok(closed);
    assert.equal(closed.details.shownForMs, null);
    assert.equal(closed.details.snapshot.phase, 'presenting');
});

test('camera focus failures include the presentation snapshot', async () => {
    for (const [cameraFailure, reason] of [
        [true, 'camera-focus-failed'],
        ['throw', 'presentation-or-camera-error'],
    ]) {
        const h = promptHarness({ cameraFailure });
        await h.start();
        const closed = h.traces.find(
            ({ event }) => event === `confirmation-closed:${reason}`,
        );
        assert.ok(closed);
        assert.equal(closed.details.snapshot.phase, 'showing');
        assert.equal(closed.details.snapshot.targetNodeId, node.osm_id);
        assert.equal(closed.details.shownForMs, 0);
        assert.equal(h.prompt.ownsCamera, false);
    }
});

test('diagnostic failures cannot prevent dismissal and camera restoration', async () => {
    const h = promptHarness({ traceFailure: true });
    await h.start();
    h.prompt.interrupt(true);
    assert.equal(h.prompt.ownsCamera, false);
    assert.equal(h.restores.at(-1), true);
    assert.deepEqual(h.suppressionEvents, ['acquire:1', 'release:1']);
});
