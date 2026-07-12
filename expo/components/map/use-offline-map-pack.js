import { offlineManager, OfflinePackDownloadState } from '@rnmapbox/maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    formatBytes,
    formatOfflineBounds,
    formatOfflineError,
    formatTileCount,
    getOfflineBoundsKey,
    getOfflinePackBounds,
    getOfflineRegionEstimate,
    normalizeOfflineBounds,
    OFFLINE_DEFAULT_MAX_ZOOM_LEVEL,
    OFFLINE_MAP_METADATA_SOURCE,
    OFFLINE_MAP_PACK_NAME,
    OFFLINE_MIN_ZOOM_LEVEL,
} from './offline-map-utils';

const OFFLINE_PROGRESS_EVENT_THROTTLE_MS = 500;
const OFFLINE_STATUS_POLL_INTERVAL_MS = 1500;
const OFFLINE_DOWNLOAD_ATTEMPT_TIMEOUT_MS = 30000;

function getNumericPercentage(value) {
    const percentage = Number(value);

    if (!Number.isFinite(percentage)) {
        return 0;
    }

    return Math.min(100, Math.max(0, percentage));
}

function getDownloadedBytes(status) {
    const downloadedBytes = Number(status?.completedResourceSize);

    return Number.isFinite(downloadedBytes) && downloadedBytes >= 0
        ? downloadedBytes
        : null;
}

function getStatusResourceCount(status, key) {
    const value = Number(status?.[key]);

    return Number.isFinite(value) && value >= 0 ? value : null;
}

function getOfflinePackProgressKey(status) {
    if (!status) {
        return '';
    }

    return [
        status.percentage,
        status.completedResourceSize,
        status.completedResourceCount,
        status.completedTileCount,
        status.completedTileSize,
        status.requiredResourceCount,
    ]
        .map((value) => {
            const numericValue = Number(value);

            return Number.isFinite(numericValue) ? String(numericValue) : '';
        })
        .join('|');
}

function getOfflinePackState(status) {
    const state = status?.state;

    if (state === OfflinePackDownloadState?.Active) {
        return 'active';
    }

    if (state === OfflinePackDownloadState?.Complete) {
        return 'complete';
    }

    if (state === OfflinePackDownloadState?.Inactive) {
        return 'inactive';
    }

    const normalizedState = String(state ?? '').toLowerCase();

    if (normalizedState === 'active') {
        return 'active';
    }

    if (normalizedState === 'complete') {
        return 'complete';
    }

    if (normalizedState === 'inactive') {
        return 'inactive';
    }

    return 'unknown';
}

function getOfflinePackStatusIsComplete(status) {
    return (
        getOfflinePackState(status) === 'complete' ||
        getNumericPercentage(status?.percentage) >= 100
    );
}

function getOfflinePackStatusLabel(packState) {
    switch (packState) {
        case 'active':
            return 'Downloading';
        case 'complete':
            return 'Ready offline';
        case 'inactive':
            return 'Paused';
        default:
            return 'Not downloaded';
    }
}

