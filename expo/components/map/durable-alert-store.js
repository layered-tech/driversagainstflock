const DURABLE_ALERT_SNAPSHOT_VERSION = 1;
const MAX_PERSISTED_TIMESTAMP_FUTURE_SKEW_MS = 60 * 1000;

function getPersistedTimestamp(value, now) {
    const timestamp = Number(value);

    if (
        !Number.isFinite(timestamp) ||
        timestamp <= 0 ||
        timestamp > now + MAX_PERSISTED_TIMESTAMP_FUTURE_SKEW_MS
    ) {
        return null;
    }

    return timestamp;
}

async function settleWithinTimeout(promise, timeoutMs) {
    const settledPromise = Promise.resolve(promise).then(
        (value) => ({ status: 'fulfilled', value }),
        () => ({ status: 'rejected', value: null }),
    );
    let timeoutId = null;
    const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(
            () => resolve({ status: 'timed-out', value: null }),
            timeoutMs,
        );
    });
    const result = await Promise.race([settledPromise, timeoutPromise]);

    if (timeoutId !== null) {
        clearTimeout(timeoutId);
    }

    return result;
}

function makeAbortError() {
    const error = new Error('Request aborted.');

    error.name = 'AbortError';

    return error;
}

async function settleSingleFlightFetch(
    fetchPromise,
    abortController,
    timeoutMs,
) {
    const settledFetch = Promise.resolve(fetchPromise).then(
        (value) => ({ status: 'fulfilled', value }),
        () => ({ status: 'rejected', value: null }),
    );
    let timeoutId = null;
    let timeoutDidFire = false;
    let abortWasRequested = abortController.signal.aborted;
    const handleAbort = () => {
        abortWasRequested = true;

        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    abortController.signal.addEventListener('abort', handleAbort, {
        once: true,
    });

    if (abortController.signal.aborted) {
        handleAbort();
    } else {
        timeoutId = setTimeout(() => {
            timeoutId = null;
            timeoutDidFire = true;
            abortController.abort();
        }, timeoutMs);
    }

    // Keep the queue single-flight until the transport confirms settlement so
    // canceled native work can never overlap the next alert request.
    const result = await settledFetch;

    if (timeoutId !== null) {
        clearTimeout(timeoutId);
    }

    abortController.signal.removeEventListener('abort', handleAbort);

    if (timeoutDidFire) {
        return { status: 'timed-out', value: null };
    }

    if (abortWasRequested) {
        return { status: 'aborted', value: null };
    }

    return result;
}

export function createDurableAlertStore({
    emptyItems,
    fetchItems,
    getMetadataForInput,
    inputsAreEquivalent,
    isFresh,
    normalizeInput,
    normalizeItems,
    normalizeMetadata,
    now = Date.now,
    storage,
    storageKey,
    storageTimeoutMs,
    timeoutMs,
}) {
    let activeAbortController = null;
    let activeInput = null;
    let hydrationIsComplete = false;
    let hydrationPromise = null;
    let latestRequestedInput = null;
    let pendingInput = null;
    let persistenceRevision = 0;
    let queuePromise = null;
    let rewritePromise = null;
    let rewriteWasRequested = false;
    let state = {
        fetchedAt: 0,
        items: emptyItems,
        metadata: null,
    };
    const listeners = new Set();

    function notifyListeners() {
        listeners.forEach((listener) => {
            try {
                listener(state.items);
            } catch {
                // One unmounted or faulty consumer must not prevent persistence
                // or delivery to the remaining map surfaces.
            }
        });
    }

    function applySnapshot(snapshot) {
        state = snapshot;
        notifyListeners();
    }

    async function hydrate() {
        if (hydrationIsComplete) {
            return state.items;
        }

        if (!hydrationPromise) {
            const currentHydrationPromise = (async () => {
                try {
                    const storageResult = await settleWithinTimeout(
                        Promise.resolve().then(() =>
                            storage.getItem(storageKey),
                        ),
                        storageTimeoutMs,
                    );

                    if (storageResult.status !== 'fulfilled') {
                        return state.items;
                    }

                    const storedValue = storageResult.value;
                    const parsedSnapshot = storedValue
                        ? JSON.parse(storedValue)
                        : null;
                    const fetchedAt = getPersistedTimestamp(
                        parsedSnapshot?.fetchedAt,
                        now(),
                    );
                    const items = normalizeItems(parsedSnapshot?.items);
                    const metadata = normalizeMetadata(
                        parsedSnapshot?.metadata,
                    );

                    if (
                        parsedSnapshot?.version !==
                            DURABLE_ALERT_SNAPSHOT_VERSION ||
                        fetchedAt === null ||
                        items === null ||
                        metadata === null ||
                        fetchedAt < state.fetchedAt
                    ) {
                        return state.items;
                    }

                    applySnapshot({ fetchedAt, items, metadata });
                } catch {
                    // A corrupt or unavailable cache must never block a live
                    // refresh. Existing in-memory data remains authoritative.
                }

                return state.items;
            })().finally(() => {
                hydrationIsComplete = true;

                if (hydrationPromise === currentHydrationPromise) {
                    hydrationPromise = null;
                }
            });

            hydrationPromise = currentHydrationPromise;
        }

        return hydrationPromise;
    }

    let latestPersistence = null;

    function scheduleLatestPersistenceRewrite() {
        rewriteWasRequested = true;

        if (rewritePromise) {
            return;
        }

        const currentRewritePromise = (async () => {
            while (rewriteWasRequested) {
                rewriteWasRequested = false;

                if (latestPersistence) {
                    await writePersistence(latestPersistence);
                }
            }
        })().finally(() => {
            if (rewritePromise === currentRewritePromise) {
                rewritePromise = null;

                if (rewriteWasRequested) {
                    scheduleLatestPersistenceRewrite();
                }
            }
        });

        rewritePromise = currentRewritePromise;
    }

    async function writePersistence(persistence) {
        const storagePromise = Promise.resolve().then(() =>
            storage.setItem(storageKey, persistence.serializedSnapshot),
        );

        void storagePromise
            .then(() => {
                // A native write that exceeded our wait budget can finish after
                // a newer write. Repair it only after that stale write settles.
                if (persistence.revision !== latestPersistence?.revision) {
                    scheduleLatestPersistenceRewrite();
                }
            })
            .catch(() => {});

        await settleWithinTimeout(storagePromise, storageTimeoutMs);
    }

    async function persistSnapshot(snapshot) {
        const persistence = {
            revision: persistenceRevision + 1,
            serializedSnapshot: JSON.stringify({
                ...snapshot,
                version: DURABLE_ALERT_SNAPSHOT_VERSION,
            }),
        };

        persistenceRevision = persistence.revision;
        latestPersistence = persistence;

        await writePersistence(persistence);
    }

    async function drainRefreshQueue() {
        while (pendingInput) {
            const input = pendingInput;

            pendingInput = null;

            if (isFresh(state, input, now())) {
                continue;
            }

            const abortController = new AbortController();

            activeAbortController = abortController;
            activeInput = input;

            try {
                const fetchResult = await settleSingleFlightFetch(
                    Promise.resolve().then(() => {
                        if (abortController.signal.aborted) {
                            throw makeAbortError();
                        }

                        return fetchItems(input, abortController.signal);
                    }),
                    abortController,
                    timeoutMs,
                );

                if (fetchResult.status !== 'fulfilled') {
                    continue;
                }

                const fetchedItems = normalizeItems(fetchResult.value);

                if (
                    fetchedItems === null ||
                    !latestRequestedInput ||
                    !inputsAreEquivalent(input, latestRequestedInput)
                ) {
                    continue;
                }

                const snapshot = {
                    fetchedAt: now(),
                    items: fetchedItems,
                    metadata: getMetadataForInput(input),
                };

                applySnapshot(snapshot);
                await persistSnapshot(snapshot);
            } catch {
                // Keep the last successful snapshot visible and retryable.
            } finally {
                activeAbortController = null;
                activeInput = null;
            }
        }
    }

    function startRefreshQueue() {
        if (queuePromise) {
            return queuePromise;
        }

        const currentQueuePromise = drainRefreshQueue().finally(() => {
            if (queuePromise === currentQueuePromise) {
                queuePromise = null;

                if (pendingInput) {
                    return startRefreshQueue();
                }
            }
        });

        queuePromise = currentQueuePromise;

        return queuePromise;
    }

    function enqueueRefresh(input) {
        latestRequestedInput = input;

        if (isFresh(state, input, now())) {
            pendingInput = null;

            if (
                activeInput &&
                !inputsAreEquivalent(activeInput, latestRequestedInput)
            ) {
                activeAbortController?.abort();
            }

            return queuePromise;
        }

        if (
            activeInput &&
            activeAbortController?.signal.aborted !== true &&
            inputsAreEquivalent(activeInput, input)
        ) {
            pendingInput = null;

            return queuePromise;
        }

        pendingInput = input;

        if (activeInput) {
            activeAbortController?.abort();
        }

        return startRefreshQueue();
    }

    function refreshIfStale(rawInput) {
        const input = normalizeInput(rawInput);

        if (!input) {
            return null;
        }

        if (hydrationIsComplete) {
            return enqueueRefresh(input);
        }

        return hydrate().then(() => enqueueRefresh(input));
    }

    return {
        addListener(listener) {
            listeners.add(listener);

            return {
                remove() {
                    listeners.delete(listener);
                },
            };
        },
        getItems() {
            return state.items;
        },
        getSnapshot() {
            return state;
        },
        invalidate() {
            state = {
                fetchedAt: 0,
                items: emptyItems,
                metadata: null,
            };
            notifyListeners();
        },
        hydrate,
        needsRefresh(rawInput) {
            const input = normalizeInput(rawInput);

            if (!input) {
                return false;
            }

            return !hydrationIsComplete || !isFresh(state, input, now());
        },
        refreshIfStale,
    };
}
