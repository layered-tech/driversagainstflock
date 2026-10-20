import { selectCorridorTiles } from './road-corridor-pilot-core.js';

export const CORRIDOR_UPDATE_INTERVAL_MS = 60000;
export const CORRIDOR_CACHE_MAX_BYTES = 256 * 1024 * 1024;

export function validateCorridorCatalog(catalog) {
    if (
        catalog?.schema_version !== 1 ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(catalog?.release ?? '') ||
        !Array.isArray(catalog.coverage) ||
        !catalog.coverage.length ||
        !Array.isArray(catalog.tiles) ||
        !catalog.tiles.length ||
        JSON.stringify(catalog).length > 900000
    )
        throw new Error('Unsupported corridor manifest');
    for (const polygon of catalog.coverage) {
        if (!Array.isArray(polygon) || !polygon.length)
            throw new Error('Invalid coverage');
        for (const ring of polygon) {
            if (
                !Array.isArray(ring) ||
                ring.length < 4 ||
                ring.some(
                    (point) =>
                        !Array.isArray(point) ||
                        point.length !== 2 ||
                        !point.every(Number.isFinite) ||
                        Math.abs(point[0]) > 180 ||
                        Math.abs(point[1]) > 90,
                ) ||
                JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))
            )
                throw new Error('Invalid coverage');
        }
    }
    const ids = new Set();
    for (const tile of catalog.tiles) {
        if (
            !/^-?\d{1,4}_-?\d{1,4}$/.test(tile.id) ||
            ids.has(tile.id) ||
            !/^[a-f0-9]{64}$/.test(tile.sha256) ||
            tile.key !== `tiles/${tile.id}-${tile.sha256}.jsonl.gz` ||
            ![
                tile.size_bytes,
                tile.uncompressed_size_bytes,
                tile.record_count,
            ].every((value) => Number.isSafeInteger(value) && value > 0) ||
            tile.size_bytes > 20 * 1024 * 1024 ||
            tile.uncompressed_size_bytes > 100 * 1024 * 1024
        )
            throw new Error('Invalid corridor tile');
        ids.add(tile.id);
    }
    return catalog;
}

export function corridorCacheDeletions(
    entries,
    {
        retainedReleases,
        protectedPaths = new Set(),
        maximumBytes = CORRIDOR_CACHE_MAX_BYTES,
    },
) {
    const remove = new Set();
    let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries) {
        if (
            !protectedPaths.has(entry.path) &&
            (!retainedReleases.has(entry.release) || entry.partial)
        ) {
            remove.add(entry.path);
            bytes -= entry.size;
        }
    }
    for (const entry of [...entries].sort(
        (a, b) => a.modifiedAt - b.modifiedAt,
    )) {
        if (bytes <= maximumBytes) break;
        if (remove.has(entry.path) || protectedPaths.has(entry.path)) continue;
        remove.add(entry.path);
        bytes -= entry.size;
    }
    return [...remove];
}

