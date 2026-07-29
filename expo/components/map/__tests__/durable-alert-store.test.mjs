import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { runAbortableOperation } from '../abortable-operation.js';
import { createDurableAlertStore } from '../durable-alert-store.js';

const EMPTY_ITEMS = Object.freeze([]);

function createDeferred() {
    let reject;
    let resolve;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        reject = rejectPromise;
        resolve = resolvePromise;
    });

    return { promise, reject, resolve };
}

function createMemoryStorage(initialValue = null) {
    let value = initialValue;
    const reads = [];
    const writes = [];

    return {
        get reads() {
            return reads;
        },
        get value() {
            return value;
        },
        get writes() {
            return writes;
        },
        async getItem(key) {
            reads.push(key);

            return value;
        },
        async setItem(key, nextValue) {
            writes.push({ key, value: nextValue });
            value = nextValue;
        },
    };
}

function createSnapshot({ fetchedAt, items, key }) {
    return JSON.stringify({
        fetchedAt,
        items,
        metadata: { key },
        version: 1,
    });
}

function createTestStore({
    fetchItems,
    now = () => 10_000,
    storage = createMemoryStorage(),
    storageTimeoutMs = 1_000,
    timeoutMs = 1_000,
} = {}) {
    return createDurableAlertStore({
        emptyItems: EMPTY_ITEMS,
        fetchItems,
        getMetadataForInput: ({ key }) => ({ key }),
        inputsAreEquivalent: (firstInput, secondInput) =>
            firstInput.key === secondInput.key,
        isFresh: (state, input, currentTime) =>
            state.fetchedAt > 0 &&
            currentTime - state.fetchedAt < 1_000 &&
            state.metadata?.key === input.key,
        normalizeInput: (input) =>
            typeof input?.key === 'string' ? { key: input.key } : null,
        normalizeItems: (items) =>
            Array.isArray(items)
                ? items.length
                    ? [...items]
                    : EMPTY_ITEMS
                : null,
        normalizeMetadata: (metadata) =>
            typeof metadata?.key === 'string' ? { key: metadata.key } : null,
        now,
        storage,
        storageKey: 'durable-alert-store-test',
        storageTimeoutMs,
        timeoutMs,
    });
}

async function waitFor(predicate, timeoutMs = 250) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1));
    }

    assert.fail('Timed out waiting for the store transition.');
}

