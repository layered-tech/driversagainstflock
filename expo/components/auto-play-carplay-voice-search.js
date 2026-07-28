const DEFAULT_SILENCE_THRESHOLD_MS = 1500;
const DEFAULT_MAX_DURATION_MS = 10000;
const DEFAULT_STARTUP_TIMEOUT_MS = 3000;
const DEFAULT_STOP_TIMEOUT_MS = 2000;

export function createCarPlayVoiceSearchController({
    clearTimeoutFn = clearTimeout,
    getHybridAutoPlay,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    onVoiceNavigation,
    setTimeoutFn = setTimeout,
    silenceThresholdMs = DEFAULT_SILENCE_THRESHOLD_MS,
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS,
}) {
    let appInitiatedCancel = false;
    let generation = 0;
    let pendingSearch = null;

    const clearPendingSearch = (expectedGeneration) => {
        if (
            !pendingSearch ||
            (expectedGeneration !== undefined &&
                pendingSearch.generation !== expectedGeneration)
        ) {
            return null;
        }

        const activeSearch = pendingSearch;
        pendingSearch = null;

        if (activeSearch.startupTimeout !== null) {
            clearTimeoutFn(activeSearch.startupTimeout);
        }

        if (activeSearch.stopFallbackTimeout !== null) {
            clearTimeoutFn(activeSearch.stopFallbackTimeout);
        }

        return activeSearch;
    };

    const stopNativeVoiceInput = (HybridAutoPlay) => {
        try {
            HybridAutoPlay?.stopVoiceInput();
        } catch {}
    };

    const finishSearch = (expectedGeneration, callbackName) => {
        const activeSearch = clearPendingSearch(expectedGeneration);

        activeSearch?.[callbackName]?.();
    };

    const requestPermissionsForNextAttempt = (HybridAutoPlay) => {
        try {
            Promise.resolve(
                HybridAutoPlay.requestVoiceInputPermission?.(),
            ).catch(() => {});
        } catch {}
    };

    const cancel = () => {
        appInitiatedCancel = true;
        generation += 1;
        clearPendingSearch();
        stopNativeVoiceInput(getHybridAutoPlay());
    };

    const start = ({
        onCancelled,
        onFallback,
        onNoMatch = onFallback,
        onUnavailable = onFallback,
    }) => {
        const HybridAutoPlay = getHybridAutoPlay();

        if (!HybridAutoPlay) {
            return false;
        }

        if (pendingSearch) {
            return true;
        }

        cancel();

        const searchGeneration = generation + 1;
        generation = searchGeneration;
        appInitiatedCancel = false;
        pendingSearch = {
            generation: searchGeneration,
            onCancelled,
            onFallback,
            onNoMatch,
            onUnavailable,
            startupTimeout: null,
            stopFallbackTimeout: null,
            unavailableAfterStop: false,
        };

        Promise.resolve()
            .then(async () => {
                let permissionIsGranted = false;

                try {
                    permissionIsGranted =
                        HybridAutoPlay.hasVoiceInputPermission();
                } catch {
                    permissionIsGranted = false;
                }

                if (pendingSearch?.generation !== searchGeneration) {
                    return;
                }

                if (!permissionIsGranted) {
                    finishSearch(searchGeneration, 'onUnavailable');
                    requestPermissionsForNextAttempt(HybridAutoPlay);
                    return;
                }

                pendingSearch.startupTimeout = setTimeoutFn(() => {
                    const activeSearch = pendingSearch;

                    if (activeSearch?.generation !== searchGeneration) {
                        return;
                    }

                    activeSearch.startupTimeout = null;
                    activeSearch.unavailableAfterStop = true;
                    stopNativeVoiceInput(HybridAutoPlay);
                    activeSearch.stopFallbackTimeout = setTimeoutFn(() => {
                        finishSearch(searchGeneration, 'onUnavailable');
                    }, stopTimeoutMs);
                }, startupTimeoutMs);

                await HybridAutoPlay.startVoiceInput(
                    silenceThresholdMs,
                    maxDurationMs,
                    'Where would you like to go?',
                );

                finishSearch(searchGeneration, 'onUnavailable');
            })
            .catch(() => {
                finishSearch(searchGeneration, 'onUnavailable');
            });

        return true;
    };

    const handleNativeEvent = (coordinates, query, requestType) => {
        const activeSearch = pendingSearch;

        if (!activeSearch) {
            return;
        }

        if (requestType === 'searchListening') {
            if (activeSearch.startupTimeout !== null) {
                clearTimeoutFn(activeSearch.startupTimeout);
                activeSearch.startupTimeout = null;
            }
            return;
        }

        if (requestType === 'searchNoMatch') {
            finishSearch(activeSearch.generation, 'onNoMatch');
            return;
        }

        if (requestType === 'searchError') {
            finishSearch(activeSearch.generation, 'onUnavailable');
            return;
        }

        if (requestType === 'searchCancelled') {
            if (activeSearch.unavailableAfterStop) {
                finishSearch(activeSearch.generation, 'onUnavailable');
            } else if (appInitiatedCancel) {
                clearPendingSearch(activeSearch.generation);
            } else {
                // The CPVoiceControlTemplate disappeared without any app-side
                // stop: user cancel, Siri, or a system modal took it down.
                finishSearch(activeSearch.generation, 'onCancelled');
            }
            return;
        }

        const trimmedQuery = String(query ?? '').trim();

        if (requestType !== 'search' || !trimmedQuery) {
            return;
        }

        clearPendingSearch(activeSearch.generation);
        onVoiceNavigation(coordinates, trimmedQuery, requestType);
    };

    return {
        cancel,
        handleNativeEvent,
        start,
    };
}
