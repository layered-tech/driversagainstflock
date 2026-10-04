import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    buildEmulatorRouteReplay,
    getEmulatorRouteFix,
    parseEmulatorRoute,
} from '../../../scripts/emulator-route-replay.mjs';
import { getAutoPlayNavigationAlertContent } from '../../auto-play-navigation-alert.js';
import { createPresenceCoordinator } from '../alpr-presence-coordinator.js';
import { createPresenceInventory } from '../alpr-presence-inventory.js';
import {
    getPresenceMotionPath,
    PRESENCE_POLICY,
} from '../alpr-presence-policy.js';
import { createPresencePrompt } from '../alpr-presence-prompt.js';
import {
    createAutomotiveAlertHistory,
    recordAutomotiveAlertHistoryEntry,
} from '../automotive-alert-policy.js';
import {
    getDirectionsRouteCoordinatesAhead,
    getUpcomingElectronicHorizonAlerts,
} from '../electronic-horizon.js';

const route = parseEmulatorRoute(
    JSON.parse(
        readFileSync(
            new URL(
                '../../../.android-auto/route-pewaukee.json',
                import.meta.url,
            ),
            'utf8',
        ),
    ),
);
// The mapped Pewaukee reader already used by the inventory regression coverage.
const camera = {
    osmId: 12634608635,
    coordinate: [-88.2445066, 43.1099621],
    tags: { 'surveillance:type': 'ALPR', 'addr:street': 'Pewaukee Road' },
};
const baseTime = 100000;
const locationAt = (fix) => ({
    ...fix,
    accuracy: 5,
    recordedAt: baseTime + fix.atMs,
});
const markerFor = (node) => ({
    location: node.coordinate,
    properties: {
        osm_id: node.osmId,
        osm_version: 2,
        type: 'OpenStreetMap ALPR',
        osm_nodes: [{ tags: node.tags }],
    },
});
const map = {
    markerPoints: [markerFor(camera)],
    markerCoverage: {
        bounds: {
            sw_lng: -88.26,
            sw_lat: 43.08,
            ne_lng: -88.23,
            ne_lat: 43.14,
        },
        loadedAt: baseTime,
    },
};

function alertsAt(atMs, nodes = [camera]) {
    const location = locationAt(getEmulatorRouteFix(route, atMs));
    const pathCoordinates = getDirectionsRouteCoordinatesAhead(
        route.coordinates,
        location,
    );
    const alerts = getUpcomingElectronicHorizonAlerts({
        alprNodes: nodes,
        pathCoordinates,
    });
    return { location, alerts };
}

test('saved road warns on approach, decreases distance, and removes the passed reader', () => {
    const start = alertsAt(0);
    const approaching = alertsAt(10000);
    assert.equal(start.alerts.length, 1);
    assert.equal(start.alerts[0].id, String(camera.osmId));
    assert.ok(start.alerts[0].distanceMeters > 1200);
    assert.ok(
        approaching.alerts[0].distanceMeters < start.alerts[0].distanceMeters,
    );
    const history = createAutomotiveAlertHistory('saved-road');
    const content = (sample, alertHistory = history, now = baseTime) =>
        getAutoPlayNavigationAlertContent({
            alertHistory,
            upcomingAlerts: sample.alerts,
            userLocation: sample.location,
            currentSpeedMps: sample.location.speed,
            now,
        });
    const warning = content(start);
    assert.equal(warning.alertKey, `alpr:${camera.osmId}`);
    assert.equal(warning.type, 'alpr');
    assert.equal(
        content(alertsAt(40000)),
        null,
        'inside the half-mile warning minimum',
    );
    assert.equal(
        alertsAt(78000).alerts.length,
        0,
        'camera is behind the driver',
    );
    assert.equal(
        content(
            start,
            recordAutomotiveAlertHistoryEntry(
                history,
                warning.historyEntry,
                baseTime,
            ),
            baseTime + 300000,
        ),
        null,
        'replaying cannot repeat a warning in the same drive',
    );
});

test('a nearby camera on a parallel road cannot warn just because it is geographically ahead', () => {
    const parallel = {
        ...camera,
        osmId: camera.osmId + 1,
        coordinate: [camera.coordinate[0] + 0.003, camera.coordinate[1]],
    };
    const { alerts } = alertsAt(0, [camera, parallel]);
    assert.deepEqual(
        alerts.map((alert) => alert.id),
        [String(camera.osmId)],
    );
});

