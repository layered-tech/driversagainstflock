import { markerRequestBoundsContainCameraBounds } from './marker-load-bounds.js';

export const MARKER_CACHE_FRESH_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 8;
const MAX_CHARACTERS = 500000;

// Cache completed areas, never a shared viewport or a shared abort controller.
export function createMarkerCache({ read, write, now = Date.now }) {
    let entries = [];
    let hydration;
    let revision = 0;
    let writes = Promise.resolve();
    const valid = (entry) =>
        entry?.bounds &&
        Array.isArray(entry.points) &&
        Number.isFinite(entry.loadedAt) &&
        entry.loadedAt <= now() &&
        now() - entry.loadedAt < MAX_AGE_MS;
    const trim = () => {
        entries = entries.filter(valid).slice(0, MAX_ENTRIES);
        while (
            entries.length &&
            JSON.stringify(entries).length > MAX_CHARACTERS
        ) {
            entries.pop();
        }
    };
    return {
        hydrate() {
            const startedAtRevision = revision;
            hydration ??= Promise.resolve()
                .then(read)
                .then((value) => {
                    if (revision !== startedAtRevision) return;
                    const stored = JSON.parse(value ?? '[]');
                    entries = Array.isArray(stored) ? stored.filter(valid) : [];
                    trim();
                })
                .catch(() => {});
            return hydration;
        },
        find(bounds) {
            entries = entries.filter(valid);
            return (
                entries.find((entry) =>
                    markerRequestBoundsContainCameraBounds(
                        entry.bounds,
                        bounds,
                    ),
                ) ?? null
            );
        },
        clear() {
            revision++;
            entries = [];
            writes = writes.then(() => write('[]')).catch(() => {});
            return writes;
        },
        put(entry) {
            revision++;
            entries = entries.filter(
                (cached) =>
                    JSON.stringify(cached.bounds) !==
                    JSON.stringify(entry.bounds),
            );
            if (JSON.stringify(entry).length <= MAX_CHARACTERS)
                entries.unshift(entry);
            trim();
            const serialized = JSON.stringify(entries);
            writes = writes.then(() => write(serialized)).catch(() => {});
            return writes;
        },
    };
}
