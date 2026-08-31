import { updateScorecardArrivalDetection } from './arrival-detection.js';
import {
    processScorecardRawLocationFix,
    updateScorecardRawLocationAnchor,
} from './scorecard-drive-coordinator.js';
import {
    addScorecardExposure,
    createEmptyScorecardState,
    createLocalScorecardId,
    createScorecardSession,
    finalizeScorecardSession,
    mergeScorecardSessionRouteCatalog,
    normalizeScorecardState,
} from './scorecard-engine.js';
import {
    getScorecardRouteDistanceSnapshot,
    getScorecardRouteProgressFraction,
    scorecardRouteEndedAtDestination,
} from './scorecard-route-progress.js';

const FREE_DRIVE_DISTANCE_CHECKPOINT_METERS = 500;

function getLocationCoordinate(location) {
    const latitude = Number(location?.coords?.latitude ?? location?.latitude);
    const longitude = Number(
        location?.coords?.longitude ?? location?.longitude,
    );

    return Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
        ? [longitude, latitude]
        : null;
}

function getRouteDistanceSnapshot(
    route,
    progressFraction,
    getRouteGeometryKey,
) {
    return {
        ...getScorecardRouteDistanceSnapshot(route, progressFraction),
        key: getRouteGeometryKey(route),
        route,
    };
}

function addExposureRecords(state, exposures, sessionId) {
    return exposures.reduce(
        (nextState, exposure) =>
            addScorecardExposure(nextState, {
                ...exposure,
                id: createLocalScorecardId('read', exposure.occurredAt),
                routeSegmentCoordinates: null,
                sessionId,
            }),
        state,
    );
}