async function scenario({
    navigationActive = false,
    maneuverSeconds = 90,
    platform = 'android_auto',
    nodes = [camera],
    stationary = false,
    warningBusy = false,
} = {}) {
    let time = baseTime;
    let location = locationAt(getEmulatorRouteFix(route, 0));
    let context;
    let mapState = { ...map, markerPoints: nodes.map(markerFor) };
    const inventory = createPresenceInventory({
        now: () => time,
        getLocation: () => location,
        getMapInventory: () => mapState,
    });
    const shown = [],
        events = [],
        focused = [],
        highlighted = [],
        restored = [],
        submitted = [];
    const coordinator = createPresenceCoordinator({
        now: () => time,
        load: async () => null,
        save: async () => {},
        randomId: () => 's'.repeat(32),
        send: async (payload) => {
            submitted.push(payload);
            throw new Error('Test keeps report offline');
        },
    });
    await coordinator.hydrate();
    const prompt = createPresencePrompt({
        coordinator,
        getContext: () => context,
        now: () => time,
        platform,
        trace: (event) => events.push({ event, atMs: time - baseTime }),
        highlight: (node) => highlighted.push(node),
        camera: {
            focus: async (frame, valid) => {
                focused.push(frame);
                return valid();
            },
            restore: () => restored.push(time),
        },
        host: {
            showAlert: (alert) => {
                shown.push({ alert, atMs: time - baseTime });
                void alert.onWillShow();
            },
            dismissAlert: () => {},
        },
    });
    async function advance(fromMs, toMs) {
        for (const fix of buildEmulatorRouteReplay(route, { fromMs, toMs })) {
            time = baseTime + fix.atMs;
            location = locationAt(
                stationary
                    ? {
                          ...getEmulatorRouteFix(route, 60000),
                          atMs: fix.atMs,
                          speed: 0,
                      }
                    : fix,
            );
            // A retained inventory must survive a slow or failed refresh during the pass.
            if (fix.atMs === 65000)
                mapState = { ...mapState, markersAreLoading: true };
            if (fix.atMs === 70000)
                mapState = {
                    ...mapState,
                    markersAreLoading: false,
                    markerLoadError: 'offline',
                };
            context = {
                ...inventory.getContext(),
                location,
                coordinates: navigationActive
                    ? route.coordinates
                    : getPresenceMotionPath(location),
                routeKey: navigationActive ? 'saved-pewaukee' : 'free',
                navigationActive,
                maneuverSeconds: navigationActive ? maneuverSeconds : null,
                warningBusy,
                enabled: true,
                connected: true,
                visible: true,
                viewport: { visibleWidth: 753, visibleHeight: 442 },
            };
            prompt.tick();
            await new Promise((resolve) => setImmediate(resolve));
        }
    }
    return {
        advance,
        prompt,
        shown,
        coordinator,
        events,
        focused,
        highlighted,
        restored,
        submitted,
        dispose: () => {
            prompt.stop();
            inventory.dispose();
        },
    };
}

for (const platform of ['android_auto', 'carplay']) {
    for (const navigationActive of [false, true]) {
        test(`saved road ${platform} ${navigationActive ? 'guided' : 'free'} drive confirms once after passing and restores camera on expiry`, async () => {
            const h = await scenario({ platform, navigationActive });
            try {
                await h.advance(0, 70000);
                assert.equal(
                    h.shown.length,
                    0,
                    'no confirmation before the observed pass',
                );
                await h.advance(71000, 78000);
                assert.equal(h.shown.length, 1);
                const { alert, atMs } = h.shown[0];
                const pass = h.events.find(
                    ({ event }) => event === 'pass-detected',
                );
                assert.ok(pass);
                assert.ok(atMs - pass.atMs >= PRESENCE_POLICY.earliestMs);
                assert.ok(atMs - pass.atMs <= PRESENCE_POLICY.latestMs);
                assert.equal(alert.title.text, 'Camera you just passed');
                assert.equal(h.highlighted.at(-1).osm_id, camera.osmId);
                assert.equal(h.focused.length, 1);
                assert.equal(h.prompt.ownsCamera, true);
                const expiresAtMs = atMs + PRESENCE_POLICY.durationMs;
                await h.advance(79000, expiresAtMs - 1000);
                assert.equal(
                    h.prompt.ownsCamera,
                    true,
                    'the 20-second prompt remains active',
                );
                await h.advance(expiresAtMs, 147000);
                assert.equal(h.shown.length, 1);
                assert.equal(h.prompt.ownsCamera, false);
                assert.equal(h.restored.length, 1);
                assert.equal(h.highlighted.at(-1), null);
            } finally {
                h.dispose();
            }
        });
    }
}

for (const [name, options] of [
    ['stationary GPS fixes', { stationary: true }],
    [
        'a navigation maneuver within 30 seconds',
        { navigationActive: true, maneuverSeconds: 20 },
    ],
    ['a busy upcoming warning', { warningBusy: true }],
    [
        'a camera on a parallel road',
        {
            nodes: [
                {
                    ...camera,
                    coordinate: [
                        camera.coordinate[0] + 0.003,
                        camera.coordinate[1],
                    ],
                },
            ],
        },
    ],
]) {
    test(`saved road does not confirm for ${name}`, async () => {
        const h = await scenario(options);
        try {
            await h.advance(0, 147000);
            assert.equal(h.shown.length, 0);
        } finally {
            h.dispose();
        }
    });
}

test('saved road native dismissal restores the camera without submitting a report', async () => {
    const h = await scenario();
    try {
        await h.advance(0, 78000);
        assert.equal(h.shown.length, 1);
        h.shown[0].alert.primaryAction.onPress();
        await h.advance(79000, 147000);
        assert.equal(h.prompt.ownsCamera, false);
        assert.equal(h.restored.length, 1);
        assert.equal(h.shown.length, 1);
        assert.equal(h.submitted.length, 0);
        assert.equal(h.coordinator.state.outbox.length, 0);
    } finally {
        h.dispose();
    }
});

test('saved road Not there queues the mapped canonical camera once without a network write', async () => {
    const h = await scenario();
    try {
        await h.advance(0, 78000);
        assert.equal(h.shown.length, 1);
        const action = h.shown[0].alert.secondaryAction;
        await action.onPress();
        await action.onPress();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(h.coordinator.state.outbox.length, 1);
        const payload = h.coordinator.state.outbox[0].payload;
        assert.equal(payload.osm_node_id, camera.osmId);
        assert.equal(payload.platform, 'android_auto');
        assert.equal(payload.observed.version, 2);
        assert.equal(payload.observed.latitude, camera.coordinate[1]);
        assert.equal(payload.observed.longitude, camera.coordinate[0]);
        assert.equal(h.prompt.ownsCamera, false);
        assert.equal(h.restored.length, 1);
    } finally {
        h.dispose();
    }
});
