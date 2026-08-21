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
    addAcceptedDeviceLocationListener,
    getLatestAcceptedDeviceLocation,
} from '../map/accepted-device-location';
import {
    getDirectionsRouteProgress,
    getDirectionsWaypointCoordinate,
    getSelectedDirectionsRouteOption,
} from '../map/directions';
import { getStoredNumber } from '../map/geo';
import {
    useSharedMapLocationState,
    useSharedMapState,
} from '../map/shared-map-state';
import { getDirectionsRouteGeometrySyncKey } from '../map/shared-routing-state';
import { updateScorecardArrivalDetection } from './arrival-detection';
import { getLocalStartingStateCode } from './local-state-resolver';
import {
    createScorecardBackup,
    getScorecardBackupFilename,
    parseScorecardBackup,
} from './scorecard-backup';
import {
    exportScorecardBackupFile,
    importScorecardBackupFile,
    scorecardBackupFilesAreAvailable,
} from './scorecard-backup-file';
import {
    processScorecardRawLocationFix,
    updateScorecardRawLocationAnchor,
} from './scorecard-drive-coordinator';
import {
    createE2EScorecardFixture,
    getE2EScorecardFixtureFromURL,
} from './scorecard-e2e-fixture';
import { ScorecardE2EProbe } from './scorecard-e2e-probe';
import {
    addScorecardExposure,
    applyScorecardTripGasPrice,
    createEmptyScorecardState,
    createLocalScorecardId,
    createScorecardSession,
    finalizeScorecardSession,
    getScorecardLevel,
    getScorecardWindowStats,
    mergeScorecardSessionRouteCatalog,
    normalizeScorecardState,
    recordScorecardContribution,
    resetScorecardFuelCostSettings,
    SCORECARD_BADGES,
    setScorecardFuelCostSettings,
} from './scorecard-engine';
import {
    getScorecardRouteDistanceSnapshot,
    getScorecardRouteProgressFraction,
    scorecardRouteEndedAtDestination,
} from './scorecard-route-progress';
import {
    deleteEncryptedScorecardState,
    loadEncryptedScorecardState,
    saveEncryptedScorecardState,
    scorecardSecureStorageIsAvailable,
} from './scorecard-storage';
import { getRegularGasPriceForState } from './state-gas-prices';

const ScorecardContext = createContext(null);

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

function getMostRecentLocationCoordinate(...locations) {
    let latestCoordinate = null;
    let latestTimestamp = null;

    for (const location of locations) {
        const coordinate = getLocationCoordinate(location);

        if (!coordinate) {
            continue;
        }

        const timestamp = getStoredNumber(
            location?.timestamp ?? location?.recordedAt,
        );

        if (
            latestCoordinate === null ||
            (timestamp === null && latestTimestamp === null) ||
            (timestamp !== null &&
                (latestTimestamp === null || timestamp >= latestTimestamp))
        ) {
            latestCoordinate = coordinate;
            latestTimestamp = timestamp;
        }
    }

    return latestCoordinate;
}

function getRouteDistanceSnapshot(route, progressFraction = 0) {
    return {
        ...getScorecardRouteDistanceSnapshot(route, progressFraction),
        key: getDirectionsRouteGeometrySyncKey(route),
        route,
    };
}

function seedRawLocationAnchor(previousLocation, ...candidateLocations) {
    return candidateLocations.reduce(
        (anchor, candidateLocation) =>
            updateScorecardRawLocationAnchor(anchor, candidateLocation),
        previousLocation ?? null,
    );
}

