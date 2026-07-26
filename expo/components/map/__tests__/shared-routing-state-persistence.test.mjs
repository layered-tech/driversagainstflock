import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    createBackgroundRoutingStateResolver,
    parsePersistedSharedRoutingState,
    serializePersistedSharedRoutingState,
    SHARED_ROUTING_STATE_MAX_AGE_MS,
} from '../shared-routing-state-persistence.js';

const backgroundAlertRefreshSource = readFileSync(
    new URL('../background-alert-refresh.js', import.meta.url),
    'utf8',
);
const sharedRoutingStateSource = readFileSync(
    new URL('../shared-routing-state.js', import.meta.url),
    'utf8',
);

const activeRoutingState = {
    directionsRoute: {
        requestedAt: 1_000,
        selectedRouteKey: 'direct',
    },
    drivingModeIsActive: true,
};

describe('persisted shared routing state', () => {
    test('round trips a fresh active route', () => {
        const serializedState = serializePersistedSharedRoutingState(
            activeRoutingState,
            10_000,
        );

        assert.deepEqual(
            parsePersistedSharedRoutingState(serializedState, {
                now: 10_000 + SHARED_ROUTING_STATE_MAX_AGE_MS,
            }),
            activeRoutingState,
        );
    });

    test('rejects corrupt, malformed, expired, and implausibly future state', () => {
        assert.equal(parsePersistedSharedRoutingState('{bad json'), null);
        assert.equal(
            parsePersistedSharedRoutingState(
                JSON.stringify({
                    persistedAt: 10_000,
                    state: {
                        directionsRoute: [],
                        drivingModeIsActive: true,
                    },
                    version: 1,
                }),
                { now: 10_000 },
            ),
            null,
        );

        const serializedState = serializePersistedSharedRoutingState(
            activeRoutingState,
            10_000,
        );

        assert.equal(
            parsePersistedSharedRoutingState(serializedState, {
                now: 10_001 + SHARED_ROUTING_STATE_MAX_AGE_MS,
            }),
            null,
        );
        assert.equal(
            parsePersistedSharedRoutingState(serializedState, {
                now: 10_000 - 5 * 60 * 1000 - 1,
            }),
            null,
        );
    });

    test('does not throw when a route cannot be serialized', () => {
        const circularRoute = {};

        circularRoute.route = circularRoute;

        assert.equal(
            serializePersistedSharedRoutingState(
                {
                    directionsRoute: circularRoute,
                    drivingModeIsActive: true,
                },
                10_000,
            ),
            null,
        );
    });
});

