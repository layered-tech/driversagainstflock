import assert from 'node:assert/strict';
import test from 'node:test';
import { getAutoPlayNavigationAlertContent } from '../../auto-play-navigation-alert.js';
import { createPresenceCoordinator } from '../alpr-presence-coordinator.js';
import { createPresenceState } from '../alpr-presence-policy.js';
import {
    getAutomotiveAlertHistoryEntry,
    recordAutomotiveAlertHistoryEntry,
} from '../automotive-alert-policy.js';
import { buildUpcomingAlertDebugSnapshot } from '../upcoming-alert-debug.js';

const EARTH_RADIUS_METERS = 6371008.8;
const now = 1780000000000;
const coordinateAtDistance = (distanceMeters) => [
    0,
    ((distanceMeters / EARTH_RADIUS_METERS) * 180) / Math.PI,
];
const alerts = [
    {
        coordinate: coordinateAtDistance(1609.344),
        distanceMeters: 1609.344,
        id: 'flock-reader',
        type: 'alpr',
    },
    {
        coordinate: coordinateAtDistance(1609.344),
        distanceMeters: 1609.344,
        id: 'waze-police',
        type: 'police',
    },
];
const userLocation = { latitude: 0, longitude: 0 };

function makeSavedState() {
    const state = createPresenceState('d'.repeat(32), now - 5000);
    state.drive.count = 3;
    state.lastPromptAt = now - 4000;
    state.nodeTimes = { 987654321: now - 3000 };
    state.outbox = [
        {
            attempts: 0,
            retryAt: null,
            payload: {
                response: 'not_there',
                platform: 'android_auto',
                osm_node_id: 987654321,
                event_key: 'encounter-0123456789abcdef',
                passed_at: new Date(now - 5000).toISOString(),
                occurred_at: new Date(now - 4000).toISOString(),
                submitted_at: new Date(now - 3000).toISOString(),
            },
        },
    ];
    state.automotiveAlertHistory = alerts.reduce(
        (history, alert) =>
            recordAutomotiveAlertHistoryEntry(
                history,
                getAutomotiveAlertHistoryEntry(alert),
                now - 1000,
            ),
        state.automotiveAlertHistory,
    );

    return state;
}

function makeCoordinator(savedState) {
    let stored = JSON.stringify(savedState);

    return {
        coordinator: createPresenceCoordinator({
            load: async () => stored,
            save: async (value) => {
                stored = value;
            },
            randomId: () => 'r'.repeat(32),
            now: () => now,
            send: async () => {},
        }),
        getStoredState: () => JSON.parse(stored),
    };
}

test('fresh sessions can announce stored ALPR and police alerts without losing presence state', async () => {
    const savedState = makeSavedState();
    const { coordinator, getStoredState } = makeCoordinator(savedState);
    await coordinator.hydrate();

    assert.deepEqual(coordinator.automotiveAlertHistory, {
        driveId: savedState.drive.id,
        entries: [],
        lastShownAt: null,
    });
    assert.equal(getStoredState().automotiveAlertHistory.entries.length, 0);
    assert.equal(coordinator.state.drive.id, savedState.drive.id);
    assert.equal(coordinator.state.drive.count, savedState.drive.count);
    assert.equal(coordinator.state.lastPromptAt, savedState.lastPromptAt);
    assert.deepEqual(coordinator.state.nodeTimes, savedState.nodeTimes);
    assert.deepEqual(coordinator.state.outbox, savedState.outbox);

    for (const alert of alerts) {
        const entry = getAutomotiveAlertHistoryEntry(alert);
        const content = getAutoPlayNavigationAlertContent({
            alertHistory: coordinator.automotiveAlertHistory,
            currentSpeedMps: 20,
            now,
            upcomingAlerts: [alert],
            userLocation,
        });
        const snapshot = buildUpcomingAlertDebugSnapshot(
            {
                enabled: true,
                hasTemplate: true,
                upcomingAlerts: [alert],
                userLocation,
                alertHistory: coordinator.automotiveAlertHistory,
                content,
            },
            now,
        );

        assert.equal(content?.alertKey, entry.alertKey);
        assert.deepEqual(snapshot.candidates[0].blockers, []);
        assert.equal(snapshot.eligibleCount, 1);
    }
});

test('repeated hydration preserves active session alert claims and unrelated durable state', async () => {
    const savedState = makeSavedState();
    const { coordinator } = makeCoordinator(savedState);
    await coordinator.hydrate();
    const entry = getAutomotiveAlertHistoryEntry(alerts[0]);
    const pendingClaim = coordinator.claimAutomotiveAlert(entry);

    assert.ok(pendingClaim);
    await coordinator.hydrate();
    assert.equal(coordinator.claimAutomotiveAlert(entry), null);
    assert.deepEqual(coordinator.automotiveAlertHistory.entries, [entry]);
    assert.equal(pendingClaim.commit(), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(coordinator.claimAutomotiveAlert(entry), null);
    assert.equal(coordinator.state.drive.count, savedState.drive.count);
    assert.equal(coordinator.state.lastPromptAt, savedState.lastPromptAt);
    assert.deepEqual(coordinator.state.nodeTimes, savedState.nodeTimes);
    assert.deepEqual(coordinator.state.outbox, savedState.outbox);
});