export function ScorecardProvider({ children }) {
    const {
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
    const [persistedRevision, setPersistedRevision] = useState(0);
    const stateRef = useRef(scorecardState);
    const [stateRevision, setStateRevision] = useState(0);
    const arrivalDetectionRef = useRef(null);
    const arrivalFinalizingRef = useRef(false);
    const detectorStateRef = useRef({ cameras: {} });
    const freeDriveDistanceMetersRef = useRef(0);
    const gasPriceRequestsRef = useRef(new Set());
    const pendingE2EFixtureURLRef = useRef(null);
    const persistedRevisionRef = useRef(0);
    const previousRawLocationRef = useRef(null);
    const providerIsMountedRef = useRef(true);
    const rawLocationRuntimeRef = useRef(null);
    const routeSnapshotRef = useRef(null);
    const sessionStartInFlightRef = useRef(false);
    const stateRevisionRef = useRef(0);
    const backupFilesAreAvailable = scorecardBackupFilesAreAvailable();
    const secureStorageIsAvailable = scorecardSecureStorageIsAvailable();

    rawLocationRuntimeRef.current = {
        alprNodes,
        drivingModeIsActive,
        isHydrated,
    };

    const commitState = useCallback((update) => {
        const currentState = stateRef.current;
        const updatedState =
            typeof update === 'function' ? update(currentState) : update;

        if (!updatedState || updatedState === currentState) {
            return currentState;
        }

        const committedAt = Date.now();
        const nextState = normalizeScorecardState(updatedState, committedAt);

        stateRef.current = nextState;
        setScorecardState(nextState);
        const revision = stateRevisionRef.current + 1;

        stateRevisionRef.current = revision;
        setStateRevision(revision);
        void saveEncryptedScorecardState(nextState, committedAt)
            .then((wasSaved) => {
                if (
                    !wasSaved ||
                    !providerIsMountedRef.current ||
                    revision <= persistedRevisionRef.current
                ) {
                    return;
                }

                persistedRevisionRef.current = revision;
                setPersistedRevision(revision);
            })
            .catch(() => {});

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

        commitState((currentState) => {
            const currentSession = currentState.activeSession;

            if (!currentSession || currentSession.mode !== 'guided') {
                return currentState;
            }

            const mergedSession = mergeScorecardSessionRouteCatalog(
                currentSession,
                directionsRoute,
            );

            return mergedSession === currentSession
                ? currentState
                : { ...currentState, activeSession: mergedSession };
        });

        const nextKey = getDirectionsRouteGeometrySyncKey(directionsRoute);
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
    }, [
        commitState,
        directionsRoute,
        rollRouteSnapshotIntoSession,
        scorecardState.activeSession?.id,
    ]);

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

                return completedTrip?.completed &&
                    completedTrip.mode === 'guided'
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
            previousRawLocationRef.current = null;

            if (completedTrip?.completed && completedTrip.mode === 'guided') {
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
            id: createLocalScorecardId('drive', startedAt),
            mode,
            route: mode === 'guided' ? directionsRoute : null,
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
        previousRawLocationRef.current = seedRawLocationAnchor(
            previousRawLocationRef.current,
            getLatestAcceptedDeviceLocation(),
            userLocation,
        );
        sessionStartInFlightRef.current = false;
    }, [commitState, directionsRoute, secureStorageIsAvailable, userLocation]);

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
            const endLocation = getMostRecentLocationCoordinate(
                getLatestAcceptedDeviceLocation(),
                userLocation,
            );
            const manuallyCompletedGuidedRoute =
                scorecardState.settings.enabled &&
                activeSession.mode === 'guided' &&
                scorecardRouteEndedAtDestination(
                    routeSnapshotRef.current,
                    endLocation,
                );

            finalizeActiveSession({
                arrived: manuallyCompletedGuidedRoute,
                completion: !scorecardState.settings.enabled
                    ? 'paused'
                    : activeSession.mode === 'guided'
                      ? manuallyCompletedGuidedRoute
                          ? 'manual'
                          : 'cancelled'
                      : 'manual',
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
        userLocation,
    ]);

    useEffect(() => {
        const subscription = addAcceptedDeviceLocationListener(
            (currentLocation) => {
                const runtime = rawLocationRuntimeRef.current;
                const activeSession = stateRef.current.activeSession;

                if (
                    !runtime?.isHydrated ||
                    !runtime.drivingModeIsActive ||
                    !activeSession ||
                    !stateRef.current.settings.enabled
                ) {
                    previousRawLocationRef.current =
                        updateScorecardRawLocationAnchor(
                            previousRawLocationRef.current,
                            currentLocation,
                        );
                    return;
                }

                const previousLocation = previousRawLocationRef.current;
                const result = processScorecardRawLocationFix({
                    activeSession,
                    currentLocation,
                    detectorState: detectorStateRef.current,
                    previousLocation,
                    supplementalNodes: runtime.alprNodes,
                });

                previousRawLocationRef.current = result.previousLocation;
                detectorStateRef.current = result.detectorState;
                freeDriveDistanceMetersRef.current += result.distanceMeters;

                if (result.exposures.length === 0) {
                    return;
                }

                commitState((currentState) => {
                    if (currentState.activeSession?.id !== activeSession.id) {
                        return currentState;
                    }

                    return result.exposures.reduce(
                        (nextState, exposure) =>
                            addScorecardExposure(nextState, {
                                ...exposure,
                                id: createLocalScorecardId(
                                    'read',
                                    exposure.occurredAt,
                                ),
                                routeSegmentCoordinates: null,
                                sessionId: activeSession.id,
                            }),
                        currentState,
                    );
                });
            },
        );

        return () => {
            subscription.remove();
        };
    }, [commitState]);

    useEffect(() => {
        const activeSession = stateRef.current.activeSession;

        if (
            !isHydrated ||
            !drivingModeIsActive ||
            !activeSession ||
            !scorecardState.settings.enabled ||
            !userLocation
        ) {
            return;
        }

        if (activeSession.mode === 'guided' && directionsRoute) {
            const routeOption =
                getSelectedDirectionsRouteOption(directionsRoute);
            const routeProgress = getDirectionsRouteProgress(
                routeOption,
                userLocation,
            );
            const routeDistanceMeters = Number(routeOption?.distance) || 0;
            const progressFraction = getScorecardRouteProgressFraction(
                routeSnapshotRef.current,
                routeProgress,
            );
            const routeProgressDistanceMeters =
                routeSnapshotRef.current?.geometryDistanceMeters ||
                routeDistanceMeters;

            if (routeSnapshotRef.current) {
                routeSnapshotRef.current.progressFraction = Math.max(
                    routeSnapshotRef.current.progressFraction,
                    progressFraction,
                );
            }

            const arrivalResult = updateScorecardArrivalDetection({
                destinationCoordinate: getDirectionsWaypointCoordinate(
                    directionsRoute.destination,
                ),
                location: userLocation,
                routeDistanceMeters: routeProgressDistanceMeters,
                routeProgress,
                state: arrivalDetectionRef.current,
            });

            arrivalDetectionRef.current = arrivalResult.state;

            if (arrivalResult.arrived && !arrivalFinalizingRef.current) {
                arrivalFinalizingRef.current = true;
                finalizeActiveSession({ arrived: true });
                setDirectionsRoute(null);
                setDrivingModeIsActive(false);
                arrivalFinalizingRef.current = false;
            }
        }
    }, [
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
    const setFuelCostSettings = useCallback(
        (settings) => {
            commitState((currentState) =>
                setScorecardFuelCostSettings(currentState, settings),
            );
        },
        [commitState],
    );
    const resetFuelCostSettings = useCallback(() => {
        commitState(resetScorecardFuelCostSettings);
    }, [commitState]);
    const exportBackup = useCallback(async () => {
        if (stateRef.current.activeSession) {
            throw new Error(
                'Finish the active drive before exporting a scorecard backup.',
            );
        }

        const now = Date.now();

        return exportScorecardBackupFile(
            createScorecardBackup(stateRef.current, now),
            getScorecardBackupFilename(now),
        );
    }, []);
    const pickBackupForImport = useCallback(async () => {
        if (stateRef.current.activeSession) {
            throw new Error(
                'Finish the active drive before importing a scorecard backup.',
            );
        }

        const serializedBackup = await importScorecardBackupFile();

        return serializedBackup === null
            ? null
            : parseScorecardBackup(serializedBackup);
    }, []);
    const restoreBackup = useCallback(
        async (backup) => {
            if (stateRef.current.activeSession) {
                throw new Error(
                    'Finish the active drive before importing a scorecard backup.',
                );
            }

            if (!backup?.state) {
                throw new Error('The selected scorecard backup is invalid.');
            }

            const restoredAt = Date.now();
            const restoredState = normalizeScorecardState(
                backup.state,
                restoredAt,
            );
            const wasSaved = await saveEncryptedScorecardState(
                restoredState,
                restoredAt,
            );

            if (!wasSaved) {
                throw new Error(
                    'The imported scorecard could not be saved securely.',
                );
            }

            stateRef.current = restoredState;
            setScorecardState(restoredState);
            setPendingRecap(null);
            pendingE2EFixtureURLRef.current = null;
            routeSnapshotRef.current = null;
            arrivalDetectionRef.current = null;
            detectorStateRef.current = { cameras: {} };
            freeDriveDistanceMetersRef.current = 0;
            gasPriceRequestsRef.current.clear();
            previousRawLocationRef.current = seedRawLocationAnchor(
                previousRawLocationRef.current,
                getLatestAcceptedDeviceLocation(),
                userLocation,
            );
        },
        [userLocation],
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
        previousRawLocationRef.current = seedRawLocationAnchor(
            previousRawLocationRef.current,
            getLatestAcceptedDeviceLocation(),
            userLocation,
        );
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
            backupFilesAreAvailable,
            badges,
            deleteHistory,
            dismissRecap,
            exportBackup,
            isHydrated,
            level,
            pendingRecap,
            pickBackupForImport,
            recordPublishedCameras,
            resetFuelCostSettings,
            restoreBackup,
            scorecardState,
            secureStorageIsAvailable,
            setFuelCostSettings,
            setTrackingEnabled,
            windowStats,
        }),
        [
            backupFilesAreAvailable,
            badges,
            deleteHistory,
            dismissRecap,
            exportBackup,
            isHydrated,
            level,
            pendingRecap,
            pickBackupForImport,
            recordPublishedCameras,
            resetFuelCostSettings,
            restoreBackup,
            scorecardState,
            secureStorageIsAvailable,
            setFuelCostSettings,
            setTrackingEnabled,
            windowStats,
        ],
    );

    return (
        <ScorecardContext.Provider value={value}>
            {children}
            <ScorecardE2EProbe
                activeSession={scorecardState.activeSession}
                isHydrated={isHydrated}
                persistedRevision={persistedRevision}
                stateRevision={stateRevision}
            />
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
