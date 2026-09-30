import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
    buildPresenceDebugSnapshot,
    createPresenceCameraDiagnostics,
    createPresenceDebugStore,
    formatPresenceDebugSnapshot,
    presenceDebugStore,
} from '../alpr-presence-debug.js';
import {
    createPresencePassDetector,
    createPresenceState,
} from '../alpr-presence-policy.js';
import {
    DEBUG_OVERLAY_ALPR_PRESENCE,
    getDebugOverlayVisibilityWithDefaults,
} from '../debug-overlays.js';

const now = 100000;
const context = {
    enabled: true,
    connected: true,
    visible: true,
    location: {
        latitude: 30,
        longitude: -97.0005,
        speed: 10,
        heading: 90,
        accuracy: 5,
        recordedAt: now,
        roadMatch: {
            isOffRoad: false,
            wayId: 'road',
            edgeMatchProbability: 0.99,
        },
    },
    nodes: [{ osm_id: 12634608635, latitude: 30, longitude: -97 }],
    coordinates: [
        [-97.002, 30],
        [-96.99, 30],
    ],
    coverageComplete: true,
    navigationActive: true,
    maneuverSeconds: 90,
    viewport: { visibleWidth: 700, visibleHeight: 500 },
    inventoryStatus: 'loaded',
    inventoryAgeMs: 200,
    inventoryDistanceMeters: 2,
};
const state = createPresenceState('private-reporter-identity-123456789', 0);
const sample = (changes = {}, limits = state) =>
    buildPresenceDebugSnapshot(
        {
            context: { ...context, ...changes },
            phase: 'observing',
            pass: { reason: 'No qualifying approach', trackedApproaches: 0 },
        },
        limits,
        now,
    );

test('camera diagnostics retain evidence of bouncing even after returning to the node', () => {
    const diagnostics = createPresenceCameraDiagnostics();
    const focus = { centerCoordinate: [-97, 30], zoomLevel: 17, pitch: 55 };
    const frame = (center, zoom = 17) => ({
        properties: { center, zoom, pitch: 55 },
    });
    assert.equal(diagnostics.getSnapshot(), null);
    diagnostics.record(frame([-97, 30]));
    assert.equal(diagnostics.getSnapshot(), null);
    diagnostics.reset(focus);
    diagnostics.record(frame([-97, 30]));
    for (let i = 0; i < 10; i++) {
        diagnostics.record(frame([-97, 30.001], 18.5));
        diagnostics.record(frame([-97, 30]));
    }
    const snapshot = diagnostics.getSnapshot();
    assert.equal(snapshot.samples, 21);
    assert.equal(snapshot.offTargetSamples, 10);
    assert.equal(snapshot.centerOffsetMeters, 0);
    assert.ok(snapshot.maximumCenterOffsetMeters > 100);
    assert.equal(snapshot.zoomDelta, 0);
    assert.equal(snapshot.maximumZoomDelta, 1.5);
    diagnostics.record({ properties: {} });
    assert.deepEqual(diagnostics.getSnapshot(), snapshot);
    const exported = sample({
        cameraDiagnostics: { locked: true, ...snapshot },
    });
    assert.equal(exported.camera.maximumZoomDelta, 1.5);
    assert.doesNotMatch(
        JSON.stringify(exported.camera),
        /-97|30\.001|centerCoordinate/,
    );
    diagnostics.reset(focus);
    assert.equal(diagnostics.getSnapshot().samples, 0);
    assert.equal(diagnostics.getSnapshot().maximumCenterOffsetMeters, null);
});

