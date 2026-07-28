export const SHARED_ROUTING_STATE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const SHARED_ROUTING_STATE_STORAGE_VERSION = 1;

const MAX_FUTURE_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_PERSISTED_STATE_READ_TIMEOUT_MS = 1000;
const DEFAULT_PERSISTED_STATE_READ_RETRY_DELAY_MS = 1000;
const MAX_PERSISTED_STATE_READ_RETRY_DELAY_MS = 30 * 1000;

async function settleReadWithinTimeout(readResult, timeoutMs) {
    let timeoutId = null;
    const timeoutResult = new Promise((resolve) => {
        timeoutId = setTimeout(
            () => resolve({ status: 'timed-out', value: null }),
            timeoutMs,
        );
    });
    const result = await Promise.race([readResult, timeoutResult]);

    if (timeoutId !== null) {
        clearTimeout(timeoutId);
    }

    return result;
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPersistedRoutingState(envelope, now, maximumAgeMs) {
    if (
        !isRecord(envelope) ||
        envelope.version !== SHARED_ROUTING_STATE_STORAGE_VERSION ||
        !Number.isFinite(envelope.persistedAt) ||
        !isRecord(envelope.state)
    ) {
        return null;
    }

    const ageMs = now - envelope.persistedAt;

    if (ageMs > maximumAgeMs || ageMs < -MAX_FUTURE_TIMESTAMP_SKEW_MS) {
        return null;
    }

    const { directionsRoute, drivingModeIsActive } = envelope.state;

    if (
        (directionsRoute !== null && !isRecord(directionsRoute)) ||
        (drivingModeIsActive !== true && drivingModeIsActive !== false)
    ) {
        return null;
    }

    return {
        directionsRoute,
        drivingModeIsActive,
    };
}

export function serializePersistedSharedRoutingState(state, persistedAt) {
    if (!Number.isFinite(persistedAt)) {
        return null;
    }

    try {
        return JSON.stringify({
            persistedAt,
            state,
            version: SHARED_ROUTING_STATE_STORAGE_VERSION,
        });
    } catch {
        return null;
    }
}

export function parsePersistedSharedRoutingState(
    value,
    { maximumAgeMs = SHARED_ROUTING_STATE_MAX_AGE_MS, now = Date.now() } = {},
) {
    if (typeof value !== 'string' || !value) {
        return null;
    }

    try {
        return getPersistedRoutingState(JSON.parse(value), now, maximumAgeMs);
    } catch {
        return null;
    }
}

export function createBackgroundRoutingStateResolver({
    getLiveState,
    hasLiveState,
    now = Date.now,
    readRetryDelayMs = DEFAULT_PERSISTED_STATE_READ_RETRY_DELAY_MS,
    readTimeoutMs = DEFAULT_PERSISTED_STATE_READ_TIMEOUT_MS,
    readPersistedState,
}) {
    let consecutiveReadFailureCount = 0;
    let nextReadAttemptAt = 0;
    let persistedStateReadAttempt = null;
    let persistedStateReadHasCompleted = false;
    let persistedStateReadPromise = null;
    let serializedPersistedState = null;

    function delayNextReadAttempt() {
        consecutiveReadFailureCount += 1;
        nextReadAttemptAt =
            now() +
            Math.min(
                MAX_PERSISTED_STATE_READ_RETRY_DELAY_MS,
                readRetryDelayMs * 2 ** (consecutiveReadFailureCount - 1),
            );
    }

    async function readPersistedStateOnce() {
        if (persistedStateReadHasCompleted) {
            return serializedPersistedState;
        }

        if (persistedStateReadPromise) {
            return persistedStateReadPromise;
        }

        if (persistedStateReadAttempt || now() < nextReadAttemptAt) {
            return null;
        }

        if (!persistedStateReadPromise) {
            const readAttempt = Promise.resolve()
                .then(readPersistedState)
                .then(
                    (value) => ({ status: 'fulfilled', value }),
                    () => ({ status: 'rejected', value: null }),
                );

            persistedStateReadAttempt = readAttempt;
            void readAttempt.then(() => {
                if (persistedStateReadAttempt === readAttempt) {
                    persistedStateReadAttempt = null;
                }
            });
            persistedStateReadPromise = settleReadWithinTimeout(
                readAttempt,
                readTimeoutMs,
            )
                .then((result) => {
                    if (result.status !== 'fulfilled') {
                        delayNextReadAttempt();

                        return null;
                    }

                    serializedPersistedState = result.value;
                    persistedStateReadHasCompleted = true;
                    consecutiveReadFailureCount = 0;

                    return result.value;
                })
                .finally(() => {
                    persistedStateReadPromise = null;
                });
        }

        return persistedStateReadPromise;
    }

    return async function resolveBackgroundRoutingState() {
        if (hasLiveState()) {
            return getLiveState();
        }

        const storedValue = await readPersistedStateOnce();

        if (hasLiveState()) {
            return getLiveState();
        }

        return parsePersistedSharedRoutingState(storedValue, { now: now() });
    };
}