describe('durable alert store', () => {
    test('hydrates a persisted snapshot once and notifies mounted listeners', async () => {
        const storage = createMemoryStorage(
            createSnapshot({
                fetchedAt: 9_500,
                items: ['persisted-alert'],
                key: 'current-path',
            }),
        );
        const store = createTestStore({
            fetchItems: async () => ['network-alert'],
            storage,
        });
        const notifications = [];

        store.addListener((items) => notifications.push(items));

        assert.deepEqual(await store.hydrate(), ['persisted-alert']);
        assert.deepEqual(await store.hydrate(), ['persisted-alert']);
        assert.deepEqual(store.getItems(), ['persisted-alert']);
        assert.deepEqual(notifications, [['persisted-alert']]);
        assert.equal(storage.reads.length, 1);
    });

    test('continues with a live refresh after hydration storage stalls', async () => {
        const hydration = createDeferred();
        const storage = createMemoryStorage();
        let fetchCount = 0;

        storage.getItem = async (key) => {
            storage.reads.push(key);

            return hydration.promise;
        };

        const store = createTestStore({
            fetchItems: async ({ key }) => {
                fetchCount += 1;

                return [`${key}-alert`];
            },
            storage,
            storageTimeoutMs: 5,
        });

        await store.refreshIfStale({ key: 'current-path' });

        assert.deepEqual(store.getItems(), ['current-path-alert']);
        assert.equal(storage.reads.length, 1);

        hydration.resolve(
            createSnapshot({
                fetchedAt: 9_500,
                items: ['late-old-alert'],
                key: 'old-path',
            }),
        );
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(store.getItems(), ['current-path-alert']);

        await store.refreshIfStale({ key: 'current-path' });
        assert.equal(storage.reads.length, 1);
        assert.equal(fetchCount, 1);
    });

    test('persists a successful refresh for a fresh store runtime', async () => {
        const storage = createMemoryStorage();
        const firstStore = createTestStore({
            fetchItems: async () => ['background-alert'],
            storage,
        });

        await firstStore.refreshIfStale({ key: 'current-path' });

        assert.deepEqual(firstStore.getItems(), ['background-alert']);
        assert.equal(storage.writes.length, 1);

        let coldRuntimeFetchCount = 0;
        const coldRuntimeStore = createTestStore({
            fetchItems: async () => {
                coldRuntimeFetchCount += 1;

                return ['unexpected-network-alert'];
            },
            storage,
        });

        await coldRuntimeStore.refreshIfStale({ key: 'current-path' });

        assert.deepEqual(coldRuntimeStore.getItems(), ['background-alert']);
        assert.equal(coldRuntimeFetchCount, 0);
    });

    test('keeps a successful refresh pending until durable persistence finishes', async () => {
        const persistence = createDeferred();
        const storage = createMemoryStorage();

        storage.setItem = async (key, nextValue) => {
            storage.writes.push({ key, value: nextValue });
            await persistence.promise;
        };

        const store = createTestStore({
            fetchItems: async () => ['background-alert'],
            storage,
        });
        let refreshHasSettled = false;
        const refresh = store
            .refreshIfStale({ key: 'current-path' })
            .then(() => {
                refreshHasSettled = true;
            });

        await waitFor(() => storage.writes.length === 1);
        assert.equal(refreshHasSettled, false);

        persistence.resolve();
        await refresh;

        assert.equal(refreshHasSettled, true);
    });

    test('continues to the newest input and repairs a late old storage write', async () => {
        const oldPersistence = createDeferred();
        const storage = createMemoryStorage();
        let durableValue = null;

        storage.setItem = async (key, nextValue) => {
            const writeIndex = storage.writes.length;

            storage.writes.push({ key, value: nextValue });

            if (writeIndex === 0) {
                await oldPersistence.promise;
            }

            durableValue = nextValue;
        };

        const store = createTestStore({
            fetchItems: async ({ key }) => [`${key}-alert`],
            storage,
            storageTimeoutMs: 5,
        });
        const oldRefresh = store.refreshIfStale({ key: 'old-path' });

        await waitFor(() => storage.writes.length === 1);

        const newRefresh = store.refreshIfStale({ key: 'new-path' });

        await Promise.all([oldRefresh, newRefresh]);

        assert.deepEqual(store.getItems(), ['new-path-alert']);
        assert.equal(storage.writes.length, 2);
        assert.equal(JSON.parse(durableValue).metadata.key, 'new-path');

        oldPersistence.resolve();

        await waitFor(() => storage.writes.length === 3);
        await waitFor(
            () => JSON.parse(durableValue).metadata.key === 'new-path',
        );

        assert.equal(
            JSON.parse(storage.writes[2].value).metadata.key,
            'new-path',
        );
    });

    test('supersedes an obsolete in-flight request with the newest input', async () => {
        const requests = [];
        const storage = createMemoryStorage();
        const store = createTestStore({
            fetchItems(input, signal) {
                const deferred = createDeferred();

                requests.push({ deferred, input, signal });

                return deferred.promise;
            },
            storage,
        });
        const notifications = [];

        store.addListener((items) => notifications.push(items));

        const oldRefresh = store.refreshIfStale({ key: 'old-path' });

        await waitFor(() => requests.length === 1);

        const newRefresh = store.refreshIfStale({ key: 'new-path' });

        await waitFor(() => requests[0].signal.aborted);
        requests[0].deferred.resolve(['obsolete-alert']);
        await waitFor(() => requests.length === 2);

        assert.equal(requests[1].input.key, 'new-path');

        requests[1].deferred.resolve(['current-alert']);
        await Promise.all([oldRefresh, newRefresh]);

        assert.deepEqual(store.getItems(), ['current-alert']);
        assert.deepEqual(notifications, [['current-alert']]);
        assert.equal(storage.writes.length, 1);
        assert.equal(JSON.parse(storage.value).metadata.key, 'new-path');
    });

    test('skips a transport superseded before its deferred start', async () => {
        const requests = [];
        const store = createTestStore({
            fetchItems(input, signal) {
                const deferred = createDeferred();

                requests.push({ deferred, input, signal });

                return deferred.promise;
            },
        });

        await store.hydrate();

        const obsoleteRefresh = store.refreshIfStale({ key: 'obsolete-path' });
        const currentRefresh = store.refreshIfStale({ key: 'current-path' });

        await waitFor(() => requests.length === 1);

        assert.equal(requests[0].input.key, 'current-path');
        assert.equal(requests[0].signal.aborted, false);

        requests[0].deferred.resolve(['current-alert']);
        await Promise.all([obsoleteRefresh, currentRefresh]);

        assert.deepEqual(store.getItems(), ['current-alert']);
    });

    test('waits for an aborted fetch to settle before starting the newest input', async () => {
        const requests = [];
        const storage = createMemoryStorage();
        const store = createTestStore({
            fetchItems(input, signal) {
                const deferred = createDeferred();

                requests.push({ deferred, input, signal });

                return deferred.promise;
            },
            storage,
            timeoutMs: 1_000,
        });
        const notifications = [];

        store.addListener((items) => notifications.push(items));

        const oldRefresh = store.refreshIfStale({ key: 'old-path' });

        await waitFor(() => requests.length === 1);

        const newRefresh = store.refreshIfStale({ key: 'new-path' });

        await waitFor(() => requests[0].signal.aborted);
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(requests.length, 1);
        assert.deepEqual(store.getItems(), EMPTY_ITEMS);

        requests[0].deferred.resolve(['late-obsolete-alert']);
        await waitFor(() => requests.length === 2);
        assert.equal(requests[1].input.key, 'new-path');

        requests[1].deferred.resolve(['current-alert']);
        await Promise.all([oldRefresh, newRefresh]);

        assert.deepEqual(store.getItems(), ['current-alert']);
        assert.deepEqual(notifications, [['current-alert']]);
        assert.equal(storage.writes.length, 1);
        assert.equal(JSON.parse(storage.value).metadata.key, 'new-path');
    });

    test('does not coalesce newest input with an already-aborted equivalent fetch', async () => {
        const requests = [];
        const store = createTestStore({
            fetchItems(input, signal) {
                const deferred = createDeferred();

                requests.push({ deferred, input, signal });

                return deferred.promise;
            },
            timeoutMs: 1_000,
        });
        const firstRefresh = store.refreshIfStale({ key: 'path-a' });

        await waitFor(() => requests.length === 1);

        const middleRefresh = store.refreshIfStale({ key: 'path-b' });
        const latestRefresh = store.refreshIfStale({ key: 'path-a' });

        await waitFor(() => requests[0].signal.aborted);
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(requests.length, 1);

        requests[0].deferred.resolve(['obsolete-a-alert']);
        await waitFor(() => requests.length === 2);

        assert.equal(requests[1].input.key, 'path-a');

        requests[1].deferred.resolve(['latest-a-alert']);
        await Promise.all([firstRefresh, middleRefresh, latestRefresh]);

        assert.deepEqual(store.getItems(), ['latest-a-alert']);
        assert.equal(requests.length, 2);
    });

    test('keeps only the newest request waiting behind an active fetch', async () => {
        const requests = [];
        const store = createTestStore({
            fetchItems(input) {
                const deferred = createDeferred();

                requests.push({ deferred, input });

                return deferred.promise;
            },
        });
        const firstRefresh = store.refreshIfStale({ key: 'first-path' });

        await waitFor(() => requests.length === 1);

        const discardedRefresh = store.refreshIfStale({ key: 'middle-path' });
        const latestRefresh = store.refreshIfStale({ key: 'latest-path' });

        requests[0].deferred.resolve(['obsolete-alert']);
        await waitFor(() => requests.length === 2);

        assert.equal(requests[1].input.key, 'latest-path');

        requests[1].deferred.resolve(['latest-alert']);
        await Promise.all([firstRefresh, discardedRefresh, latestRefresh]);

        assert.equal(requests.length, 2);
        assert.deepEqual(store.getItems(), ['latest-alert']);
    });

    test('retains persisted data after failure and retries after timeout', async () => {
        let fetchAttempt = 0;
        const storage = createMemoryStorage(
            createSnapshot({
                fetchedAt: 1,
                items: ['last-successful-alert'],
                key: 'old-path',
            }),
        );
        const store = createTestStore({
            fetchItems(input, signal) {
                fetchAttempt += 1;

                if (fetchAttempt === 1) {
                    return new Promise((resolve, reject) => {
                        signal.addEventListener('abort', () =>
                            reject(new Error('timed out')),
                        );
                    });
                }

                return Promise.resolve([`${input.key}-alert`]);
            },
            storage,
            timeoutMs: 5,
        });

        await store.refreshIfStale({ key: 'new-path' });

        assert.deepEqual(store.getItems(), ['last-successful-alert']);
        assert.equal(storage.writes.length, 0);

        await store.refreshIfStale({ key: 'new-path' });

        assert.deepEqual(store.getItems(), ['new-path-alert']);
        assert.equal(fetchAttempt, 2);
        assert.equal(storage.writes.length, 1);
    });

    test('recovers after native cancellation when response decoding remains pending', async () => {
        const stalledBody = createDeferred();
        const requests = [];
        const store = createTestStore({
            fetchItems(input, signal) {
                const request = {
                    input,
                    transportWasCanceled: false,
                };

                requests.push(request);

                return runAbortableOperation(() => {
                    signal.addEventListener('abort', () => {
                        request.transportWasCanceled = true;
                    });

                    return requests.length === 1
                        ? stalledBody.promise
                        : Promise.resolve([`${input.key}-alert`]);
                }, signal);
            },
            timeoutMs: 5,
        });

        await store.refreshIfStale({ key: 'current-path' });

        assert.equal(requests.length, 1);
        assert.equal(requests[0].transportWasCanceled, true);

        await store.refreshIfStale({ key: 'current-path' });

        assert.equal(requests.length, 2);
        assert.deepEqual(store.getItems(), ['current-path-alert']);
    });

    test('does not overlap a retry with a timed-out fetch that ignores abort', async () => {
        const requests = [];
        const storage = createMemoryStorage(
            createSnapshot({
                fetchedAt: 1,
                items: ['last-successful-alert'],
                key: 'old-path',
            }),
        );
        const store = createTestStore({
            fetchItems(input, signal) {
                const deferred = createDeferred();

                requests.push({ deferred, input, signal });

                return deferred.promise;
            },
            storage,
            timeoutMs: 5,
        });
        let firstRefreshSettled = false;
        const firstRefresh = store
            .refreshIfStale({ key: 'new-path' })
            .then(() => {
                firstRefreshSettled = true;
            });

        await waitFor(() => requests.length === 1);
        await waitFor(() => requests[0].signal.aborted);

        const retryRefresh = store.refreshIfStale({ key: 'new-path' });

        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(firstRefreshSettled, false);
        assert.equal(requests.length, 1);
        assert.deepEqual(store.getItems(), ['last-successful-alert']);
        assert.equal(storage.writes.length, 0);

        requests[0].deferred.resolve(['late-timed-out-alert']);
        await waitFor(() => requests.length === 2);

        assert.equal(requests[1].input.key, 'new-path');
        assert.equal(requests[1].signal.aborted, false);

        requests[1].deferred.resolve(['new-path-alert']);
        await Promise.all([firstRefresh, retryRefresh]);

        assert.deepEqual(store.getItems(), ['new-path-alert']);
        assert.equal(requests.length, 2);
        assert.equal(storage.writes.length, 1);
    });

    test('fails closed instead of spawning requests behind a hung transport', async () => {
        const requests = [];
        const store = createTestStore({
            fetchItems(input, signal) {
                requests.push({ input, signal });

                return new Promise(() => {});
            },
            timeoutMs: 5,
        });

        void store.refreshIfStale({ key: 'hung-path' });

        await waitFor(() => requests.length === 1);
        await waitFor(() => requests[0].signal.aborted);

        void store.refreshIfStale({ key: 'newest-path' });
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(requests.length, 1);
        assert.deepEqual(store.getItems(), EMPTY_ITEMS);
    });
});