test('diagnostics retain confidence as information and distinguish unknown isolation', () => {
    const snapshot = sample({
        location: {
            ...context.location,
            accuracy: 20,
            roadMatch: {
                ...context.location.roadMatch,
                edgeMatchProbability: 0.63,
            },
        },
        coverageComplete: false,
        maneuverSeconds: 0,
    });
    assert.ok(!snapshot.blockers.includes('Road confidence below 0.95'));
    assert.ok(!snapshot.blockers.includes('Nearby cameras are not isolated'));
    assert.equal(snapshot.inventory.targets[0].isolated, null);
    assert.ok(!snapshot.blockers.some((reason) => reason.includes('accuracy')));
    assert.ok(
        snapshot.blockers.includes(
            'Nearby camera coverage unavailable or stale',
        ),
    );
    assert.ok(
        snapshot.blockers.includes(
            'Less than 30 seconds of confirmed maneuver clearance',
        ),
    );
    assert.equal(snapshot.location.confidence, 0.63);
    assert.equal(sample().blockers.length, 0);
});
test('diagnostics keep speed and road context informational instead of blocking', () => {
    const formerGates = [
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
            'interchange class',
            (value) => ({
                ...value,
                roadMatch: { ...value.roadMatch, roadClass: 'motorway_link' },
            }),
        ],
        [
            'unavailable road context',
            (value) => ({ ...value, roadMatch: null }),
        ],
    ];

    for (const [name, transformLocation] of formerGates) {
        assert.deepEqual(
            sample({ location: transformLocation(context.location) }).blockers,
            [],
            name,
        );
    }
});
test('encounter diagnostics do not treat matched road changes as blockers', () => {
    const detector = createPresencePassDetector();
    const routeKey = 'route-1';
    let encounter;
    for (const [index, longitude] of [-97.0005, -97.0002, -96.9998].entries()) {
        const recordedAt = now + index * 2000;
        encounter =
            detector.update({
                location: {
                    ...context.location,
                    longitude,
                    recordedAt,
                },
                nodes: context.nodes,
                coordinates: context.coordinates,
                coverageComplete: true,
                routeKey,
                now: recordedAt,
            }) ?? encounter;
    }
    assert.ok(encounter);

    const snapshot = buildPresenceDebugSnapshot(
        {
            context: {
                ...context,
                routeKey,
                location: {
                    ...context.location,
                    longitude: -96.9996,
                    recordedAt: now + 7000,
                    roadMatch: {
                        ...context.location.roadMatch,
                        wayId: 'different-road',
                    },
                },
            },
            encounter,
            phase: 'pending',
            pass: detector.inspect(),
        },
        state,
        now + 7000,
    );

    assert.deepEqual(snapshot.blockers, []);
});
test('roadside camera offset is diagnostic and does not block confirmation', () => {
    const snapshot = sample({
        nodes: [{ ...context.nodes[0], latitude: 30.0003 }],
    });
    assert.equal(snapshot.inventory.targets[0].osmNodeId, 12634608635);
    assert.ok(snapshot.inventory.targets[0].pathOffsetMeters > 30);
    assert.deepEqual(snapshot.blockers, []);
    assert.equal(snapshot.inventory.targets[0].isolated, true);
    const cluster = sample({
        nodes: [
            ...context.nodes,
            { ...context.nodes[0], osm_id: 2, latitude: 30.0001 },
        ],
    });
    assert.ok(cluster.blockers.includes('Nearby cameras are not isolated'));
    assert.equal(cluster.inventory.targets[0].isolated, false);
});
test('snapshots identify limits and unknown data without exposing coordinates or private identity', () => {
    const snapshot = sample(
        {},
        {
            ...state,
            drive: { ...state.drive, count: 15 },
            lastPromptAt: now - 10000,
        },
    );
    assert.equal(
        snapshot.blockers.includes('15-prompt drive limit reached'),
        false,
    );
    assert.equal(snapshot.limits.globalCooldownSeconds, 170);
    assert.ok(snapshot.blockers.includes('Global 180-second cooldown'));
    const serialized = formatPresenceDebugSnapshot(snapshot);
    assert.doesNotMatch(
        serialized,
        /latitude|longitude|reporterId|private-reporter|event_key|coordinates/,
    );
    const unknown = sample(
        { location: null, coordinates: [], nodes: [] },
        null,
    );
    assert.equal(unknown.location.ageMs, null);
    assert.ok(unknown.blockers.includes('Location unavailable'));
    assert.ok(unknown.blockers.includes('Encrypted limits unavailable'));
});
test('same-node diagnostics show a seven-day cooldown', () => {
    const nodeId = context.nodes[0].osm_id;
    const snapshot = buildPresenceDebugSnapshot(
        {
            context: { ...context, routeKey: 'route' },
            encounter: {
                node: context.nodes[0],
                osmNodeId: nodeId,
                passedAt: now - 5000,
                passedHeading: 90,
                passMethod: 'route',
                routeKey: 'route',
                path: context.coordinates,
            },
            phase: 'pending',
            pass: {
                reason: 'Confident pass established',
                trackedApproaches: 0,
            },
        },
        { ...state, nodeTimes: { [nodeId]: now - 10000 } },
        now,
    );
    assert.equal(snapshot.limits.nodeCooldownDays, 7);
    assert.equal(snapshot.limits.nodeCooldownSeconds, 604790);
    assert.ok(snapshot.blockers.includes('Same-node 7-day cooldown'));
});
test('debug capture is opt-in, sampled, bounded and retained after disabling', () => {
    const store = createPresenceDebugStore();
    let reads = 0;
    const create = () => {
        reads++;
        return sample();
    };
    store.record(create, now);
    assert.equal(reads, 0);
    store.setEnabled(true);
    store.record(create, now);
    store.record(create, now + 100);
    assert.equal(reads, 1);
    assert.match(store.getSnapshot().events[0].event, /Node 12634608635/);
    for (let i = 0; i < 90; i++) store.event(`event ${i}`, now + i);
    assert.equal(store.getSnapshot().events.length, 60);
    store.setEnabled(false);
    const snapshot = store.getSnapshot();
    store.record(create, now + 5000);
    store.event('hidden');
    assert.equal(store.getSnapshot(), snapshot);
    assert.ok(snapshot.latest);
    store.clear();
    assert.equal(store.getSnapshot().latest, null);
    assert.equal(store.getSnapshot().events.length, 0);
    assert.equal(
        getDebugOverlayVisibilityWithDefaults({})[DEBUG_OVERLAY_ALPR_PRESENCE],
        false,
    );
});
test('detector diagnostics retain approaches across GPS update gaps', () => {
    const detector = createPresencePassDetector();
    detector.update({ ...context, routeKey: 'free', now });
    assert.equal(detector.inspect().trackedApproaches, 1);
    detector.update({
        ...context,
        routeKey: 'free',
        location: {
            ...context.location,
            recordedAt: now + 5000,
            longitude: -96.9998,
        },
        now: now + 5000,
    });
    assert.equal(detector.inspect().trackedApproaches, 1);
    assert.match(detector.inspect().reason, /Tracking approach/);
});
test('pane captures snapshots and provides a guarded cooldown and count reset with success and failure feedback', async () => {
    const require = createRequire(import.meta.url);
    const babel = require('@babel/core');
    const source = readFileSync(
        new URL('../alpr-presence-debug-pane.js', import.meta.url),
        'utf8',
    );
    const { code } = babel.transformSync(source, {
        babelrc: false,
        configFile: false,
        plugins: [
            [
                require.resolve('@babel/plugin-transform-react-jsx'),
                { runtime: 'automatic' },
            ],
            require.resolve('@babel/plugin-transform-modules-commonjs'),
        ],
    });
    const hookState = [];
    let cursor = 0;
    let resetCalls = 0;
    let finishReset;
    let failReset;
    const mocks = {
        react: {
            useRef: (value) => {
                const key = cursor++;
                if (!(key in hookState)) hookState[key] = { current: value };
                return hookState[key];
            },
            useState: (value) => {
                const key = cursor++;
                if (!(key in hookState)) hookState[key] = value;
                return [hookState[key], (next) => (hookState[key] = next)];
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
        './alpr-presence-runtime': {
            resetPresenceDebugLimits: () => {
                resetCalls++;
                return new Promise((resolve, reject) => {
                    finishReset = resolve;
                    failReset = reject;
                });
            },
        },
        './alpr-presence-debug': {
            formatPresenceDebugSnapshot,
            presenceDebugStore,
        },
    };
    const exports = {};
    new Function('require', 'exports', code)((name) => {
        assert.ok(mocks[name], name);
        return mocks[name];
    }, exports);
    const render = () => {
        cursor = 0;
        return exports.AlprPresenceDebugPane({});
    };
    const flatten = (node) =>
        !node || typeof node !== 'object'
            ? []
            : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
    presenceDebugStore.clear();
    presenceDebugStore.setEnabled(true);
    presenceDebugStore.record(() => sample(), now);
    let nodes = flatten(render());
    const paneText = nodes
        .filter((node) => node.type === 'Text')
        .flatMap((node) => [node.props.children].flat(Infinity))
        .join(' ');
    assert.match(paneText, /Prompts this drive/);
    assert.match(paneText, /Same-node minimum gap/);
    assert.match(paneText, /7\s+days/);
    assert.doesNotMatch(paneText, /Budget|budget|\/ 15/);
    nodes
        .find((n) => n.props.testID === 'alpr-presence-debug-capture')
        .props.onPress();
    nodes = flatten(render());
    const captured = nodes.find(
        (n) => n.props.testID === 'alpr-presence-debug-snapshot',
    );
    assert.equal(captured.props.selectable, true);
    assert.match(captured.props.children, /12634608635/);
    presenceDebugStore.record(() => sample({ maneuverSeconds: 0 }), now + 2000);
    assert.equal(
        flatten(render()).find(
            (n) => n.props.testID === 'alpr-presence-debug-snapshot',
        ).props.children,
        captured.props.children,
    );
    nodes
        .find(
            (n) =>
                n.props.accessibilityLabel ===
                'Clear ALPR confirmation diagnostics',
        )
        .props.onPress();
    assert.equal(presenceDebugStore.getSnapshot().latest, null);
    assert.equal(state.drive.count, 0);
    const resetButton = () =>
        flatten(render()).find(
            (n) => n.props.testID === 'alpr-presence-debug-reset-limits',
        );
    const button = resetButton();
    const pending = button.props.onPress();
    void button.props.onPress();
    assert.equal(resetCalls, 1);
    assert.equal(resetButton().props.disabled, true);
    finishReset();
    await pending;
    assert.equal(resetButton().props.disabled, false);
    const status = () =>
        flatten(render()).find(
            (n) => n.props.testID === 'alpr-presence-debug-reset-status',
        ).props.children;
    assert.match(status(), /Cooldowns and prompt count reset/);
    assert.match(status(), /Queued reports kept/);
    const failed = resetButton().props.onPress();
    failReset(new Error('storage unavailable'));
    await failed;
    assert.match(status(), /Reset failed/);
    assert.equal(resetButton().props.disabled, false);
    presenceDebugStore.setEnabled(false);
});

test('free-drive diagnostics mark maneuver clearance inapplicable and contain no horizon measurements', () => {
    const snapshot = sample({
        navigationActive: false,
        maneuverSeconds: null,
        pathSource: 'GPS movement',
    });
    assert.ok(
        !snapshot.blockers.some((value) =>
            value.includes('maneuver clearance'),
        ),
    );
    assert.equal(snapshot.path.navigationActive, false);
    assert.equal(snapshot.path.maneuverSeconds, null);
    assert.equal(snapshot.path.source, 'GPS movement');
    assert.doesNotMatch(JSON.stringify(snapshot), /horizon/i);
});

test('timestamp availability and age do not produce confirmation blockers', () => {
    for (const recordedAt of [undefined, 1, now + 5000, 'invalid']) {
        const snapshot = sample({
            location: { ...context.location, recordedAt },
        });
        assert.deepEqual(snapshot.blockers, []);
    }
});

test('free-driving diagnostics allow continued turns while the camera remains behind', () => {
    const encounter = {
        node: context.nodes[0],
        osmNodeId: context.nodes[0].osm_id,
        passMethod: 'gps-plane',
        passedHeading: 0,
        passedAt: now - 4000,
        routeKey: 'free',
    };
    const snapshot = buildPresenceDebugSnapshot(
        {
            context: {
                ...context,
                navigationActive: false,
                routeKey: 'free',
                location: {
                    ...context.location,
                    longitude: -96.9995,
                    heading: 90,
                },
            },
            encounter,
            phase: 'pending',
        },
        state,
        now,
    );
    assert.ok(
        !snapshot.blockers.includes('Heading changed more than 30 degrees'),
    );
    assert.ok(
        !snapshot.blockers.includes(
            'Camera is ahead of current travel direction',
        ),
    );
});

test('render visibility is not a confirmation blocker', () => {
    assert.ok(
        !sample({ visible: false }).blockers.includes('Car map not visible'),
    );
});

test('structured close snapshots survive subsequent events and JSON export', () => {
    const store = createPresenceDebugStore();
    store.setEnabled(true);
    const details = {
        shownForMs: 900,
        snapshot: {
            phase: 'showing',
            targetNodeId: 123,
            blockers: ['Route changed'],
        },
    };
    store.event('confirmation-closed:guard-failed', now, details);
    store.event('native-dismissed:user', now + 30);
    const exported = JSON.parse(
        formatPresenceDebugSnapshot(store.getSnapshot()),
    );
    assert.deepEqual(exported.events[0].details, details);
    assert.equal(exported.events[1].event, 'native-dismissed:user');
    store.setEnabled(false);
    store.event('confirmation-closed:guard-failed', now + 60, details);
    assert.equal(store.getSnapshot().events.length, 2);
});
