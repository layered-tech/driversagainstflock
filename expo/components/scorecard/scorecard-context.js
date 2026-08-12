import * as Linking from 'expo-linking';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { APP_ENVIRONMENT } from '../../lib/auth/constants';
import {
    getDirectionsRouteProgress,
    getDirectionsWaypointCoordinate,
    getSelectedDirectionsRouteOption,
} from '../map/directions';
import { getCoordinateDistanceMeters, getStoredNumber } from '../map/geo';
import {
    useSharedMapLocationState,
    useSharedMapState,
} from '../map/shared-map-state';
import { getDirectionsRouteSyncKey } from '../map/shared-routing-state';
import { updateScorecardArrivalDetection } from './arrival-detection';
import { processScorecardExposureSegment } from './exposure-detection';
import { getLocalStartingStateCode } from './local-state-resolver';
import {
    createE2EScorecardFixture,
    getE2EScorecardFixtureFromURL,
} from './scorecard-e2e-fixture';
import {
    addScorecardExposure,
    applyScorecardTripGasPrice,
    createEmptyScorecardState,
    createLocalScorecardId,
    createScorecardSession,
    creditAvoidedRouteCameras,
    finalizeScorecardSession,
    getScorecardLevel,
    getScorecardWindowStats,
    recordScorecardContribution,
    SCORECARD_BADGES,
} from './scorecard-engine';
import { getScorecardExposureRouteSegment } from './scorecard-exposure-route';
import {
    getScorecardRouteDistanceSnapshot,
    scorecardRouteHasReachedEnd,
} from './scorecard-route-progress';
import {
    deleteEncryptedScorecardState,
    loadEncryptedScorecardState,
    saveEncryptedScorecardState,
    scorecardSecureStorageIsAvailable,
} from './scorecard-storage';
import { getRegularGasPriceForState } from './state-gas-prices';

const ScorecardContext = createContext(null);
const MAX_DISTANCE_SAMPLE_GAP_MS = 15 * 1000;
const MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND = 70;

function getLocationCoordinate(location) {
    const latitude = getStoredNumber(
        location?.coords?.latitude ?? location?.latitude,
    );
    const longitude = getStoredNumber(
        location?.coords?.longitude ?? location?.longitude,
    );

    return latitude === null || longitude === null
        ? null
        : [longitude, latitude];
}

function getLocationTimestamp(location) {
    return (
        getStoredNumber(location?.timestamp ?? location?.recordedAt) ??
        Date.now()
    );
}

function getPlausibleDistanceMeters(previousLocation, currentLocation) {
    const previousCoordinate = getLocationCoordinate(previousLocation);
    const currentCoordinate = getLocationCoordinate(currentLocation);
    const previousTimestamp = getLocationTimestamp(previousLocation);
    const currentTimestamp = getLocationTimestamp(currentLocation);
    const elapsedMs = currentTimestamp - previousTimestamp;
    const distanceMeters =
        previousCoordinate && currentCoordinate
            ? getCoordinateDistanceMeters(previousCoordinate, currentCoordinate)
            : null;

    if (
        distanceMeters === null ||
        elapsedMs <= 0 ||
        elapsedMs > MAX_DISTANCE_SAMPLE_GAP_MS ||
        distanceMeters / (elapsedMs / 1000) >
            MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND
    ) {
        return 0;
    }

    return distanceMeters;
}

function getRouteDistanceSnapshot(route, progressFraction = 0) {
    return {
        ...getScorecardRouteDistanceSnapshot(route, progressFraction),
        key: getDirectionsRouteSyncKey(route),
        route,
    };
}