export function useOfflineMapPack({ currentMapBounds, mapStyleURL }) {
    const downloadAttemptProgressKeyRef = useRef('');
    const downloadAttemptTimeoutRef = useRef(null);
    const isOfflineDownloadAttemptActiveRef = useRef(false);
    const isMountedRef = useRef(false);
    const currentMapBoundsValue = useMemo(
        () => normalizeOfflineBounds(currentMapBounds),
        [currentMapBounds],
    );
    const currentMapBoundsKey = useMemo(
        () => getOfflineBoundsKey(currentMapBoundsValue),
        [currentMapBoundsValue],
    );
    const [downloadedBounds, setDownloadedBounds] = useState(null);
    const [downloadedMaxZoom, setDownloadedMaxZoom] = useState(null);
    const [downloadedStyleURL, setDownloadedStyleURL] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isDeletingOfflinePack, setIsDeletingOfflinePack] = useState(false);
    const [isLoadingOfflinePack, setIsLoadingOfflinePack] = useState(true);
    const [isStartingOfflineDownload, setIsStartingOfflineDownload] =
        useState(false);
    const [isOfflineDownloadAttemptActive, setIsOfflineDownloadAttemptActive] =
        useState(false);
    const [offlinePack, setOfflinePack] = useState(null);
    const [offlinePackStatus, setOfflinePackStatus] = useState(null);
    const [selectedBounds, setSelectedBounds] = useState(null);
    const [selectedMaxZoom, setSelectedMaxZoom] = useState(
        OFFLINE_DEFAULT_MAX_ZOOM_LEVEL,
    );

    const selectedBoundsKey = useMemo(
        () => getOfflineBoundsKey(selectedBounds),
        [selectedBounds],
    );
    const downloadedBoundsKey = useMemo(
        () => getOfflineBoundsKey(downloadedBounds),
        [downloadedBounds],
    );
    const selectedRegionEstimate = useMemo(
        () => getOfflineRegionEstimate(selectedBounds, selectedMaxZoom),
        [selectedBounds, selectedMaxZoom],
    );

    const clearOfflineDownloadAttemptTimeout = useCallback(() => {
        if (!downloadAttemptTimeoutRef.current) {
            return;
        }

        clearTimeout(downloadAttemptTimeoutRef.current);
        downloadAttemptTimeoutRef.current = null;
    }, []);

    const setOfflineDownloadAttemptState = useCallback((isActive) => {
        isOfflineDownloadAttemptActiveRef.current = isActive;
        setIsOfflineDownloadAttemptActive(isActive);
    }, []);

    const clearOfflineDownloadAttempt = useCallback(() => {
        clearOfflineDownloadAttemptTimeout();
        downloadAttemptProgressKeyRef.current = '';
        setOfflineDownloadAttemptState(false);
    }, [clearOfflineDownloadAttemptTimeout, setOfflineDownloadAttemptState]);

    const scheduleOfflineDownloadAttemptTimeout = useCallback(
        ({ reset = false } = {}) => {
            if (reset) {
                clearOfflineDownloadAttemptTimeout();
            }

            if (downloadAttemptTimeoutRef.current) {
                return;
            }

            downloadAttemptTimeoutRef.current = setTimeout(() => {
                downloadAttemptTimeoutRef.current = null;
                downloadAttemptProgressKeyRef.current = '';

                if (isMountedRef.current) {
                    setOfflineDownloadAttemptState(false);
                }
            }, OFFLINE_DOWNLOAD_ATTEMPT_TIMEOUT_MS);
        },
        [clearOfflineDownloadAttemptTimeout, setOfflineDownloadAttemptState],
    );

    const updateOfflineDownloadAttemptFromStatus = useCallback(
        (status, { forceActive = false } = {}) => {
            if (getOfflinePackStatusIsComplete(status)) {
                clearOfflineDownloadAttempt();
                return;
            }

            const packState = getOfflinePackState(status);
            const progressKey = getOfflinePackProgressKey(status);
            const progressChanged =
                Boolean(progressKey) &&
                progressKey !== downloadAttemptProgressKeyRef.current;

            if (progressChanged) {
                downloadAttemptProgressKeyRef.current = progressKey;
            }

            const attemptShouldStayActive =
                forceActive ||
                packState === 'active' ||
                isOfflineDownloadAttemptActiveRef.current;

            if (!attemptShouldStayActive) {
                clearOfflineDownloadAttempt();
                return;
            }

            setOfflineDownloadAttemptState(true);

            if (packState === 'active') {
                clearOfflineDownloadAttemptTimeout();
                return;
            }

            scheduleOfflineDownloadAttemptTimeout({
                reset: !status || progressChanged,
            });
        },
        [
            clearOfflineDownloadAttempt,
            clearOfflineDownloadAttemptTimeout,
            scheduleOfflineDownloadAttemptTimeout,
            setOfflineDownloadAttemptState,
        ],
    );

    const applyOfflinePackMetadata = useCallback((pack) => {
        const metadata = pack?.metadata ?? {};
        const metadataBounds = getOfflinePackBounds(metadata, pack?.bounds);
        const metadataMaxZoom = Number(metadata?.maxZoom);
        const metadataStyleURL =
            typeof metadata?.styleURL === 'string' ? metadata.styleURL : '';

        if (metadataBounds) {
            setDownloadedBounds(metadataBounds);
            setSelectedBounds(metadataBounds);
        }

        if (Number.isFinite(metadataMaxZoom)) {
            setDownloadedMaxZoom(metadataMaxZoom);
            setSelectedMaxZoom(metadataMaxZoom);
        }

        setDownloadedStyleURL(metadataStyleURL);
    }, []);

    const handleOfflinePackProgress = useCallback(
        (pack, status) => {
            if (!isMountedRef.current) {
                return;
            }

            if (pack) {
                setOfflinePack(pack);
            }

            setOfflinePackStatus(status);
            updateOfflineDownloadAttemptFromStatus(status, {
                forceActive: true,
            });
            setErrorMessage('');
        },
        [updateOfflineDownloadAttemptFromStatus],
    );

    const handleOfflinePackError = useCallback(
        (_pack, error) => {
            if (!isMountedRef.current) {
                return;
            }

            clearOfflineDownloadAttempt();
            setErrorMessage(formatOfflineError(error));
        },
        [clearOfflineDownloadAttempt],
    );

    const loadOfflinePack = useCallback(async () => {
        setIsLoadingOfflinePack(true);
        setErrorMessage('');

        try {
            offlineManager.setProgressEventThrottle(
                OFFLINE_PROGRESS_EVENT_THROTTLE_MS,
            );
            const pack = await offlineManager.getPack(OFFLINE_MAP_PACK_NAME);

            if (!isMountedRef.current) {
                return;
            }

            if (!pack) {
                setOfflinePack(null);
                setOfflinePackStatus(null);
                clearOfflineDownloadAttempt();
                setDownloadedBounds(null);
                setDownloadedMaxZoom(null);
                setDownloadedStyleURL('');
                return;
            }

            setOfflinePack(pack);
            applyOfflinePackMetadata(pack);

            try {
                const status = await pack.status();

                setOfflinePackStatus(status);
                updateOfflineDownloadAttemptFromStatus(status);
            } catch {
                setOfflinePackStatus(null);
                clearOfflineDownloadAttempt();
            }
        } catch (error) {
            if (isMountedRef.current) {
                setErrorMessage(formatOfflineError(error));
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoadingOfflinePack(false);
            }
        }
    }, [
        applyOfflinePackMetadata,
        clearOfflineDownloadAttempt,
        updateOfflineDownloadAttemptFromStatus,
    ]);

    useEffect(() => {
        isMountedRef.current = true;
        loadOfflinePack();

        return () => {
            isMountedRef.current = false;
            clearOfflineDownloadAttemptTimeout();
            offlineManager.unsubscribe(OFFLINE_MAP_PACK_NAME);
        };
    }, [clearOfflineDownloadAttemptTimeout, loadOfflinePack]);

    useEffect(() => {
        if (!selectedBounds && currentMapBoundsValue && !offlinePack) {
            setSelectedBounds(currentMapBoundsValue);
        }
    }, [currentMapBoundsValue, offlinePack, selectedBounds]);

    const useCurrentMapRegion = useCallback(() => {
        if (!currentMapBoundsValue) {
            setErrorMessage('Move the map before choosing an offline region.');
            return;
        }

        setSelectedBounds(currentMapBoundsValue);
        setErrorMessage('');
    }, [currentMapBoundsValue]);

    const deleteExistingOfflinePack = useCallback(async () => {
        offlineManager.unsubscribe(OFFLINE_MAP_PACK_NAME);

        const existingPack = await offlineManager.getPack(
            OFFLINE_MAP_PACK_NAME,
        );

        if (!existingPack) {
            return;
        }

        try {
            await existingPack.pause();
        } catch {
            // Complete packs and already-paused packs can fail pause; deletion is still valid.
        }

        await offlineManager.deletePack(OFFLINE_MAP_PACK_NAME);
    }, []);

    const resetOfflinePackState = useCallback(() => {
        setOfflinePack(null);
        setOfflinePackStatus(null);
        clearOfflineDownloadAttempt();
        setDownloadedBounds(null);
        setDownloadedMaxZoom(null);
        setDownloadedStyleURL('');
    }, [clearOfflineDownloadAttempt]);

    const startOfflineDownload = useCallback(
        async ({ replaceExisting = false } = {}) => {
            const normalizedBounds = normalizeOfflineBounds(selectedBounds);

            if (!normalizedBounds) {
                setErrorMessage('Choose an offline region before downloading.');
                return;
            }

            setIsStartingOfflineDownload(true);
            updateOfflineDownloadAttemptFromStatus(null, { forceActive: true });
            setErrorMessage('');

            try {
                offlineManager.setProgressEventThrottle(
                    OFFLINE_PROGRESS_EVENT_THROTTLE_MS,
                );

                if (replaceExisting) {
                    await deleteExistingOfflinePack();
                    resetOfflinePackState();
                    updateOfflineDownloadAttemptFromStatus(null, {
                        forceActive: true,
                    });
                }

                const metadata = {
                    createdAt: new Date().toISOString(),
                    maxZoom: selectedMaxZoom,
                    minZoom: OFFLINE_MIN_ZOOM_LEVEL,
                    regionBounds: normalizedBounds,
                    source: OFFLINE_MAP_METADATA_SOURCE,
                    styleURL: mapStyleURL,
                };

                await offlineManager.createPack(
                    {
                        name: OFFLINE_MAP_PACK_NAME,
                        styleURL: mapStyleURL,
                        tilesets: [],
                        bounds: [normalizedBounds.ne, normalizedBounds.sw],
                        minZoom: OFFLINE_MIN_ZOOM_LEVEL,
                        maxZoom: selectedMaxZoom,
                        metadata,
                    },
                    handleOfflinePackProgress,
                    handleOfflinePackError,
                );

                const pack = await offlineManager.getPack(
                    OFFLINE_MAP_PACK_NAME,
                );

                if (isMountedRef.current && pack) {
                    setOfflinePack(pack);
                    applyOfflinePackMetadata(pack);

                    try {
                        const status = await pack.status();

                        setOfflinePackStatus(status);
                        updateOfflineDownloadAttemptFromStatus(status, {
                            forceActive: true,
                        });
                    } catch {
                        setOfflinePackStatus(null);
                    }
                } else if (isMountedRef.current) {
                    clearOfflineDownloadAttempt();
                }
            } catch (error) {
                if (isMountedRef.current) {
                    clearOfflineDownloadAttempt();
                    setErrorMessage(formatOfflineError(error));
                }
            } finally {
                if (isMountedRef.current) {
                    setIsStartingOfflineDownload(false);
                }
            }
        },
        [
            applyOfflinePackMetadata,
            deleteExistingOfflinePack,
            handleOfflinePackError,
            handleOfflinePackProgress,
            mapStyleURL,
            resetOfflinePackState,
            selectedBounds,
            selectedMaxZoom,
            updateOfflineDownloadAttemptFromStatus,
        ],
    );

    const resumeOfflineDownload = useCallback(async () => {
        setIsStartingOfflineDownload(true);
        setErrorMessage('');

        try {
            const pack =
                offlinePack ??
                (await offlineManager.getPack(OFFLINE_MAP_PACK_NAME));

            if (!pack) {
                await startOfflineDownload();
                return;
            }

            updateOfflineDownloadAttemptFromStatus(null, { forceActive: true });
            await pack.resume();

            if (isMountedRef.current) {
                setOfflinePack(pack);
                const status = await pack.status();

                setOfflinePackStatus(status);
                updateOfflineDownloadAttemptFromStatus(status, {
                    forceActive: true,
                });
            }
        } catch (error) {
            if (isMountedRef.current) {
                clearOfflineDownloadAttempt();
                setErrorMessage(formatOfflineError(error));
            }
        } finally {
            if (isMountedRef.current) {
                setIsStartingOfflineDownload(false);
            }
        }
    }, [
        clearOfflineDownloadAttempt,
        offlinePack,
        startOfflineDownload,
        updateOfflineDownloadAttemptFromStatus,
    ]);

    const deleteOfflinePack = useCallback(async () => {
        setIsDeletingOfflinePack(true);
        setErrorMessage('');

        try {
            await deleteExistingOfflinePack();

            if (isMountedRef.current) {
                resetOfflinePackState();
            }
        } catch (error) {
            if (isMountedRef.current) {
                setErrorMessage(formatOfflineError(error));
            }
        } finally {
            if (isMountedRef.current) {
                setIsDeletingOfflinePack(false);
            }
        }
    }, [deleteExistingOfflinePack, resetOfflinePackState]);

    const offlinePackState = useMemo(
        () => getOfflinePackState(offlinePackStatus),
        [offlinePackStatus],
    );
    const progressPercentage = getNumericPercentage(
        offlinePackStatus?.percentage,
    );
    const downloadedBytes = getDownloadedBytes(offlinePackStatus);
    const completedResourceCount = getStatusResourceCount(
        offlinePackStatus,
        'completedResourceCount',
    );
    const requiredResourceCount = getStatusResourceCount(
        offlinePackStatus,
        'requiredResourceCount',
    );
    const hasOfflinePack = Boolean(offlinePack);
    const offlineDownloadIsComplete =
        getOfflinePackStatusIsComplete(offlinePackStatus);
    const offlineDownloadIsActive =
        hasOfflinePack &&
        !offlineDownloadIsComplete &&
        (offlinePackState === 'active' || isOfflineDownloadAttemptActive);
    const selectionDiffersFromPack =
        hasOfflinePack &&
        (selectedBoundsKey !== downloadedBoundsKey ||
            selectedMaxZoom !== downloadedMaxZoom ||
            mapStyleURL !== downloadedStyleURL);
    const operationIsPending =
        isLoadingOfflinePack ||
        isStartingOfflineDownload ||
        isDeletingOfflinePack;
    const primaryActionIsDisabled =
        !selectedBounds ||
        operationIsPending ||
        offlineDownloadIsActive ||
        (hasOfflinePack &&
            offlineDownloadIsComplete &&
            !selectionDiffersFromPack);
    const primaryActionLabel = (() => {
        if (isLoadingOfflinePack) {
            return 'Loading Offline Map';
        }

        if (isStartingOfflineDownload) {
            return selectionDiffersFromPack
                ? 'Replacing Download'
                : 'Starting Download';
        }

        if (offlineDownloadIsActive) {
            return 'Downloading';
        }

        if (hasOfflinePack && selectionDiffersFromPack) {
            return 'Replace Download';
        }

        if (hasOfflinePack && !offlineDownloadIsComplete) {
            return 'Resume Download';
        }

        if (hasOfflinePack) {
            return 'Downloaded';
        }

        return 'Download Map';
    })();
    const statusLabel = (() => {
        if (offlineDownloadIsActive) {
            return 'Downloading';
        }

        if (!hasOfflinePack) {
            return 'Not downloaded';
        }

        if (selectionDiffersFromPack) {
            return 'Changes not downloaded';
        }

        return getOfflinePackStatusLabel(offlinePackState);
    })();
    const storageLabel = (() => {
        const estimatedStorageLabel = selectedRegionEstimate
            ? `~${formatBytes(selectedRegionEstimate.estimatedBytes)} estimated`
            : 'Select a region';

        if (selectionDiffersFromPack || downloadedBytes === null) {
            return estimatedStorageLabel;
        }

        if (offlineDownloadIsComplete) {
            return formatBytes(downloadedBytes);
        }

        return `${formatBytes(downloadedBytes)} downloaded`;
    })();
    const resourceLabel = (() => {
        if (selectionDiffersFromPack && selectedRegionEstimate) {
            return `${formatTileCount(selectedRegionEstimate.tileCount)} estimated tiles`;
        }

        if (completedResourceCount !== null && requiredResourceCount !== null) {
            return `${formatTileCount(completedResourceCount)} of ${formatTileCount(
                requiredResourceCount,
            )} resources`;
        }

        if (selectedRegionEstimate) {
            return `${formatTileCount(selectedRegionEstimate.tileCount)} estimated tiles`;
        }

        return 'No region selected';
    })();
    const progressLabel =
        hasOfflinePack && !selectionDiffersFromPack
            ? `${Math.round(progressPercentage)}%`
            : '';

    useEffect(() => {
        if (
            (!hasOfflinePack && !isStartingOfflineDownload) ||
            offlineDownloadIsComplete
        ) {
            clearOfflineDownloadAttempt();
        }
    }, [
        clearOfflineDownloadAttempt,
        hasOfflinePack,
        isStartingOfflineDownload,
        offlineDownloadIsComplete,
    ]);

    useEffect(() => {
        if (
            !offlinePack ||
            !offlineDownloadIsActive ||
            selectionDiffersFromPack ||
            isDeletingOfflinePack
        ) {
            return undefined;
        }

        let pollIsActive = true;

        async function pollOfflinePackStatus() {
            try {
                const status = await offlinePack.status();

                if (pollIsActive && isMountedRef.current) {
                    setOfflinePackStatus(status);
                    updateOfflineDownloadAttemptFromStatus(status);
                }
            } catch {
                // A failed status refresh should not interrupt map interaction.
            }
        }

        pollOfflinePackStatus();
        const intervalId = setInterval(
            pollOfflinePackStatus,
            OFFLINE_STATUS_POLL_INTERVAL_MS,
        );

        return () => {
            pollIsActive = false;
            clearInterval(intervalId);
        };
    }, [
        isDeletingOfflinePack,
        offlineDownloadIsActive,
        offlinePack,
        selectionDiffersFromPack,
        updateOfflineDownloadAttemptFromStatus,
    ]);

    const handlePrimaryOfflineAction = useCallback(async () => {
        if (
            hasOfflinePack &&
            !selectionDiffersFromPack &&
            !offlineDownloadIsComplete
        ) {
            await resumeOfflineDownload();
            return;
        }

        await startOfflineDownload({ replaceExisting: hasOfflinePack });
    }, [
        hasOfflinePack,
        offlineDownloadIsComplete,
        resumeOfflineDownload,
        selectionDiffersFromPack,
        startOfflineDownload,
    ]);

    return {
        canUseCurrentMapRegion: Boolean(currentMapBoundsKey),
        currentMapBoundsKey,
        deleteOfflinePack,
        errorMessage,
        handlePrimaryOfflineAction,
        hasOfflinePack,
        isDeletingOfflinePack,
        isLoadingOfflinePack,
        isStartingOfflineDownload,
        offlineDownloadIsActive,
        offlineDownloadIsComplete,
        operationIsPending,
        primaryActionIsDisabled,
        primaryActionLabel,
        progressLabel,
        progressPercentage,
        resourceLabel,
        selectedBounds,
        selectedMaxZoom,
        selectedRegionEstimate,
        selectedRegionLabel: formatOfflineBounds(selectedBounds),
        selectionDiffersFromPack,
        setSelectedMaxZoom,
        statusLabel,
        storageLabel,
        useCurrentMapRegion,
    };
}
