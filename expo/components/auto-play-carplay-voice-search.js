const DEFAULT_SILENCE_THRESHOLD_MS = 1500;
const DEFAULT_MAX_DURATION_MS = 10000;

export function createCarPlayVoiceSearchController({
    getHybridVoice,
    isVoiceInputCanceledError = () => false,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    onVoiceNavigation,
    silenceThresholdMs = DEFAULT_SILENCE_THRESHOLD_MS,
}) {
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

        return activeSearch;
    };

    const stopNativeVoiceInput = (HybridVoice) => {
        try {
            HybridVoice?.stopVoiceInput();
        } catch {}
    };

    const finishSearch = (expectedGeneration, callbackName) => {
        const activeSearch = clearPendingSearch(expectedGeneration);

        activeSearch?.[callbackName]?.();
    };

    const requestPermissionsForNextAttempt = (HybridVoice) => {
        try {
            Promise.resolve(HybridVoice.requestVoiceInputPermission?.()).catch(
                () => {},
            );
        } catch {}
    };

    const cancel = () => {
        generation += 1;
        clearPendingSearch();
        stopNativeVoiceInput(getHybridVoice());
    };

    const start = ({
        onCancelled,
        onFallback,
        onNoMatch = onFallback,
        onUnavailable = onFallback,
    }) => {
        const HybridVoice = getHybridVoice();

        if (!HybridVoice) {
            return false;
        }

        if (pendingSearch) {
            return true;
        }

        const searchGeneration = generation + 1;
        generation = searchGeneration;
        pendingSearch = {
            generation: searchGeneration,
            onCancelled,
            onNoMatch,
            onUnavailable,
        };

        Promise.resolve()
            .then(async () => {
                let permissionIsGranted = false;

                try {
                    permissionIsGranted = HybridVoice.hasVoiceInputPermission();
                } catch {
                    permissionIsGranted = false;
                }

                if (pendingSearch?.generation !== searchGeneration) {
                    return;
                }

                if (!permissionIsGranted) {
                    finishSearch(searchGeneration, 'onUnavailable');
                    requestPermissionsForNextAttempt(HybridVoice);
                    return;
                }

                const result = await HybridVoice.startVoiceInput({
                    listeningText: 'Where would you like to go?',
                    maxDurationMs,
                    preferSpeechToText: true,
                    silenceThresholdMs,
                });

                if (pendingSearch?.generation !== searchGeneration) {
                    return;
                }

                const query = String(result?.transcription ?? '').trim();

                if (!query) {
                    finishSearch(searchGeneration, 'onNoMatch');
                    return;
                }

                clearPendingSearch(searchGeneration);
                onVoiceNavigation(undefined, query, 'search');
            })
            .catch((error) => {
                if (pendingSearch?.generation !== searchGeneration) {
                    return;
                }

                finishSearch(
                    searchGeneration,
                    isVoiceInputCanceledError(error)
                        ? 'onCancelled'
                        : 'onUnavailable',
                );
            });

        return true;
    };

    return {
        cancel,
        start,
    };
}
