import {
    WATCH_PROGRESS_INTERVAL_MS,
    watchSnapshotStateKey,
} from './watch-contract.js';

export function createWatchPublisher({
    readSnapshot,
    publish,
    now = Date.now,
    schedule = setTimeout,
    cancel = clearTimeout,
    onError = () => {},
}) {
    let revision = 0;
    let lastPublishedAt = -Infinity;
    let lastStateKey = null;
    let timer = null;
    let stopped = false;
    let queue = Promise.resolve();
    function update({ force = false } = {}) {
        if (stopped) return;
        const snapshot = readSnapshot(++revision);
        const key = watchSnapshotStateKey(snapshot);
        const wait = WATCH_PROGRESS_INTERVAL_MS - (now() - lastPublishedAt);
        if (!force && key === lastStateKey && wait > 0) {
            if (timer === null)
                timer = schedule(() => {
                    timer = null;
                    update();
                }, wait);
            return;
        }
        if (timer !== null) cancel(timer);
        timer = null;
        lastPublishedAt = now();
        lastStateKey = key;
        queue = queue
            .then(() => (stopped ? undefined : publish(snapshot)))
            .catch(() => {
                lastStateKey = null;
                onError('publish-failed');
            });
    }
    return {
        update,
        flush: () => queue,
        stop() {
            stopped = true;
            if (timer !== null) cancel(timer);
        },
    };
}
