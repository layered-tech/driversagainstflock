import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createEmptyScorecardState } from '../scorecard-engine.js';
import { createScorecardRuntime } from '../scorecard-runtime.js';

function createDeferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
}

function flushAsyncWork() {
    return new Promise((resolve) => setImmediate(resolve));
}

function location(
    longitude,
    latitude,
    timestamp,
    { accuracy = 5, heading = 0, speed = 0 } = {},
) {
    return {
        coords: { accuracy, heading, latitude, longitude, speed },
        timestamp,
    };
}

function camera(osmId = 'camera-1', coordinate = [0, 0]) {
    return {
        coordinate,
        direction: '0',
        osmId,
    };
}

function route() {
    return {
        destination: {
            location: { latitude: 0.001, longitude: 0 },
        },
        requestedAt: 1_000,
        routes: {
            direct: {
                cameraCandidates: [
                    { coordinate: [0, 0.0005], osmId: 'direct-1' },
                    { coordinate: [0, 0.0007], osmId: 'direct-2' },
                ],
                coordinates: [
                    [0, 0],
                    [0, 0.001],
                ],
                distance: 120,
                duration: 20,
                nodeCount: 2,
                routeKey: 'direct',
            },
            ideal: {
                cameraCandidates: [
                    { coordinate: [0, 0.0007], osmId: 'direct-2' },
                ],
                coordinates: [
                    [0, 0],
                    [0.0002, 0.0005],
                    [0, 0.001],
                ],
                distance: 140,
                duration: 25,
                nodeCount: 1,
                routeKey: 'ideal',
            },
        },
        selectedRouteKey: 'ideal',
        start: {
            location: { latitude: 0, longitude: 0 },
        },
    };
}

function createRuntimeHarness({
    deleteState = async () => {},
    getRouteProgress = () => null,
    initialState = createEmptyScorecardState(),
    loadState = async () => initialState,
    saveState = async () => true,
    secureStorageIsAvailable = true,
} = {}) {
    const deletedStates = [];
    const savedStates = [];
    const guidedArrivals = [];
    let now = 10_000;
    const runtime = createScorecardRuntime({
        deleteState: async () => {
            deletedStates.push(true);
            return deleteState();
        },
        loadState,
        getRouteGeometryKey: (candidateRoute) =>
            `${candidateRoute?.requestedAt ?? ''}|${candidateRoute?.selectedRouteKey ?? ''}`,
        getRouteOption: (candidateRoute) =>
            candidateRoute?.routes?.[candidateRoute.selectedRouteKey] ?? null,
        getRouteProgress,
        getWaypointCoordinate: (waypoint) => {
            const latitude = Number(waypoint?.location?.latitude);
            const longitude = Number(waypoint?.location?.longitude);

            return Number.isFinite(latitude) && Number.isFinite(longitude)
                ? [longitude, latitude]
                : null;
        },
        normalizeLocationForRoute: (rawLocation) => ({
            accuracy: rawLocation?.coords?.accuracy,
            latitude: rawLocation?.coords?.latitude,
            longitude: rawLocation?.coords?.longitude,
            recordedAt: rawLocation?.timestamp,
        }),
        segmentIndicatesDriving: (previousLocation, currentLocation) => {
            const heading = Number(
                currentLocation?.coords?.heading ??
                    currentLocation?.coords?.course,
            );
            const speed = Number(currentLocation?.coords?.speed);

            return (
                Boolean(previousLocation) &&
                Number.isFinite(heading) &&
                heading >= 0 &&
                Number.isFinite(speed) &&
                speed >= 1.5
            );
        },
        now: () => now,
        onGuidedArrival: () => {
            guidedArrivals.push(true);
        },
        saveState: async (state, savedAt) => {
            savedStates.push({ savedAt, state });
            return saveState(state, savedAt);
        },
        secureStorageIsAvailable,
    });

    return {
        deletedStates,
        guidedArrivals,
        runtime,
        savedStates,
        setNow(value) {
            now = value;
        },
    };
}

