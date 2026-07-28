export const MAP_PREFERENCES_PERSIST_INTERVAL_MS = 30 * 1000;
export const MAP_PREFERENCES_PERSIST_WRITE_TIMEOUT_MS = 1500;

export function createMapPreferencesPersistenceScheduler({
    clearTimeoutFn = clearTimeout,
    intervalMs = MAP_PREFERENCES_PERSIST_INTERVAL_MS,
    now = Date.now,
    setTimeoutFn = setTimeout,
    write,
    writeTimeoutMs = MAP_PREFERENCES_PERSIST_WRITE_TIMEOUT_MS,
}) {
    let lastWrittenAt = 0;
    let hasWritten = false;
    let latestValue = null;
    let latestValueVersion = 0;
    let pendingTimeout = null;
    let pendingWriteIsRequested = false;
    let activeWritePromise = null;
    let activeWriteVersion = 0;
    let lastCompletedWriteVersion = 0;

    const clearPendingWrite = () => {
        if (pendingTimeout === null) {
            return;
        }

        clearTimeoutFn(pendingTimeout);
        pendingTimeout = null;
    };

    const startPendingWrite = () => {
        if (activeWritePromise || !pendingWriteIsRequested) {
            return activeWritePromise ?? Promise.resolve();
        }

        pendingWriteIsRequested = false;

        const value = latestValue;
        const valueVersion = latestValueVersion;
        let writeTimeoutId = null;

        activeWriteVersion = valueVersion;
        lastWrittenAt = now();
        hasWritten = true;

        const writeResult = Promise.resolve()
            .then(() => write(value))
            .then(
                () => {
                    lastCompletedWriteVersion = valueVersion;

                    if (valueVersion !== latestValueVersion) {
                        pendingWriteIsRequested = true;
                        void Promise.resolve().then(startPendingWrite);
                    }

                    return { status: 'fulfilled' };
                },
                () => ({ status: 'rejected' }),
            );
        const timeoutResult = new Promise((resolve) => {
            writeTimeoutId = setTimeoutFn(
                () => resolve({ status: 'timed-out' }),
                writeTimeoutMs,
            );
        });
        const boundedWrite = Promise.race([writeResult, timeoutResult]).finally(
            () => {
                if (writeTimeoutId !== null) {
                    clearTimeoutFn(writeTimeoutId);
                }
            },
        );

        activeWritePromise = boundedWrite.finally(() => {
            activeWritePromise = null;
            activeWriteVersion = 0;

            if (pendingWriteIsRequested) {
                void Promise.resolve().then(startPendingWrite);
            }
        });

        return activeWritePromise;
    };

    const requestLatestWrite = () => {
        if (latestValue === null) {
            return activeWritePromise ?? Promise.resolve();
        }

        if (lastCompletedWriteVersion === latestValueVersion) {
            return activeWritePromise ?? Promise.resolve();
        }

        if (
            activeWriteVersion !== latestValueVersion &&
            !pendingWriteIsRequested
        ) {
            pendingWriteIsRequested = true;
        }

        return startPendingWrite();
    };

    const writeLatestValue = () => {
        pendingTimeout = null;

        return requestLatestWrite();
    };

    const schedule = (value, { immediate = false } = {}) => {
        if (
            value === latestValue &&
            (lastCompletedWriteVersion === latestValueVersion ||
                activeWriteVersion === latestValueVersion ||
                pendingWriteIsRequested)
        ) {
            return;
        }

        if (value !== latestValue) {
            latestValue = value;
            latestValueVersion += 1;
        }

        const elapsedSinceLastWrite = Math.max(0, now() - lastWrittenAt);

        if (immediate || !hasWritten || elapsedSinceLastWrite >= intervalMs) {
            clearPendingWrite();
            void requestLatestWrite();
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
