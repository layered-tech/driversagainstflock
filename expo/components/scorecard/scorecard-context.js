import * as Linking from 'expo-linking';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
} from 'react';
import { APP_ENVIRONMENT } from '../../lib/auth/constants';
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
    createE2EScorecardFixture,
    getE2EScorecardFixtureFromURL,
} from './scorecard-e2e-fixture';
import { ScorecardE2EProbe } from './scorecard-e2e-probe';
import {
    applyScorecardTripGasPrice,
    getScorecardLevel,
    getScorecardWindowStats,
    recordScorecardContribution,
    resetScorecardFuelCostSettings,
    SCORECARD_BADGES,
    setScorecardFuelCostSettings,
} from './scorecard-engine';
import {
    deleteScorecardRuntimeHistory,
    getScorecardRuntimeSnapshot,
    replaceScorecardRuntimeState,
    setScorecardRuntimeTrackingEnabled,
    subscribeScorecardRuntime,
    updateScorecardRuntimeState,
} from './scorecard-runtime-instance';
import { scorecardSecureStorageIsAvailable } from './scorecard-storage';
import { getRegularGasPriceForState } from './state-gas-prices';

const ScorecardContext = createContext(null);

export function ScorecardProvider({ children }) {
    const { isHydrated, persistedRevision, scorecardState, stateRevision } =
        useSyncExternalStore(
            subscribeScorecardRuntime,
            getScorecardRuntimeSnapshot,
            getScorecardRuntimeSnapshot,
        );
    const gasPriceRequestsRef = useRef(new Set());
    const pendingE2EFixtureURLRef = useRef(null);
    const providerIsMountedRef = useRef(false);
    const stateRef = useRef(scorecardState);
    const backupFilesAreAvailable = scorecardBackupFilesAreAvailable();
    const secureStorageIsAvailable = scorecardSecureStorageIsAvailable();

    stateRef.current = scorecardState;

    useEffect(() => {
        providerIsMountedRef.current = true;

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

            updateScorecardRuntimeState(
                {
                    ...fixture.state,
                    pendingRecapTripId: fixture.pendingRecap?.id ?? null,
                },
                { resetTracking: true },
            );
        },
        [secureStorageIsAvailable],
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

    useEffect(() => {
        const activeSession = scorecardState.activeSession;

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

                updateScorecardRuntimeState((currentState) => {
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

                    return applyScorecardTripGasPrice(
                        currentState,
                        sessionId,
                        gasPrice,
                    ).state;
                });
            })
            .finally(() => {
                gasPriceRequestsRef.current.delete(sessionId);
            });
    }, [
        isHydrated,
        scorecardState.activeSession?.gasPrice,
        scorecardState.activeSession?.id,
        scorecardState.activeSession?.startingStateCode,
        secureStorageIsAvailable,
    ]);

    const setTrackingEnabled = useCallback((enabled) => {
        setScorecardRuntimeTrackingEnabled(enabled);
    }, []);
    const setFuelCostSettings = useCallback((settings) => {
        updateScorecardRuntimeState((currentState) =>
            setScorecardFuelCostSettings(currentState, settings),
        );
    }, []);
    const resetFuelCostSettings = useCallback(() => {
        updateScorecardRuntimeState(resetScorecardFuelCostSettings);
    }, []);
    const exportBackup = useCallback(async () => {
        if (stateRef.current.activeSession) {
            throw new Error(
                'Finish the active drive before exporting a scorecard backup.',
            );
        }

        const createdAt = Date.now();

        return exportScorecardBackupFile(
            createScorecardBackup(stateRef.current, createdAt),
            getScorecardBackupFilename(createdAt),
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
    const restoreBackup = useCallback(async (backup) => {
        if (stateRef.current.activeSession) {
            throw new Error(
                'Finish the active drive before importing a scorecard backup.',
            );
        }

        if (!backup?.state) {
            throw new Error('The selected scorecard backup is invalid.');
        }

        const wasSaved = await replaceScorecardRuntimeState(backup.state);

        if (!wasSaved) {
            throw new Error(
                'The imported scorecard could not be saved securely.',
            );
        }

        pendingE2EFixtureURLRef.current = null;
        gasPriceRequestsRef.current.clear();
    }, []);
    const deleteHistory = useCallback(async () => {
        await deleteScorecardRuntimeHistory();
        pendingE2EFixtureURLRef.current = null;
        gasPriceRequestsRef.current.clear();
    }, []);
    const dismissRecap = useCallback(() => {
        updateScorecardRuntimeState((currentState) =>
            currentState.pendingRecapTripId
                ? { ...currentState, pendingRecapTripId: null }
                : currentState,
        );
    }, []);
    const recordPublishedCameras = useCallback(
        (count = 1) => {
            if (!secureStorageIsAvailable) {
                return;
            }

            updateScorecardRuntimeState((currentState) =>
                recordScorecardContribution(currentState, Date.now(), count),
            );
        },
        [secureStorageIsAvailable],
    );
    const pendingRecap = useMemo(
        () =>
            scorecardState.trips.find(
                (trip) => trip.id === scorecardState.pendingRecapTripId,
            ) ?? null,
        [scorecardState.pendingRecapTripId, scorecardState.trips],
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
