export const MAP_PREFERENCES_PERSIST_INTERVAL_MS = 30 * 1000;

export function createMapPreferencesPersistenceScheduler({
    clearTimeoutFn = clearTimeout,
    intervalMs = MAP_PREFERENCES_PERSIST_INTERVAL_MS,
    now = Date.now,
    setTimeoutFn = setTimeout,
    write,
}) {
    let lastWrittenAt = 0;
    let hasWritten = false;
    let latestValue = null;
    let pendingTimeout = null;
    let writeChain = Promise.resolve();
    let writtenValue = null;

    const clearPendingWrite = () => {
        if (pendingTimeout === null) {
            return;
        }

        clearTimeoutFn(pendingTimeout);
        pendingTimeout = null;
    };

    const writeLatestValue = () => {
        pendingTimeout = null;

        if (latestValue === null || latestValue === writtenValue) {
            return writeChain;
        }

        const value = latestValue;

        writtenValue = value;
        lastWrittenAt = now();
        hasWritten = true;

        writeChain = writeChain
            .catch(() => {})
            .then(() => write(value))
            .catch(() => {
                if (writtenValue === value) {
                    writtenValue = null;
                }
            });

        return writeChain;
    };

    const schedule = (value, { immediate = false } = {}) => {
        if (value === latestValue && value === writtenValue) {
            return;
        }

        latestValue = value;

        const elapsedSinceLastWrite = Math.max(0, now() - lastWrittenAt);

        if (immediate || !hasWritten || elapsedSinceLastWrite >= intervalMs) {
            clearPendingWrite();
            void writeLatestValue();
            return;
        }

        if (pendingTimeout !== null) {
            return;
        }

        pendingTimeout = setTimeoutFn(
            () => void writeLatestValue(),
            intervalMs - elapsedSinceLastWrite,
        );
    };

    const flush = () => {
        clearPendingWrite();

        return writeLatestValue();
    };

    return {
        flush,
        schedule,
    };
}