describe('background routing state resolution', () => {
    test('uses live state without reading persistence', async () => {
        let readCount = 0;
        const resolveState = createBackgroundRoutingStateResolver({
            getLiveState: () => activeRoutingState,
            hasLiveState: () => true,
            now: () => 20_000,
            readPersistedState: () => {
                readCount += 1;
                return null;
            },
        });

        assert.equal(await resolveState(), activeRoutingState);
        assert.equal(readCount, 0);
    });

    test('hydrates only a fresh cold-background snapshot', async () => {
        let now = 20_000;
        let readCount = 0;
        const serializedState = serializePersistedSharedRoutingState(
            activeRoutingState,
            now,
        );
        const resolveState = createBackgroundRoutingStateResolver({
            getLiveState: () => null,
            hasLiveState: () => false,
            now: () => now,
            readPersistedState: () => {
                readCount += 1;
                return serializedState;
            },
        });

        assert.deepEqual(await resolveState(), activeRoutingState);
        assert.equal(readCount, 1);

        now += SHARED_ROUTING_STATE_MAX_AGE_MS + 1;

        assert.equal(await resolveState(), null);
        assert.equal(readCount, 1);
    });

    test('prefers live state that arrives during a persisted read', async () => {
        let hasLiveState = false;
        let resolveRead;
        const newerLiveState = {
            directionsRoute: null,
            drivingModeIsActive: false,
        };
        const resolveState = createBackgroundRoutingStateResolver({
            getLiveState: () => newerLiveState,
            hasLiveState: () => hasLiveState,
            now: () => 20_000,
            readPersistedState: () =>
                new Promise((resolve) => {
                    resolveRead = resolve;
                }),
        });
        const pendingState = resolveState();

        await Promise.resolve();
        hasLiveState = true;
        resolveRead(
            serializePersistedSharedRoutingState(activeRoutingState, 20_000),
        );

        assert.equal(await pendingState, newerLiveState);
    });

    test('retries a failed storage read', async () => {
        let now = 20_000;
        let readCount = 0;
        const serializedState = serializePersistedSharedRoutingState(
            activeRoutingState,
            now,
        );
        const resolveState = createBackgroundRoutingStateResolver({
            getLiveState: () => null,
            hasLiveState: () => false,
            now: () => now,
            readPersistedState: () => {
                readCount += 1;

                if (readCount === 1) {
                    throw new Error('temporary storage failure');
                }

                return serializedState;
            },
        });

        assert.equal(await resolveState(), null);
        now += 1000;
        assert.deepEqual(await resolveState(), activeRoutingState);
        assert.equal(readCount, 2);
    });

    test('times out a stalled read and retries without applying its late value', async () => {
        let now = 20_000;
        let readCount = 0;
        let resolveStalledRead;
        const serializedState = serializePersistedSharedRoutingState(
            activeRoutingState,
            now,
        );
        const resolveState = createBackgroundRoutingStateResolver({
            getLiveState: () => null,
            hasLiveState: () => false,
            now: () => now,
            readPersistedState: () => {
                readCount += 1;

                if (readCount === 1) {
                    return new Promise((resolve) => {
                        resolveStalledRead = resolve;
                    });
                }

                return serializedState;
            },
            readTimeoutMs: 5,
        });

        assert.equal(await resolveState(), null);

        resolveStalledRead(serializedState);
        await new Promise((resolve) => setImmediate(resolve));
        now += 1000;

        assert.deepEqual(await resolveState(), activeRoutingState);
        assert.equal(readCount, 2);
    });

    test('coalesces callers around one stalled underlying storage read', async () => {
        let readCount = 0;
        const resolveState = createBackgroundRoutingStateResolver({
            getLiveState: () => null,
            hasLiveState: () => false,
            now: () => 20_000,
            readPersistedState: () => {
                readCount += 1;

                return new Promise(() => {});
            },
            readTimeoutMs: 5,
        });

        assert.deepEqual(
            await Promise.all([resolveState(), resolveState(), resolveState()]),
            [null, null, null],
        );
        assert.equal(await resolveState(), null);
        assert.equal(readCount, 1);
    });
});

describe('shared routing state persistence integration', () => {
    test('queues immediate ordered writes and marks memory live before equality return', () => {
        assert.match(
            sharedRoutingStateSource,
            /createMapPreferencesPersistenceScheduler\([\s\S]*?AsyncStorage\.setItem\([\s\S]*?SHARED_ROUTING_STATE_STORAGE_KEY/,
        );
        assert.match(
            sharedRoutingStateSource,
            /liveRoutingStateHasBeenSet = true;[\s\S]*?sharedRoutingStatePersistenceScheduler\.schedule\([\s\S]*?immediate: true[\s\S]*?routingStatesAreEqual/,
        );
    });

    test('keeps normal reads memory-only and uses async persistence only for background work', () => {
        assert.match(
            sharedRoutingStateSource,
            /export function getSharedRoutingState\(\) \{\s*return sharedRoutingState;\s*\}/,
        );
        assert.match(
            sharedRoutingStateSource,
            /export async function getSharedRoutingStateForBackgroundAsync\(\)[\s\S]*?resolveBackgroundRoutingState\(\)/,
        );
        assert.match(
            sharedRoutingStateSource,
            /readTimeoutMs: BACKGROUND_ALERT_STORAGE_TIMEOUT_MS/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /await getSharedRoutingStateForBackgroundAsync\(\)/,
        );
    });
});