describe('scorecard process runtime', () => {
    test('starts phone Free Drive immediately but ignores passive phone movement', async () => {
        const passiveHarness = createRuntimeHarness();

        await passiveHarness.runtime.hydrate();
        passiveHarness.runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        passiveHarness.runtime.handleAcceptedLocation(
            location(0, 0, 2_000, { speed: 3 }),
        );

        assert.equal(
            passiveHarness.runtime.getSnapshot().scorecardState.activeSession,
            null,
        );
        assert.equal(passiveHarness.savedStates.length, 0);

        const phoneFreeHarness = createRuntimeHarness();

        await phoneFreeHarness.runtime.hydrate();
        phoneFreeHarness.runtime.setRoutingState({
            directionsRoute: null,
            drivingModeIsActive: true,
        });

        assert.equal(
            phoneFreeHarness.runtime.getSnapshot().scorecardState.activeSession
                ?.mode,
            'free',
        );
    });

    test('discards a stationary route-free automotive connection', async () => {
        const { runtime, savedStates } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({
            isConnected: true,
            isVisible: false,
        });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(location(0, 0, 1_000));
        runtime.handleAcceptedLocation(location(0, 0, 2_000));

        assert.equal(runtime.getSnapshot().scorecardState.activeSession, null);

        runtime.setAutoPlaySessionState({ isConnected: false });

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.trips.length, 0);
        assert.equal(state.lifetime.completedDriveCount, 0);
        assert.equal(state.lifetime.currentCleanDriveStreak, 0);
        assert.equal(savedStates.length, 0);
    });

    test('uses 1.5 m/s as the automotive materialization boundary', async () => {
        for (const [speed, shouldMaterialize] of [
            [1.49, false],
            [1.5, true],
        ]) {
            const { runtime } = createRuntimeHarness();

            runtime.setAutoPlaySessionState({ isConnected: true });
            await runtime.hydrate();
            runtime.handleAcceptedLocation(
                location(0, -0.0002, 1_000, { speed }),
            );
            runtime.handleAcceptedLocation(location(0, 0, 2_000, { speed }));

            assert.equal(
                Boolean(runtime.getSnapshot().scorecardState.activeSession),
                shouldMaterialize,
            );
        }
    });

    test('treats a route preview as route-free while automotive is connected', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({ isConnected: true });
        runtime.setRoutingState({
            directionsRoute: route(),
            drivingModeIsActive: false,
        });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(location(0, 0, 2_000, { speed: 3 }));

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.mode, 'free');
        assert.equal(state.activeSession?.lockedAvoidedCameraCount, 0);
        assert.equal(state.trips.length, 0);
    });

    test('materializes and finalizes an automotive free drive on valid movement', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(location(0, 0, 2_000, { speed: 3 }));

        assert.equal(
            runtime.getSnapshot().scorecardState.activeSession?.mode,
            'free',
        );

        runtime.setAutoPlaySessionState({ isConnected: false });

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0].completed, true);
        assert.ok(state.trips[0].distanceMiles > 0);
        assert.equal(state.lifetime.currentCleanDriveStreak, 1);
    });

    test('retains the crossing that materializes a slow automotive free drive', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setSupplementalNodes([camera('first-crossing')]);
        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0001, 1_000, { speed: 0.5 }),
        );
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 2_000, { speed: 0.5 }),
        );

        const activeState = runtime.getSnapshot().scorecardState;

        assert.equal(activeState.activeSession?.mode, 'free');
        assert.equal(activeState.exposures.length, 1);
        assert.equal(activeState.exposures[0].osmId, 'first-crossing');

        runtime.setAutoPlaySessionState({ isConnected: false });

        const completedState = runtime.getSnapshot().scorecardState;

        assert.equal(completedState.trips[0].confirmedReadCount, 1);
        assert.equal(completedState.lifetime.currentCleanDriveStreak, 0);
    });

    test('persists the first session and exposure in one atomic revision', async () => {
        const { runtime, savedStates } = createRuntimeHarness();

        runtime.setSupplementalNodes([camera('atomic-first-crossing')]);
        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0001, 1_000, { speed: 0.5 }),
        );
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 2_000, { speed: 0.5 }),
        );
        await flushAsyncWork();

        const snapshot = runtime.getSnapshot();
        const persistedState = savedStates[0]?.state;

        assert.equal(savedStates.length, 1);
        assert.equal(snapshot.stateRevision, 1);
        assert.equal(snapshot.persistedRevision, 1);
        assert.equal(persistedState.activeSession?.mode, 'free');
        assert.equal(persistedState.exposures.length, 1);
        assert.equal(
            persistedState.exposures[0].sessionId,
            persistedState.activeSession.id,
        );
        assert.equal(
            persistedState.exposures[0].osmId,
            'atomic-first-crossing',
        );
    });

    test('keeps an atomic in-memory revision when secure storage rejects it', async () => {
        const { runtime, savedStates } = createRuntimeHarness({
            saveState: async () => {
                throw new Error('secure storage unavailable');
            },
        });

        runtime.setSupplementalNodes([camera('unsaved-first-crossing')]);
        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0001, 1_000, { speed: 0.5 }),
        );
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 2_000, { speed: 0.5 }),
        );
        await flushAsyncWork();

        const snapshot = runtime.getSnapshot();

        assert.equal(savedStates.length, 1);
        assert.equal(snapshot.stateRevision, 1);
        assert.equal(snapshot.persistedRevision, 0);
        assert.equal(snapshot.scorecardState.activeSession?.mode, 'free');
        assert.equal(snapshot.scorecardState.exposures.length, 1);
        assert.equal(
            snapshot.scorecardState.exposures[0].sessionId,
            snapshot.scorecardState.activeSession.id,
        );
    });

    test('keeps processing through slow traffic and temporary stops', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.001, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(
            location(0, -0.0008, 2_000, { speed: 3 }),
        );
        const sessionId =
            runtime.getSnapshot().scorecardState.activeSession?.id;

        runtime.handleAcceptedLocation(
            location(0, -0.0008, 3_000, { speed: 0 }),
        );
        runtime.handleAcceptedLocation(
            location(0, -0.0008, 8_000, { speed: 0 }),
        );

        assert.equal(
            runtime.getSnapshot().scorecardState.activeSession?.id,
            sessionId,
        );

        runtime.setSupplementalNodes([camera('slow-crossing', [0, -0.0005])]);
        runtime.handleAcceptedLocation(
            location(0, -0.0006, 9_000, { speed: 0.5 }),
        );
        runtime.handleAcceptedLocation(
            location(0, -0.0003, 10_000, { speed: 0.5 }),
        );

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.id, sessionId);
        assert.equal(state.exposures.at(-1)?.osmId, 'slow-crossing');
    });

    test('keeps one free session until both phone and automotive owners stop', async () => {
        for (const firstOwnerToStop of ['phone', 'automotive']) {
            const { runtime } = createRuntimeHarness();

            await runtime.hydrate();
            runtime.setRoutingState({
                directionsRoute: null,
                drivingModeIsActive: true,
            });
            runtime.setAutoPlaySessionState({ isConnected: true });
            const sessionId =
                runtime.getSnapshot().scorecardState.activeSession?.id;

            assert.ok(sessionId);

            if (firstOwnerToStop === 'phone') {
                runtime.setRoutingState({
                    directionsRoute: null,
                    drivingModeIsActive: false,
                });
            } else {
                runtime.setAutoPlaySessionState({ isConnected: false });
            }

            assert.equal(
                runtime.getSnapshot().scorecardState.activeSession?.id,
                sessionId,
            );

            if (firstOwnerToStop === 'phone') {
                runtime.setAutoPlaySessionState({ isConnected: false });
            } else {
                runtime.setRoutingState({
                    directionsRoute: null,
                    drivingModeIsActive: false,
                });
            }

            assert.equal(
                runtime.getSnapshot().scorecardState.activeSession,
                null,
            );
            assert.equal(runtime.getSnapshot().scorecardState.trips.length, 1);
        }
    });

    test('deletes all encrypted scorecard data and resets settings', async () => {
        const { deletedStates, runtime, savedStates } = createRuntimeHarness();

        await runtime.hydrate();
        runtime.setTrackingEnabled(false);
        runtime.setAutoPlaySessionState({ isConnected: true });
        runtime.updateState((currentState) => ({
            ...currentState,
            pendingRecapTripId: 'trip-to-delete',
        }));
        await runtime.waitForIdle();
        const savedStateCountBeforeDeletion = savedStates.length;

        await runtime.deleteHistory();

        const snapshot = runtime.getSnapshot();

        assert.equal(snapshot.scorecardState.trips.length, 0);
        assert.equal(snapshot.scorecardState.settings.enabled, true);
        assert.equal(snapshot.scorecardState.activeSession, null);
        assert.equal(snapshot.stateRevision, 3);
        assert.equal(snapshot.persistedRevision, 3);
        assert.equal(savedStates.length, savedStateCountBeforeDeletion);
        assert.equal(deletedStates.length, 1);
    });

    test('clears a provisional anchor across tracking disable and re-enable', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );

        runtime.setTrackingEnabled(false);
        runtime.setTrackingEnabled(true);
        runtime.handleAcceptedLocation(location(0, 0, 2_000, { speed: 3 }));

        assert.equal(runtime.getSnapshot().scorecardState.activeSession, null);

        runtime.handleAcceptedLocation(
            location(0, 0.0002, 3_000, { speed: 3 }),
        );

        assert.equal(
            runtime.getSnapshot().scorecardState.activeSession?.mode,
            'free',
        );
    });

    test('pauses a meaningful free drive and starts fresh after re-enable', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(location(0, 0, 2_000, { speed: 3 }));
        const firstSessionId =
            runtime.getSnapshot().scorecardState.activeSession.id;

        runtime.setTrackingEnabled(false);

        let state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession, null);
        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0].id, firstSessionId);
        assert.equal(state.trips[0].completion, 'paused');
        assert.equal(state.trips[0].completed, false);
        assert.equal(state.lifetime.currentCleanDriveStreak, 0);

        runtime.setTrackingEnabled(true);
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 3_000, { speed: 3 }),
        );

        assert.equal(runtime.getSnapshot().scorecardState.activeSession, null);

        runtime.handleAcceptedLocation(
            location(0, 0.0004, 4_000, { speed: 3 }),
        );
        state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.mode, 'free');
        assert.notEqual(state.activeSession?.id, firstSessionId);
        assert.equal(state.trips.length, 1);
    });

    test('finalizes free before guided and preserves guided on car disconnect', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({ isConnected: true });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(location(0, 0, 2_000, { speed: 3 }));
        runtime.setRoutingState({
            directionsRoute: route(),
            drivingModeIsActive: true,
        });

        let state = runtime.getSnapshot().scorecardState;

        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0].mode, 'free');
        assert.equal(state.activeSession?.mode, 'guided');
        assert.equal(state.activeSession?.lockedAvoidedCameraCount, 1);

        const guidedSessionId = state.activeSession.id;

        runtime.setAutoPlaySessionState({ isConnected: false });
        state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.id, guidedSessionId);
        assert.equal(state.trips.length, 1);
    });

    test('re-arms provisional automotive tracking after guided navigation ends', async () => {
        const { runtime } = createRuntimeHarness();

        runtime.setAutoPlaySessionState({ isConnected: true });
        runtime.setRoutingState({
            directionsRoute: route(),
            drivingModeIsActive: true,
        });
        await runtime.hydrate();

        assert.equal(
            runtime.getSnapshot().scorecardState.activeSession?.mode,
            'guided',
        );

        runtime.setRoutingState({
            directionsRoute: null,
            drivingModeIsActive: false,
        });

        assert.equal(runtime.getSnapshot().scorecardState.activeSession, null);
        assert.equal(runtime.getSnapshot().scorecardState.trips.length, 1);

        runtime.handleAcceptedLocation(
            location(0, -0.0002, 5_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(location(0, 0, 6_000, { speed: 3 }));

        assert.equal(
            runtime.getSnapshot().scorecardState.activeSession?.mode,
            'free',
        );
    });

    test('awards a guided route after confirmed arrival', async () => {
        const { guidedArrivals, runtime } = createRuntimeHarness({
            getRouteProgress: () => ({
                alongRouteDistance: 115,
                distanceFromRoute: 2,
            }),
        });

        await runtime.hydrate();
        runtime.setRoutingState({
            directionsRoute: route(),
            drivingModeIsActive: true,
        });
        runtime.handleAcceptedLocation(location(0, 0.001, 1_000));
        runtime.handleAcceptedLocation(location(0, 0.001, 4_000));

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession, null);
        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0].completion, 'arrival');
        assert.equal(state.trips[0].completed, true);
        assert.equal(state.trips[0].avoidedCameraCount, 1);
        assert.equal(state.trips[0].xpEarned, 45);
        assert.equal(state.pendingRecapTripId, state.trips[0].id);
        assert.equal(guidedArrivals.length, 1);
    });

    test('retains the arrival fix for the first route-free automotive crossing', async () => {
        const { runtime } = createRuntimeHarness({
            getRouteProgress: () => ({
                alongRouteDistance: 115,
                distanceFromRoute: 2,
            }),
        });

        runtime.setAutoPlaySessionState({ isConnected: true });
        runtime.setRoutingState({
            directionsRoute: route(),
            drivingModeIsActive: true,
        });
        await runtime.hydrate();
        runtime.handleAcceptedLocation(location(0, 0.001, 1_000));
        runtime.handleAcceptedLocation(location(0, 0.001, 4_000));

        assert.equal(runtime.getSnapshot().scorecardState.activeSession, null);

        runtime.setRoutingState({
            directionsRoute: null,
            drivingModeIsActive: false,
        });
        runtime.setSupplementalNodes([
            camera('post-arrival-crossing', [0, 0.00115]),
        ]);
        runtime.handleAcceptedLocation(
            location(0, 0.0013, 5_000, { speed: 0.5 }),
        );

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.mode, 'free');
        assert.equal(state.exposures.at(-1)?.osmId, 'post-arrival-crossing');
        assert.equal(
            state.exposures.at(-1)?.sessionId,
            state.activeSession?.id,
        );
    });

    test('does not award a guided route cancelled away from its destination', async () => {
        const { guidedArrivals, runtime } = createRuntimeHarness();

        await runtime.hydrate();
        runtime.setRoutingState({
            directionsRoute: route(),
            drivingModeIsActive: true,
        });
        runtime.handleAcceptedLocation(location(0, -0.001, 1_000));
        runtime.setRoutingState({
            directionsRoute: null,
            drivingModeIsActive: false,
        });

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession, null);
        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0].completion, 'cancelled');
        assert.equal(state.trips[0].completed, false);
        assert.equal(state.trips[0].avoidedCameraCount, 0);
        assert.equal(state.trips[0].xpEarned, 0);
        assert.equal(state.pendingRecapTripId, null);
        assert.equal(guidedArrivals.length, 0);
    });

    test('awards a manually ended guided route at the destination', async () => {
        const { guidedArrivals, runtime } = createRuntimeHarness();

        await runtime.hydrate();
        runtime.setRoutingState({
            directionsRoute: route(),
            drivingModeIsActive: true,
        });
        runtime.handleAcceptedLocation(location(0, 0.001, 1_000));
        runtime.setRoutingState({
            directionsRoute: null,
            drivingModeIsActive: false,
        });

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0].completion, 'manual');
        assert.equal(state.trips[0].completed, true);
        assert.equal(state.trips[0].avoidedCameraCount, 1);
        assert.equal(state.trips[0].xpEarned, 45);
        assert.equal(state.pendingRecapTripId, state.trips[0].id);
        assert.equal(guidedArrivals.length, 0);
    });

    test('queues cold automotive fixes until encrypted hydration completes', async () => {
        const deferredState = createDeferred();
        const { runtime } = createRuntimeHarness({
            loadState: () => deferredState.promise,
        });

        runtime.setSupplementalNodes([camera('cold-crossing')]);
        runtime.setAutoPlaySessionState({ isConnected: true });
        const hydration = runtime.hydrate();

        runtime.handleAcceptedLocation(
            location(0, -0.0001, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 2_000, { speed: 3 }),
        );

        assert.equal(runtime.getSnapshot().isHydrated, false);

        deferredState.resolve(createEmptyScorecardState());
        await hydration;

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.mode, 'free');
        assert.equal(state.exposures.length, 1);
        assert.equal(state.exposures[0].osmId, 'cold-crossing');
    });

    test('replays cold phone Free Drive fixes from their first location', async () => {
        const deferredState = createDeferred();
        const { runtime } = createRuntimeHarness({
            loadState: () => deferredState.promise,
        });

        runtime.setSupplementalNodes([camera('cold-phone-crossing')]);
        runtime.setRoutingState({
            directionsRoute: null,
            drivingModeIsActive: true,
        });
        const hydration = runtime.hydrate();

        runtime.handleAcceptedLocation(
            location(0, -0.0001, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 2_000, { speed: 3 }),
        );

        deferredState.resolve(createEmptyScorecardState());
        await hydration;

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.mode, 'free');
        assert.equal(state.exposures.length, 1);
        assert.equal(state.exposures[0].osmId, 'cold-phone-crossing');
    });

    test('preserves a complete cold automotive ownership window', async () => {
        const deferredState = createDeferred();
        const { runtime } = createRuntimeHarness({
            loadState: () => deferredState.promise,
        });

        runtime.setAutoPlaySessionState({ isConnected: true });
        const hydration = runtime.hydrate();
        runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(location(0, 0, 2_000, { speed: 3 }));
        runtime.setAutoPlaySessionState({ isConnected: false });

        deferredState.resolve(createEmptyScorecardState());
        await hydration;

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession, null);
        assert.equal(state.trips.length, 1);
        assert.equal(state.trips[0].mode, 'free');
        assert.equal(state.trips[0].completed, true);
    });

    test('does not bridge a cold automotive session to a pre-connect fix', async () => {
        const deferredState = createDeferred();
        const { runtime } = createRuntimeHarness({
            loadState: () => deferredState.promise,
        });
        const hydration = runtime.hydrate();

        runtime.setSupplementalNodes([camera('before-connect-crossing')]);
        runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        runtime.setAutoPlaySessionState({ isConnected: true });
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 2_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(
            location(0, 0.0004, 3_000, { speed: 3 }),
        );

        deferredState.resolve(createEmptyScorecardState());
        await hydration;

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.mode, 'free');
        assert.equal(state.exposures.length, 0);
    });

    test('applies a tracking toggle after cold encrypted state hydration', async () => {
        const deferredState = createDeferred();
        const loadedState = createEmptyScorecardState();

        loadedState.settings.fuelEconomyMpg = 31;

        const { runtime, savedStates } = createRuntimeHarness({
            loadState: () => deferredState.promise,
        });
        const hydration = runtime.hydrate();

        runtime.setTrackingEnabled(false);
        deferredState.resolve(loadedState);
        await hydration;
        await runtime.waitForIdle();

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.settings.enabled, false);
        assert.equal(state.settings.fuelEconomyMpg, 31);
        assert.equal(savedStates.at(-1).state.settings.enabled, false);
        assert.equal(savedStates.at(-1).state.settings.fuelEconomyMpg, 31);
    });

    test('applies mutations made while an encrypted restore is saving', async () => {
        const replacementSave = createDeferred();
        let saveCount = 0;
        const { runtime, savedStates } = createRuntimeHarness({
            saveState: () => {
                saveCount += 1;

                return saveCount === 1 ? replacementSave.promise : true;
            },
        });
        const replacementState = createEmptyScorecardState();

        replacementState.settings.fuelEconomyMpg = 31;

        await runtime.hydrate();
        const replacement = runtime.replaceState(replacementState);

        await flushAsyncWork();
        runtime.setTrackingEnabled(false);
        replacementSave.resolve(true);

        assert.equal(await replacement, true);
        await runtime.waitForIdle();

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.settings.enabled, false);
        assert.equal(state.settings.fuelEconomyMpg, 31);
        assert.equal(savedStates.length, 2);
        assert.equal(savedStates.at(-1).state.settings.enabled, false);
        assert.equal(savedStates.at(-1).state.settings.fuelEconomyMpg, 31);
    });

    test('serializes concurrent encrypted restores before later mutations', async () => {
        const firstReplacementSave = createDeferred();
        const secondReplacementSave = createDeferred();
        let saveCount = 0;
        const { runtime, savedStates } = createRuntimeHarness({
            saveState: () => {
                saveCount += 1;

                if (saveCount === 1) {
                    return firstReplacementSave.promise;
                }

                if (saveCount === 2) {
                    return secondReplacementSave.promise;
                }

                return true;
            },
        });
        const firstReplacementState = createEmptyScorecardState();
        const secondReplacementState = createEmptyScorecardState();

        firstReplacementState.settings.fuelEconomyMpg = 31;
        secondReplacementState.settings.fuelEconomyMpg = 42;

        await runtime.hydrate();
        const firstReplacement = runtime.replaceState(firstReplacementState);
        const secondReplacement = runtime.replaceState(secondReplacementState);

        runtime.setTrackingEnabled(false);
        await flushAsyncWork();

        assert.equal(savedStates.length, 1);

        firstReplacementSave.resolve(true);
        await flushAsyncWork();

        assert.equal(savedStates.length, 2);

        secondReplacementSave.resolve(true);
        assert.deepEqual(
            await Promise.all([firstReplacement, secondReplacement]),
            [true, true],
        );
        await runtime.waitForIdle();

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.settings.enabled, false);
        assert.equal(state.settings.fuelEconomyMpg, 42);
        assert.equal(savedStates.length, 3);
        assert.equal(savedStates.at(-1).state.settings.enabled, false);
        assert.equal(savedStates.at(-1).state.settings.fuelEconomyMpg, 42);
    });

    test('retains automotive fixes received while a restore is saving', async () => {
        const replacementSave = createDeferred();
        const { runtime } = createRuntimeHarness({
            saveState: () => replacementSave.promise,
        });

        await runtime.hydrate();
        runtime.setAutoPlaySessionState({ isConnected: true });

        const replacement = runtime.replaceState(createEmptyScorecardState());

        await flushAsyncWork();
        runtime.setSupplementalNodes([camera('restore-crossing')]);
        runtime.handleAcceptedLocation(
            location(0, -0.0001, 1_000, { speed: 3 }),
        );
        runtime.handleAcceptedLocation(
            location(0, 0.0002, 2_000, { speed: 3 }),
        );
        replacementSave.resolve(true);

        assert.equal(await replacement, true);

        const state = runtime.getSnapshot().scorecardState;

        assert.equal(state.activeSession?.mode, 'free');
        assert.equal(state.exposures.length, 1);
        assert.equal(state.exposures[0].osmId, 'restore-crossing');
    });

    test('does not start while tracking or secure storage is unavailable', async () => {
        const disabledHarness = createRuntimeHarness();

        await disabledHarness.runtime.hydrate();
        disabledHarness.runtime.setTrackingEnabled(false);
        disabledHarness.runtime.setAutoPlaySessionState({ isConnected: true });
        disabledHarness.runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        disabledHarness.runtime.handleAcceptedLocation(
            location(0, 0, 2_000, { speed: 3 }),
        );

        assert.equal(
            disabledHarness.runtime.getSnapshot().scorecardState.activeSession,
            null,
        );

        const insecureHarness = createRuntimeHarness({
            secureStorageIsAvailable: false,
        });

        insecureHarness.runtime.setAutoPlaySessionState({ isConnected: true });
        await insecureHarness.runtime.hydrate();
        insecureHarness.runtime.handleAcceptedLocation(
            location(0, -0.0002, 1_000, { speed: 3 }),
        );
        insecureHarness.runtime.handleAcceptedLocation(
            location(0, 0, 2_000, { speed: 3 }),
        );

        assert.equal(
            insecureHarness.runtime.getSnapshot().scorecardState.activeSession,
            null,
        );
    });
});