export function ScorecardProvider({ children }) {
    const {
        alprCoverageComplete,
        alprNodes,
        directionsRoute,
        drivingModeIsActive,
        setDirectionsRoute,
        setDrivingModeIsActive,
    } = useSharedMapState();
    const { userLocation } = useSharedMapLocationState();
    const [scorecardState, setScorecardState] = useState(
        createEmptyScorecardState,
    );
    const [isHydrated, setIsHydrated] = useState(false);
    const [pendingRecap, setPendingRecap] = useState(null);
    const stateRef = useRef(scorecardState);
    const arrivalDetectionRef = useRef(null);
    const arrivalFinalizingRef = useRef(false);
    const detectorStateRef = useRef({ cameras: {} });
    const freeDriveDistanceMetersRef = useRef(0);
    const gasPriceRequestsRef = useRef(new Set());
    const pendingE2EFixtureURLRef = useRef(null);
    const previousLocationRef = useRef(null);
    const providerIsMountedRef = useRef(true);
    const routeSnapshotRef = useRef(null);
    const sessionStartInFlightRef = useRef(false);
    const secureStorageIsAvailable = scorecardSecureStorageIsAvailable();

    const commitState = useCallback((update) => {
        const currentState = stateRef.current;
        const nextState =
            typeof update === 'function' ? update(currentState) : update;

        if (!nextState || nextState === currentState) {
            return currentState;
        }

        stateRef.current = nextState;
        setScorecardState(nextState);
        void saveEncryptedScorecardState(nextState).catch(() => {});

        return nextState;
    }, []);

    useEffect(() => {
        providerIsMountedRef.current = true;

        loadEncryptedScorecardState().then((loadedState) => {
            if (!providerIsMountedRef.current) {
                return;
            }

            stateRef.current = loadedState;
            setScorecardState(loadedState);
            setPendingRecap(
                loadedState.trips.find(
                    (trip) => trip.id === loadedState.pendingRecapTripId,
                ) ?? null,
            );
            setIsHydrated(true);
        });

        return () => {
            providerIsMountedRef.current = false;
        };
    }, []);

    const applyE2EScorecardFixture = useCallback(
        (url) => {
            if (APP_ENVIRONMENT !== 'e2e' || !secureStorageIsAvailable) {
                return;
            }

            const requestedFixture = getE2EScorecardFixtureFromURL(url);

            if (!requestedFixture) {
                return;
            }

            const fixture = createE2EScorecardFixture(requestedFixture);

            commitState({
                ...fixture.state,
                pendingRecapTripId: fixture.pendingRecap?.id ?? null,
            });
            setPendingRecap(fixture.pendingRecap);
        },
        [commitState, secureStorageIsAvailable],
    );

    useEffect(() => {
        if (APP_ENVIRONMENT !== 'e2e') {
            return undefined;
        }

        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (isHydrated) {
                applyE2EScorecardFixture(url);
            } else {
                pendingE2EFixtureURLRef.current = url;
            }
        });

        if (isHydrated) {
            const pendingFixtureURL = pendingE2EFixtureURLRef.current;

            pendingE2EFixtureURLRef.current = null;

            if (pendingFixtureURL) {
                applyE2EScorecardFixture(pendingFixtureURL);
            } else {
                Linking.getInitialURL()
                    .then((url) => {
                        if (url) {
                            applyE2EScorecardFixture(url);
                        }
                    })
                    .catch(() => {});
            }
        }

        return () => {
            subscription.remove();
        };
    }, [applyE2EScorecardFixture, isHydrated]);

    const rollRouteSnapshotIntoSession = useCallback(() => {
        const snapshot = routeSnapshotRef.current;

        if (!snapshot || !stateRef.current.activeSession) {
            return;
        }

        const completedDistanceMeters =
            snapshot.distanceMeters * snapshot.progressFraction;
        const completedExtraDistanceMeters =
            snapshot.extraDistanceMeters * snapshot.progressFraction;
        const completedExtraDurationSeconds =
            snapshot.extraDurationSeconds * snapshot.progressFraction;

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
    }, [commitState]);

    useEffect(() => {
        const activeSession = stateRef.current.activeSession;

        if (
            !activeSession ||
            activeSession.mode !== 'guided' ||
            !directionsRoute
        ) {
            return;
        }

        const nextKey = getDirectionsRouteSyncKey(directionsRoute);
        const currentSnapshot = routeSnapshotRef.current;

        if (currentSnapshot?.key && currentSnapshot.key !== nextKey) {
            rollRouteSnapshotIntoSession();
        }

        if (!currentSnapshot || currentSnapshot.key !== nextKey) {
            routeSnapshotRef.current = getRouteDistanceSnapshot(
                directionsRoute,
                0,
            );
        }
    }, [directionsRoute, rollRouteSnapshotIntoSession]);

    const finalizeActiveSession = useCallback(
        ({ arrived = false, completion } = {}) => {
            const activeSession = stateRef.current.activeSession;

            if (!activeSession) {
                return null;
            }

            const snapshot = routeSnapshotRef.current;
            const currentProgress = arrived
                ? 1
                : (snapshot?.progressFraction ?? 0);
            const routeDistanceMeters = snapshot
                ? snapshot.distanceMeters * currentProgress
                : 0;
            const routeExtraDistanceMeters = snapshot
                ? snapshot.extraDistanceMeters * currentProgress
                : 0;
            const routeExtraDurationSeconds = snapshot
                ? snapshot.extraDurationSeconds * currentProgress
                : 0;
            const distanceMeters =
                activeSession.mode === 'guided'
                    ? (activeSession.completedDistanceMeters ?? 0) +
                      routeDistanceMeters
                    : freeDriveDistanceMetersRef.current;
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
            const endedAt = Date.now();
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

                return arrived && completedTrip
                    ? {
                          ...finalized.state,
                          pendingRecapTripId: completedTrip.id,
                      }
                    : finalized.state;
            });

            routeSnapshotRef.current = null;
            arrivalDetectionRef.current = null;
            detectorStateRef.current = { cameras: {} };
            freeDriveDistanceMetersRef.current = 0;
            previousLocationRef.current = null;

            if (arrived && completedTrip) {
                setPendingRecap(completedTrip);
            }

            return completedTrip;
        },
        [commitState],
    );

    const startSession = useCallback(() => {
        if (
            sessionStartInFlightRef.current ||
            stateRef.current.activeSession ||
            !stateRef.current.settings.enabled ||
            !secureStorageIsAvailable
        ) {
            return;
        }

        sessionStartInFlightRef.current = true;
        const mode = directionsRoute ? 'guided' : 'free';
        const startedAt = Date.now();
        const routeStartCoordinate = directionsRoute
            ? (getLocationCoordinate(userLocation) ??
              getDirectionsWaypointCoordinate(directionsRoute.start))
            : null;
        const startingStateCode = routeStartCoordinate
            ? getLocalStartingStateCode(routeStartCoordinate)
            : null;
        const session = createScorecardSession({
            exposureCoverageComplete: alprCoverageComplete,
            id: createLocalScorecardId('drive', startedAt),
            mode,
            startedAt,
            startingStateCode,
        });

        commitState((currentState) => ({
            ...currentState,
            activeSession: session,
        }));
        routeSnapshotRef.current = directionsRoute
            ? getRouteDistanceSnapshot(directionsRoute, 0)
            : null;
        arrivalDetectionRef.current = null;
        detectorStateRef.current = { cameras: {} };
        freeDriveDistanceMetersRef.current = 0;
        previousLocationRef.current = userLocation;
        sessionStartInFlightRef.current = false;
    }, [
        commitState,
        alprCoverageComplete,
        directionsRoute,
        secureStorageIsAvailable,
        userLocation,
    ]);

    useEffect(() => {
        const activeSession = stateRef.current.activeSession;

        if (
            !isHydrated ||
            !secureStorageIsAvailable ||
            !activeSession?.startingStateCode ||
            Number.isFinite(activeSession.gasPrice) ||
            gasPriceRequestsRef.current.has(activeSession.id)
        ) {
            return;
        }

        const sessionId = activeSession.id;

        gasPriceRequestsRef.current.add(sessionId);
        void getRegularGasPriceForState(activeSession.startingStateCode)
            .then((gasPrice) => {
                if (!gasPrice || !providerIsMountedRef.current) {
                    return;
                }

                let pricedTrip = null;

                commitState((currentState) => {
                    if (currentState.activeSession?.id === sessionId) {
                        return {
                            ...currentState,
                            activeSession: {
                                ...currentState.activeSession,
                                gasPrice: gasPrice.price,
                                gasPriceRetrievedAt: gasPrice.retrievedAt,
                                gasPriceSourceAsOf: gasPrice.sourceAsOf,
                            },
                        };
                    }

                    const priced = applyScorecardTripGasPrice(
                        currentState,
                        sessionId,
                        gasPrice,
                    );

                    pricedTrip = priced.trip;

                    return priced.state;
                });

                if (pricedTrip) {
                    setPendingRecap((currentRecap) =>
                        currentRecap?.id === pricedTrip.id
                            ? pricedTrip
                            : currentRecap,
                    );
                }
            })
            .finally(() => {
                gasPriceRequestsRef.current.delete(sessionId);
            });
    }, [
        commitState,
        isHydrated,
        scorecardState.activeSession?.gasPrice,
        scorecardState.activeSession?.id,
        scorecardState.activeSession?.startingStateCode,
        secureStorageIsAvailable,
    ]);

    useEffect(() => {
        commitState((currentState) => {
            const activeSession = currentState.activeSession;

            if (!activeSession) {
                return currentState;
            }

            if (alprCoverageComplete === null) {
                return activeSession.exposureCoveragePending === true
                    ? currentState
                    : {
                          ...currentState,
                          activeSession: {
                              ...activeSession,
                              exposureCoveragePending: true,
                          },
                      };
            }

            return {
                ...currentState,
                activeSession: {
                    ...activeSession,
                    exposureCoverageObserved: true,
                    exposureCoveragePending: false,
                    exposureCoverageWasTruncated:
                        activeSession.exposureCoverageWasTruncated === true ||
                        alprCoverageComplete === false,
                },
            };
        });
    }, [alprCoverageComplete, commitState]);

    useEffect(() => {
        if (!isHydrated || !secureStorageIsAvailable) {
            return;
        }

        const activeSession = stateRef.current.activeSession;

        if (
            drivingModeIsActive &&
            scorecardState.settings.enabled &&
            !activeSession
        ) {
            startSession();
            return;
        }

        if (
            activeSession &&
            (!drivingModeIsActive || !scorecardState.settings.enabled) &&
            !arrivalFinalizingRef.current
        ) {
            const routeEnded =
                scorecardState.settings.enabled &&
                activeSession.mode === 'guided' &&
                scorecardRouteHasReachedEnd(routeSnapshotRef.current);

            finalizeActiveSession({
                arrived: routeEnded,
                completion: scorecardState.settings.enabled
                    ? routeEnded
                        ? 'arrival'
                        : undefined
                    : 'paused',
            });
        }
    }, [
        drivingModeIsActive,
        finalizeActiveSession,
        isHydrated,
        scorecardState.activeSession,
        scorecardState.settings.enabled,
        secureStorageIsAvailable,
        startSession,
    ]);

    useEffect(() => {
        const activeSession = stateRef.current.activeSession;
        const previousLocation = previousLocationRef.current;

        if (
            !isHydrated ||
            !drivingModeIsActive ||
            !activeSession ||
            !scorecardState.settings.enabled ||
            !userLocation
        ) {
            previousLocationRef.current = userLocation;
            return;
        }

        if (previousLocation && activeSession.mode === 'free') {
            freeDriveDistanceMetersRef.current += getPlausibleDistanceMeters(
                previousLocation,
                userLocation,
            );
        }

        if (previousLocation) {
            const exposureResult = processScorecardExposureSegment({
                currentLocation: userLocation,
                detectorState: detectorStateRef.current,
                nodes: alprNodes,
                previousLocation,
            });

            detectorStateRef.current = exposureResult.detectorState;

            if (exposureResult.exposures.length > 0) {
                const selectedRouteCoordinates =
                    activeSession.mode === 'guided' && directionsRoute
                        ? getSelectedDirectionsRouteOption(directionsRoute)
                              ?.coordinates
                        : null;

                commitState((currentState) =>
                    exposureResult.exposures.reduce((nextState, exposure) => {
                        const guidedRouteSegment =
                            getScorecardExposureRouteSegment(
                                selectedRouteCoordinates,
                                exposure.cameraCoordinate,
                            );

                        return addScorecardExposure(nextState, {
                            ...exposure,
                            id: createLocalScorecardId(
                                'read',
                                exposure.occurredAt,
                            ),
                            routeSegmentCoordinates:
                                guidedRouteSegment.length > 0
                                    ? guidedRouteSegment
                                    : exposure.routeSegmentCoordinates,
                            sessionId: activeSession.id,
                        });
                    }, currentState),
                );
            }
        }

        if (activeSession.mode === 'guided' && directionsRoute) {
            const routeOption =
                getSelectedDirectionsRouteOption(directionsRoute);
            const routeProgress = getDirectionsRouteProgress(
                routeOption,
                userLocation,
            );
            const routeDistanceMeters = Number(routeOption?.distance) || 0;
            const progressFraction =
                routeProgress && routeDistanceMeters > 0
                    ? Math.min(
                          1,
                          Math.max(
                              0,
                              routeProgress.alongRouteDistance /
                                  routeDistanceMeters,
                          ),
                      )
                    : 0;

            if (routeSnapshotRef.current) {
                routeSnapshotRef.current.progressFraction = Math.max(
                    routeSnapshotRef.current.progressFraction,
                    progressFraction,
                );
            }

            commitState((currentState) => {
                if (currentState.activeSession?.id !== activeSession.id) {
                    return currentState;
                }

                const nextSession = creditAvoidedRouteCameras(
                    currentState.activeSession,
                    directionsRoute,
                    progressFraction,
                    getLocationTimestamp(userLocation),
                );

                return nextSession === currentState.activeSession
                    ? currentState
                    : { ...currentState, activeSession: nextSession };
            });

            const arrivalResult = updateScorecardArrivalDetection({
                destinationCoordinate: getDirectionsWaypointCoordinate(
                    directionsRoute.destination,
                ),
                location: userLocation,
                routeDistanceMeters,
                routeProgress,
                state: arrivalDetectionRef.current,
            });

            arrivalDetectionRef.current = arrivalResult.state;

            if (arrivalResult.arrived && !arrivalFinalizingRef.current) {
                arrivalFinalizingRef.current = true;
                commitState((currentState) => {
                    if (currentState.activeSession?.id !== activeSession.id) {
                        return currentState;
                    }

                    const fullyCreditedSession = creditAvoidedRouteCameras(
                        currentState.activeSession,
                        directionsRoute,
                        1,
                        getLocationTimestamp(userLocation),
                    );

                    return {
                        ...currentState,
                        activeSession: fullyCreditedSession,
                    };
                });
                finalizeActiveSession({ arrived: true });
                setDirectionsRoute(null);
                setDrivingModeIsActive(false);
                arrivalFinalizingRef.current = false;
            }
        }

        previousLocationRef.current = userLocation;
    }, [
        alprNodes,
        commitState,
        directionsRoute,
        drivingModeIsActive,
        finalizeActiveSession,
        isHydrated,
        scorecardState.settings.enabled,
        setDirectionsRoute,
        setDrivingModeIsActive,
        userLocation,
    ]);

    const setTrackingEnabled = useCallback(
        (enabled) => {
            commitState((currentState) => ({
                ...currentState,
                settings: {
                    ...currentState.settings,
                    enabled: Boolean(enabled),
                },
            }));
        },
        [commitState],
    );
    const deleteHistory = useCallback(async () => {
        const emptyState = createEmptyScorecardState();

        stateRef.current = emptyState;
        setScorecardState(emptyState);
        setPendingRecap(null);
        routeSnapshotRef.current = null;
        arrivalDetectionRef.current = null;
        detectorStateRef.current = { cameras: {} };
        freeDriveDistanceMetersRef.current = 0;
        previousLocationRef.current = userLocation;
        await deleteEncryptedScorecardState().catch(() => {});
    }, [userLocation]);
    const dismissRecap = useCallback(() => {
        setPendingRecap(null);
        commitState((currentState) =>
            currentState.pendingRecapTripId
                ? { ...currentState, pendingRecapTripId: null }
                : currentState,
        );
    }, [commitState]);
    const recordPublishedCameras = useCallback(
        (count = 1) => {
            if (!secureStorageIsAvailable) {
                return;
            }

            commitState((currentState) =>
                recordScorecardContribution(currentState, Date.now(), count),
            );
        },
        [commitState, secureStorageIsAvailable],
    );
    const windowStats = useMemo(
        () => getScorecardWindowStats(scorecardState),
        [scorecardState],
    );
    const level = useMemo(
        () => getScorecardLevel(scorecardState.lifetime.xp),
        [scorecardState.lifetime.xp],
    );
    const badges = useMemo(
        () =>
            SCORECARD_BADGES.map((badge) => ({
                ...badge,
                earned: Boolean(scorecardState.badgeUnlocks[badge.id]),
                unlockedAt: scorecardState.badgeUnlocks[badge.id] ?? null,
            })),
        [scorecardState.badgeUnlocks],
    );
    const value = useMemo(
        () => ({
            badges,
            deleteHistory,
            dismissRecap,
            isHydrated,
            level,
            pendingRecap,
            recordPublishedCameras,
            scorecardState,
            secureStorageIsAvailable,
            setTrackingEnabled,
            windowStats,
        }),
        [
            badges,
            deleteHistory,
            dismissRecap,
            isHydrated,
            level,
            pendingRecap,
            recordPublishedCameras,
            scorecardState,
            secureStorageIsAvailable,
            setTrackingEnabled,
            windowStats,
        ],
    );

    return (
        <ScorecardContext.Provider value={value}>
            {children}
        </ScorecardContext.Provider>
    );
}

export function useScorecard() {
    const scorecard = useContext(ScorecardContext);

    if (!scorecard) {
        throw new Error('useScorecard must be used inside ScorecardProvider.');
    }

    return scorecard;
}