export function createCorridorReleaseManager({
    bundled,
    read,
    write,
    fetchControl,
    prepare,
    cleanup = async () => {},
    onError = () => {},
    now = Date.now,
}) {
    let state = {
        active: bundled,
        previous: null,
        forceService: false,
        enabled: true,
    };
    let snapshot = {
        release: bundled.release,
        previousRelease: null,
        forceService: false,
        enabled: true,
        error: null,
    };
    let revision = 0,
        nextCheck = 0,
        pending,
        hydration;
    let locationOptions;
    let writes = Promise.resolve();
    const listeners = new Set();
    const report = (stage, error) => {
        try {
            onError(stage, error, {
                release: state.active.release,
                fallback:
                    state.forceService || !state.enabled
                        ? 'existing_service'
                        : 'retained_release',
            });
        } catch {}
    };
    const publish = (error = null) => {
        snapshot = {
            release: state.active.release,
            previousRelease: state.previous?.release ?? null,
            forceService: state.forceService,
            enabled: state.enabled,
            error,
        };
        listeners.forEach((listener) => listener());
    };
    const persist = (value) => {
        const job = writes.then(() => write(value));
        writes = job.catch(() => {});
        return job;
    };
    const ready = () => {
        hydration ??= Promise.resolve()
            .then(read)
            .then((saved) => {
                if (!saved) return;
                let active,
                    previous = null,
                    error = null;
                try {
                    active = validateCorridorCatalog(saved.active);
                } catch {
                    error =
                        'Saved release invalid; restored previous or bundled roads';
                }
                try {
                    if (saved.previous)
                        previous = validateCorridorCatalog(saved.previous);
                } catch {
                    error = 'Previous release metadata invalid';
                }
                state = {
                    active: active ?? previous ?? bundled,
                    previous: active ? previous : null,
                    forceService: saved.forceService === true,
                    enabled: saved.enabled !== false,
                };
                revision++;
                if (error) report('metadata_restore', new Error(error));
                publish(error);
            })
            .catch((error) => {
                report('metadata_restore', error);
                publish('Saved release unavailable; using bundled roads');
            });
        return hydration;
    };
    const clean = () =>
        cleanup(state, locationOptions).catch((error) => {
            report('cache_cleanup', error);
            publish('Cache cleanup will retry');
        });
    const refresh = (options) => {
        if (options) locationOptions = options;
        if (pending) return pending;
        if (!locationOptions || now() < nextCheck) return Promise.resolve();
        nextCheck = now() + CORRIDOR_UPDATE_INTERVAL_MS;
        pending = (async () => {
            await ready();
            const control = await fetchControl();
            if (typeof control?.enabled !== 'boolean')
                throw new Error('Invalid corridor control');
            if (state.enabled !== control.enabled) {
                state = { ...state, enabled: control.enabled };
                revision++;
                publish();
                await persist(state);
            }
            if (!state.enabled || state.forceService) return;
            const candidate = validateCorridorCatalog(control.catalog);
            if (candidate.release === state.active.release) {
                if (JSON.stringify(candidate) !== JSON.stringify(state.active))
                    throw new Error('Published release changed');
                publish();
                return;
            }
            const optionsAtStart = locationOptions;
            // Every required tile must pass the same normalization/graph input checks.
            const preparedTiles = new Set(
                selectCorridorTiles(
                    candidate,
                    optionsAtStart.location,
                    optionsAtStart.radiusMeters,
                ).map((tile) => tile.id),
            );
            await prepare(candidate, optionsAtStart);
            if (state.forceService || !state.enabled) return;
            if (
                selectCorridorTiles(
                    candidate,
                    locationOptions.location,
                    locationOptions.radiusMeters,
                ).some((tile) => !preparedTiles.has(tile.id))
            ) {
                throw new Error(
                    'Location changed during update; retaining current release',
                );
            }
            const next = {
                ...state,
                previous: state.active,
                active: candidate,
            };
            const policyRevision = revision;
            await persist(next);
            // A local rollback wins even if selected during the atomic pointer write.
            if (revision !== policyRevision) {
                await persist(state);
                return;
            }
            state = next;
            revision++;
            publish();
        })()
            .catch((error) => {
                if (
                    !/Outside Wisconsin extract|Near extract boundary|Location changed during update/.test(
                        error.message ?? '',
                    )
                )
                    report('release_update', error);
                publish(
                    error.message ||
                        'Update unavailable; retaining current roads',
                );
            })
            .finally(async () => {
                await clean();
                pending = null;
            });
        return pending;
    };
    return {
        ready,
        refresh,
        getState: () => state,
        getSnapshot: () => snapshot,
        getRevision: () => revision,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async setForceService(value) {
            await ready();
            state = { ...state, forceService: Boolean(value) };
            revision++;
            publish();
            try {
                await persist(state);
            } catch (error) {
                report('rollback_preference', error);
                publish('Could not save rollback preference');
            }
            nextCheck = 0;
        },
        cleanup: clean,
    };
}