export function createScorecardRuntime({
    deleteState = async () => {},
    getRouteGeometryKey = () => '',
    getRouteOption = () => null,
    getRouteProgress = () => null,
    getWaypointCoordinate = () => null,
    loadState = async () => createEmptyScorecardState(),
    normalizeLocationForRoute = () => null,
    now = Date.now,
    onGuidedArrival = () => {},
    resolveStartingStateCode = () => null,
    saveState = async () => false,
    secureStorageIsAvailable = false,
    segmentIndicatesDriving = () => false,
} = {}) {
    const listeners = new Set();
    let scorecardState = createEmptyScorecardState();
    let isHydrated = false;
    let persistedRevision = 0;
    let stateRevision = 0;
    let snapshot = {
        isHydrated,
        persistedRevision,
        scorecardState,
        stateRevision,
    };
    let hydrationPromise = null;
    let pendingRuntimeEvents = [];
    let routingState = {
        directionsRoute: null,
        drivingModeIsActive: false,
    };
    let autoPlaySessionIsConnected = false;
    let supplementalNodes = [];
    let lastAcceptedLocation = null;
    let previousRawLocation = null;
    let detectorState = { cameras: {} };
    let freeDriveDistanceMeters = 0;
    let routeSnapshot = null;
    let arrivalDetectionState = null;
    let automotiveProvisionalIsArmed = false;
    let automotiveProvisionalShouldSeedLatestLocation = false;
    let reconciliationIsRunning = false;
    let persistenceQueue = Promise.resolve();
    let pendingStateReplacementCount = 0;
    let stateReplacementPromise = null;
    let stateReplacementQueue = Promise.resolve();
    let reconciliationWasRequested = false;

    function publishSnapshot() {
        snapshot = {
            isHydrated,
            persistedRevision,
            scorecardState,
            stateRevision,
        };
        listeners.forEach((listener) => listener());
    }

    function enqueuePersistence(operation) {
        const queuedOperation = persistenceQueue
            .catch(() => {})
            .then(operation);

        persistenceQueue = queuedOperation;

        return queuedOperation;
    }

    function persistCommittedState(state, committedAt, revision) {
        const persistence = enqueuePersistence(async () => {
            const wasSaved = await saveState(state, committedAt);

            if (wasSaved && revision > persistedRevision) {
                persistedRevision = revision;
                publishSnapshot();
            }

            return wasSaved;
        });

        void persistence.catch(() => {});
    }

    function commitState(update) {
        const updatedState =
            typeof update === 'function' ? update(scorecardState) : update;

        if (!updatedState || updatedState === scorecardState) {
            return scorecardState;
        }

        const committedAt = now();
        const nextState = normalizeScorecardState(updatedState, committedAt);
        const revision = stateRevision + 1;

        scorecardState = nextState;
        stateRevision = revision;
        publishSnapshot();

        persistCommittedState(nextState, committedAt, revision);

        return nextState;
    }

    function resetDriveTracking({ seedLatestLocation = false } = {}) {
        arrivalDetectionState = null;
        automotiveProvisionalIsArmed = false;
        detectorState = { cameras: {} };
        freeDriveDistanceMeters = 0;
        previousRawLocation = seedLatestLocation
            ? updateScorecardRawLocationAnchor(null, lastAcceptedLocation)
            : null;
        routeSnapshot = null;
    }

    function createSession(mode, route = null) {
        const startedAt = now();
        const routeStartCoordinate =
            mode === 'guided'
                ? (getLocationCoordinate(lastAcceptedLocation) ??
                  getWaypointCoordinate(route?.start))
                : null;

        return createScorecardSession({
            id: createLocalScorecardId('drive', startedAt),
            mode,
            route: mode === 'guided' ? route : null,
            startedAt,
            startingStateCode: routeStartCoordinate
                ? resolveStartingStateCode(routeStartCoordinate)
                : null,
        });
    }

    function startSession(mode, route = null) {
        if (
            scorecardState.activeSession ||
            !scorecardState.settings.enabled ||
            !secureStorageIsAvailable
        ) {
            return null;
        }

        const session = createSession(mode, route);

        commitState((currentState) => ({
            ...currentState,
            activeSession: session,
        }));
        resetDriveTracking({ seedLatestLocation: true });
        routeSnapshot =
            mode === 'guided' && route
                ? getRouteDistanceSnapshot(route, 0, getRouteGeometryKey)
                : null;

        return session;
    }

    function rollRouteSnapshotIntoSession() {
        const currentSnapshot = routeSnapshot;

        if (!currentSnapshot || !scorecardState.activeSession) {
            return;
        }

        const completedDistanceMeters =
            currentSnapshot.distanceMeters * currentSnapshot.progressFraction;
        const completedExtraDistanceMeters =
            currentSnapshot.extraDistanceMeters *
            currentSnapshot.progressFraction;
        const completedExtraDurationSeconds =
            currentSnapshot.extraDurationSeconds *
            currentSnapshot.progressFraction;

        commitState((currentState) => {
            if (!currentState.activeSession) {
                return currentState;
            }

            return {
                ...currentState,
                activeSession: {
                    ...currentState.activeSession,
                    completedDistanceMeters:
                        (currentState.activeSession.completedDistanceMeters ??
                            0) + completedDistanceMeters,
                    completedExtraDistanceMeters:
                        (currentState.activeSession
                            .completedExtraDistanceMeters ?? 0) +
                        completedExtraDistanceMeters,
                    completedExtraDurationSeconds:
                        (currentState.activeSession
                            .completedExtraDurationSeconds ?? 0) +
                        completedExtraDurationSeconds,
                },
            };
        });
    }

    function updateGuidedRoute(route) {
        const activeSession = scorecardState.activeSession;

        if (!activeSession || activeSession.mode !== 'guided' || !route) {
            return;
        }

        commitState((currentState) => {
            const currentSession = currentState.activeSession;

            if (!currentSession || currentSession.mode !== 'guided') {
                return currentState;
            }

            const mergedSession = mergeScorecardSessionRouteCatalog(
                currentSession,
                route,
            );

            return mergedSession === currentSession
                ? currentState
                : { ...currentState, activeSession: mergedSession };
        });

        const nextKey = getRouteGeometryKey(route);

        if (routeSnapshot?.key && routeSnapshot.key !== nextKey) {
            rollRouteSnapshotIntoSession();
        }

        if (!routeSnapshot || routeSnapshot.key !== nextKey) {
            routeSnapshot = getRouteDistanceSnapshot(
                route,
                0,
                getRouteGeometryKey,
            );
        }
    }

    function finalizeActiveSession({ arrived = false, completion } = {}) {
        const activeSession = scorecardState.activeSession;

        if (!activeSession) {
            return null;
        }

        const currentProgress = arrived
            ? 1
            : (routeSnapshot?.progressFraction ?? 0);
        const routeDistanceMeters = routeSnapshot
            ? routeSnapshot.distanceMeters * currentProgress
            : 0;
        const routeExtraDistanceMeters = routeSnapshot
            ? routeSnapshot.extraDistanceMeters * currentProgress
            : 0;
        const routeExtraDurationSeconds = routeSnapshot
            ? routeSnapshot.extraDurationSeconds * currentProgress
            : 0;
        const distanceMeters =
            activeSession.mode === 'guided'
                ? (activeSession.completedDistanceMeters ?? 0) +
                  routeDistanceMeters
                : (activeSession.completedDistanceMeters ?? 0) +
                  freeDriveDistanceMeters;
        const extraDistanceMeters =
            activeSession.mode === 'guided'
                ? (activeSession.completedExtraDistanceMeters ?? 0) +
                  routeExtraDistanceMeters
                : 0;
        const extraDurationSeconds =
            activeSession.mode === 'guided'
                ? (activeSession.completedExtraDurationSeconds ?? 0) +
                  routeExtraDurationSeconds
                : 0;
        const endedAt = now();
        let completedTrip = null;

        commitState((currentState) => {
            const finalized = finalizeScorecardSession(currentState, {
                completion:
                    completion ??
                    (arrived
                        ? 'arrival'
                        : activeSession.mode === 'guided'
                          ? 'cancelled'
                          : 'manual'),
                distanceMeters,
                endedAt,
                extraDistanceMeters,
                extraDurationSeconds,
            });

            completedTrip = finalized.trip;

            return completedTrip?.completed && completedTrip.mode === 'guided'
                ? {
                      ...finalized.state,
                      pendingRecapTripId: completedTrip.id,
                  }
                : finalized.state;
        });
        resetDriveTracking();

        return completedTrip;
    }

    function getGuidedExitOptions() {
        const activeSession = scorecardState.activeSession;

        if (!activeSession || activeSession.mode !== 'guided') {
            return {};
        }

        if (!scorecardState.settings.enabled) {
            return { completion: 'paused' };
        }

        const manuallyCompleted = scorecardRouteEndedAtDestination(
            routeSnapshot,
            getLocationCoordinate(lastAcceptedLocation),
        );

        return {
            arrived: manuallyCompleted,
            completion: manuallyCompleted ? 'manual' : 'cancelled',
        };
    }

    function getDesiredDrive() {
        const directionsRoute = routingState.directionsRoute ?? null;
        const guidedIsActive =
            routingState.drivingModeIsActive === true &&
            Boolean(directionsRoute);
        const phoneFreeIsActive =
            routingState.drivingModeIsActive === true && !directionsRoute;

        if (guidedIsActive) {
            return { mode: 'guided', route: directionsRoute };
        }

        if (phoneFreeIsActive || autoPlaySessionIsConnected) {
            return {
                mode: 'free',
                phoneFreeIsActive,
                route: null,
            };
        }

        return { mode: null, route: null };
    }

    function armAutomotiveProvisional({ seedLatestLocation = false } = {}) {
        if (automotiveProvisionalIsArmed) {
            return;
        }

        resetDriveTracking({ seedLatestLocation });
        automotiveProvisionalIsArmed = true;
    }

    function reconcileDriveStateOnce() {
        if (!isHydrated || !secureStorageIsAvailable) {
            return;
        }

        if (!scorecardState.settings.enabled) {
            automotiveProvisionalIsArmed = false;
            automotiveProvisionalShouldSeedLatestLocation = false;

            if (scorecardState.activeSession) {
                finalizeActiveSession({ completion: 'paused' });
            }

            return;
        }

        const desiredDrive = getDesiredDrive();
        let activeSession = scorecardState.activeSession;

        if (desiredDrive.mode === 'guided') {
            automotiveProvisionalIsArmed = false;
            automotiveProvisionalShouldSeedLatestLocation = false;

            if (activeSession?.mode === 'free') {
                finalizeActiveSession({ completion: 'manual' });
                activeSession = scorecardState.activeSession;
            }

            if (!activeSession) {
                startSession('guided', desiredDrive.route);
            } else {
                updateGuidedRoute(desiredDrive.route);
            }

            return;
        }

        if (desiredDrive.mode === 'free') {
            let guidedSessionEnded = false;

            if (activeSession?.mode === 'guided') {
                finalizeActiveSession(getGuidedExitOptions());
                activeSession = scorecardState.activeSession;
                guidedSessionEnded = true;
            }

            if (activeSession?.mode === 'free') {
                automotiveProvisionalIsArmed = false;
                automotiveProvisionalShouldSeedLatestLocation = false;
                return;
            }

            if (desiredDrive.phoneFreeIsActive) {
                automotiveProvisionalIsArmed = false;
                automotiveProvisionalShouldSeedLatestLocation = false;
                startSession('free');
                return;
            }

            armAutomotiveProvisional({
                seedLatestLocation:
                    guidedSessionEnded ||
                    automotiveProvisionalShouldSeedLatestLocation,
            });
            automotiveProvisionalShouldSeedLatestLocation = false;
            return;
        }

        automotiveProvisionalIsArmed = false;
        automotiveProvisionalShouldSeedLatestLocation = false;

        if (activeSession?.mode === 'guided') {
            finalizeActiveSession(getGuidedExitOptions());
        } else if (activeSession?.mode === 'free') {
            finalizeActiveSession({ completion: 'manual' });
        }

        resetDriveTracking();
    }

    function requestDriveStateReconciliation() {
        if (reconciliationIsRunning) {
            reconciliationWasRequested = true;
            return;
        }

        reconciliationIsRunning = true;

        try {
            do {
                reconciliationWasRequested = false;
                reconcileDriveStateOnce();
            } while (reconciliationWasRequested);
        } finally {
            reconciliationIsRunning = false;
        }
    }

    function processGuidedProgress(location) {
        const activeSession = scorecardState.activeSession;
        const directionsRoute = routingState.directionsRoute;
        const normalizedLocation = normalizeLocationForRoute(location);

        if (
            !activeSession ||
            activeSession.mode !== 'guided' ||
            !directionsRoute ||
            !normalizedLocation
        ) {
            return;
        }

        const routeOption = getRouteOption(directionsRoute);
        const routeProgress = getRouteProgress(routeOption, normalizedLocation);
        const routeDistanceMeters = Number(routeOption?.distance) || 0;
        const progressFraction = getScorecardRouteProgressFraction(
            routeSnapshot,
            routeProgress,
        );
        const routeProgressDistanceMeters =
            routeSnapshot?.geometryDistanceMeters || routeDistanceMeters;

        if (routeSnapshot) {
            routeSnapshot.progressFraction = Math.max(
                routeSnapshot.progressFraction,
                progressFraction,
            );
        }

        const arrivalResult = updateScorecardArrivalDetection({
            destinationCoordinate: getWaypointCoordinate(
                directionsRoute.destination,
            ),
            location,
            routeDistanceMeters: routeProgressDistanceMeters,
            routeProgress,
            state: arrivalDetectionState,
        });

        arrivalDetectionState = arrivalResult.state;

        if (!arrivalResult.arrived) {
            return;
        }

        finalizeActiveSession({ arrived: true });

        if (autoPlaySessionIsConnected) {
            automotiveProvisionalShouldSeedLatestLocation = true;
        }

        onGuidedArrival();
    }

    function processActiveLocation(location) {
        const activeSession = scorecardState.activeSession;
        const previousLocation = previousRawLocation;
        const result = processScorecardRawLocationFix({
            activeSession,
            currentLocation: location,
            detectorState,
            previousLocation,
            supplementalNodes,
        });

        previousRawLocation = result.previousLocation;
        detectorState = result.detectorState;

        if (activeSession.mode === 'free') {
            freeDriveDistanceMeters += result.distanceMeters;

            const shouldCheckpointDistance =
                freeDriveDistanceMeters > 0 &&
                ((activeSession.completedDistanceMeters ?? 0) === 0 ||
                    freeDriveDistanceMeters >=
                        FREE_DRIVE_DISTANCE_CHECKPOINT_METERS ||
                    result.exposures.length > 0);

            if (shouldCheckpointDistance || result.exposures.length > 0) {
                const checkpointDistanceMeters = shouldCheckpointDistance
                    ? freeDriveDistanceMeters
                    : 0;

                if (shouldCheckpointDistance) {
                    freeDriveDistanceMeters = 0;
                }

                commitState((currentState) => {
                    if (currentState.activeSession?.id !== activeSession.id) {
                        return currentState;
                    }

                    const stateWithDistance = checkpointDistanceMeters
                        ? {
                              ...currentState,
                              activeSession: {
                                  ...currentState.activeSession,
                                  completedDistanceMeters:
                                      (currentState.activeSession
                                          .completedDistanceMeters ?? 0) +
                                      checkpointDistanceMeters,
                              },
                          }
                        : currentState;

                    return addExposureRecords(
                        stateWithDistance,
                        result.exposures,
                        activeSession.id,
                    );
                });
            }
        } else if (result.exposures.length > 0) {
            commitState((currentState) =>
                currentState.activeSession?.id === activeSession.id
                    ? addExposureRecords(
                          currentState,
                          result.exposures,
                          activeSession.id,
                      )
                    : currentState,
            );
        }

        processGuidedProgress(location);
    }

    function processProvisionalLocation(location) {
        const previousLocation = previousRawLocation;
        const result = processScorecardRawLocationFix({
            activeSession: { mode: 'free' },
            currentLocation: location,
            detectorState,
            previousLocation,
            supplementalNodes,
        });
        const segmentShowsDriving =
            result.distanceMeters > 0 &&
            segmentIndicatesDriving(previousLocation, location);

        previousRawLocation = result.previousLocation;
        detectorState = result.detectorState;

        if (!segmentShowsDriving && result.exposures.length === 0) {
            return;
        }

        const session = {
            ...createSession('free'),
            completedDistanceMeters: result.distanceMeters,
        };

        freeDriveDistanceMeters = 0;
        automotiveProvisionalIsArmed = false;
        commitState((currentState) =>
            addExposureRecords(
                {
                    ...currentState,
                    activeSession: session,
                },
                result.exposures,
                session.id,
            ),
        );
    }

    function processAcceptedLocation(location) {
        if (!secureStorageIsAvailable || !scorecardState.settings.enabled) {
            previousRawLocation = updateScorecardRawLocationAnchor(
                previousRawLocation,
                location,
            );
            return;
        }

        if (scorecardState.activeSession) {
            processActiveLocation(location);
            return;
        }

        if (automotiveProvisionalIsArmed) {
            processProvisionalLocation(location);
            return;
        }

        previousRawLocation = updateScorecardRawLocationAnchor(
            previousRawLocation,
            location,
        );
    }

    function runtimeEventsShouldBeDeferred() {
        return !isHydrated || pendingStateReplacementCount > 0;
    }

    function applyAcceptedLocation(location) {
        lastAcceptedLocation = location;
        processAcceptedLocation(location);
    }

    function applyRoutingState(nextRoutingState) {
        routingState = nextRoutingState;
        requestDriveStateReconciliation();
    }

    function applyAutoPlaySessionState(isConnected) {
        if (autoPlaySessionIsConnected === isConnected) {
            return;
        }

        autoPlaySessionIsConnected = isConnected;
        requestDriveStateReconciliation();
    }

    function applySupplementalNodes(nodes) {
        supplementalNodes = nodes;
    }

    function applyStateUpdate(update, { resetTracking = false } = {}) {
        const nextState = commitState(update);

        if (resetTracking) {
            resetDriveTracking();
        }

        requestDriveStateReconciliation();

        return nextState;
    }

    function applyRuntimeEvent(event) {
        if (event.type === 'accepted-location') {
            applyAcceptedLocation(event.location);
        } else if (event.type === 'routing-state') {
            applyRoutingState(event.routingState);
        } else if (event.type === 'auto-play-session') {
            applyAutoPlaySessionState(event.isConnected);
        } else if (event.type === 'supplemental-nodes') {
            applySupplementalNodes(event.nodes);
        } else if (event.type === 'state-update') {
            applyStateUpdate(event.update, event.options);
        }
    }

    function replayPendingRuntimeEvents() {
        while (
            !runtimeEventsShouldBeDeferred() &&
            pendingRuntimeEvents.length
        ) {
            const runtimeEvents = pendingRuntimeEvents;

            pendingRuntimeEvents = [];
            runtimeEvents.forEach(applyRuntimeEvent);
        }
    }

    function handleAcceptedLocation(location) {
        if (!location) {
            return;
        }

        if (runtimeEventsShouldBeDeferred()) {
            pendingRuntimeEvents.push({
                location,
                type: 'accepted-location',
            });
            return;
        }

        applyAcceptedLocation(location);
    }

    function hydrate() {
        if (isHydrated) {
            return Promise.resolve(scorecardState);
        }

        if (hydrationPromise) {
            return hydrationPromise;
        }

        hydrationPromise = Promise.resolve()
            .then(() =>
                secureStorageIsAvailable
                    ? loadState()
                    : createEmptyScorecardState(),
            )
            .catch(() => createEmptyScorecardState())
            .then((loadedState) => {
                scorecardState = normalizeScorecardState(loadedState, now());
                isHydrated = true;
                publishSnapshot();
                replayPendingRuntimeEvents();

                if (!runtimeEventsShouldBeDeferred()) {
                    requestDriveStateReconciliation();
                }

                return scorecardState;
            })
            .finally(() => {
                hydrationPromise = null;
            });

        return hydrationPromise;
    }

    function setRoutingState(nextRoutingState) {
        const normalizedRoutingState = {
            directionsRoute: nextRoutingState?.directionsRoute ?? null,
            drivingModeIsActive: nextRoutingState?.drivingModeIsActive === true,
        };

        if (runtimeEventsShouldBeDeferred()) {
            pendingRuntimeEvents.push({
                routingState: normalizedRoutingState,
                type: 'routing-state',
            });
            return;
        }

        applyRoutingState(normalizedRoutingState);
    }

    function setAutoPlaySessionState(sessionState) {
        const nextIsConnected = sessionState?.isConnected === true;

        if (runtimeEventsShouldBeDeferred()) {
            pendingRuntimeEvents.push({
                isConnected: nextIsConnected,
                type: 'auto-play-session',
            });
            return;
        }

        applyAutoPlaySessionState(nextIsConnected);
    }

    function setSupplementalNodes(nodes) {
        const normalizedNodes = Array.isArray(nodes) ? [...nodes] : [];

        if (runtimeEventsShouldBeDeferred()) {
            pendingRuntimeEvents.push({
                nodes: normalizedNodes,
                type: 'supplemental-nodes',
            });
            return;
        }

        applySupplementalNodes(normalizedNodes);
    }

    function updateState(update, { resetTracking = false } = {}) {
        if (runtimeEventsShouldBeDeferred()) {
            pendingRuntimeEvents.push({
                options: { resetTracking },
                type: 'state-update',
                update,
            });
            return scorecardState;
        }

        return applyStateUpdate(update, { resetTracking });
    }

    function setTrackingEnabled(enabled) {
        updateState((currentState) => ({
            ...currentState,
            settings: {
                ...currentState.settings,
                enabled: Boolean(enabled),
            },
        }));
    }

    async function performStateReplacement(nextState) {
        const replacedAt = now();
        const normalizedState = normalizeScorecardState(nextState, replacedAt);

        const wasSaved = await enqueuePersistence(() =>
            saveState(normalizedState, replacedAt),
        );

        if (!wasSaved) {
            return false;
        }

        scorecardState = normalizedState;
        stateRevision += 1;
        persistedRevision = stateRevision;
        resetDriveTracking({ seedLatestLocation: true });
        publishSnapshot();

        return true;
    }

    function queueStateReplacement(operation) {
        pendingStateReplacementCount += 1;

        const queuedReplacement = stateReplacementQueue
            .catch(() => {})
            .then(async () => {
                await hydrate();

                return operation();
            });
        let replacementCompletion;

        replacementCompletion = queuedReplacement.finally(() => {
            pendingStateReplacementCount -= 1;

            if (stateReplacementPromise === replacementCompletion) {
                stateReplacementPromise = null;
            }

            if (pendingStateReplacementCount === 0) {
                requestDriveStateReconciliation();
                replayPendingRuntimeEvents();
                requestDriveStateReconciliation();
            }
        });
        stateReplacementQueue = replacementCompletion;
        stateReplacementPromise = replacementCompletion;

        return replacementCompletion;
    }

    function replaceState(nextState) {
        return queueStateReplacement(() => performStateReplacement(nextState));
    }

    async function performHistoryDeletion() {
        const deletedAt = now();
        await enqueuePersistence(async () => {
            await deleteState();

            return true;
        });

        scorecardState = normalizeScorecardState(
            createEmptyScorecardState(),
            deletedAt,
        );
        stateRevision += 1;
        const deletionRevision = stateRevision;

        if (deletionRevision > persistedRevision) {
            persistedRevision = deletionRevision;
        }

        resetDriveTracking({ seedLatestLocation: true });
        publishSnapshot();

        return true;
    }

    function deleteHistory() {
        return queueStateReplacement(performHistoryDeletion);
    }

    async function waitForIdle() {
        await hydrate();

        while (true) {
            const replacement = stateReplacementPromise;
            const persistence = persistenceQueue;

            await Promise.allSettled(
                [replacement, persistence].filter(Boolean),
            );

            if (
                replacement === stateReplacementPromise &&
                persistence === persistenceQueue
            ) {
                return;
            }
        }
    }

    return {
        deleteHistory,
        getSnapshot: () => snapshot,
        handleAcceptedLocation,
        hydrate,
        replaceState,
        resetDriveTracking,
        setAutoPlaySessionState,
        setRoutingState,
        setSupplementalNodes,
        setTrackingEnabled,
        subscribe(listener) {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
        updateState,
        waitForIdle,
    };
}
