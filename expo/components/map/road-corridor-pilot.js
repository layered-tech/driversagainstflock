import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { gunzipSync, strFromU8 } from 'fflate';
import bundledCatalog from '../../assets/map/wisconsin-corridor.json';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    corridorCacheDeletions,
    corridorCatalogIdentity,
    corridorRegion,
    createCorridorReleaseManager,
} from './road-corridor-releases';
import { getRoadCorridor, normalizeRoadCorridorWay } from './api';
import { buildApiURL } from './config';
import { createDirectedRoadGraph } from './road-graph';
import { reportCorridorFailure } from './road-corridor-diagnostics';
import {
    loadPilotCorridor,
    selectCorridorTiles,
} from './road-corridor-pilot-core';

async function verifiedRecords(file, tile) {
    const bytes = await file.bytes();
    if (bytes.length !== tile.size_bytes)
        throw new Error('Tile checksum failed');
    const digest = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        bytes,
    );
    const hex = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
    if (hex !== tile.sha256) throw new Error('Tile checksum failed');
    const uncompressed = gunzipSync(bytes);
    if (uncompressed.length !== tile.uncompressed_size_bytes)
        throw new Error('Tile validation failed');
    const records = strFromU8(uncompressed)
        .trimEnd()
        .split('\n')
        .map(JSON.parse);
    if (
        records.length !== tile.record_count ||
        records.some((record) => !normalizeRoadCorridorWay(record))
    )
        throw new Error('Tile validation failed');
    return records;
}

const tileJobs = new Map();
const queuedDownloads = [];
let activeDownloads = 0;
let cacheRevision = 0;
let lastOptions;
export const getPilotCacheRevision = () => {
    if (lastOptions) void releaseManager.refresh(lastOptions);
    return cacheRevision + releaseManager.getRevision();
};

function tileEvent(tile, event) {
    if (typeof __DEV__ !== 'undefined' && __DEV__)
        console.log(`[road-corridor ${tile.id}] ${event}`);
}

async function downloadSlot() {
    if (activeDownloads >= 2)
        await new Promise((resolve) => queuedDownloads.push(resolve));
    else activeDownloads++;
    return () => {
        const next = queuedDownloads.shift();
        if (next) next();
        else activeDownloads--;
    };
}

function ensureTile(catalog, tile, onMissing = () => {}) {
    const jobKey = `${catalog.release}:${tile.sha256}`;
    if (tileJobs.has(jobKey)) {
        onMissing();
        return tileJobs.get(jobKey);
    }
    const job = (async () => {
        const directory = new Directory(
            Paths.document,
            'road-corridors',
            catalog.release,
        );
        directory.create({ intermediates: true, idempotent: true });
        const file = new File(directory, `${tile.id}-${tile.sha256}.gz`);
        if (file.exists) {
            try {
                return await verifiedRecords(file, tile);
            } catch (error) {
                reportCorridorFailure('cached_tile', error, {
                    release: catalog.release,
                    tileSha256: tile.sha256,
                    compressedBytes: tile.size_bytes,
                });
                file.delete();
                tileEvent(tile, 'CACHE_INVALID');
            }
        }
        onMissing();
        const releaseSlot = await downloadSlot();
        const startedAt = Date.now();
        let httpStatus;
        const controller = new AbortController();
        const timeoutError = Object.assign(
            new Error('Tile download timed out'),
            { name: 'TimeoutError' },
        );
        const timeout = setTimeout(() => controller.abort(timeoutError), 60000);
        const pending = new File(
            directory,
            `${tile.id}-${tile.sha256}.partial`,
        );
        try {
            tileEvent(tile, 'DOWNLOAD_STARTED');
            const signed = await fetch(
                buildApiURL(
                    `${catalog.region ? 'v2' : 'v1'}/road-corridor-tiles/${tile.key.split('/').at(-1)}`,
                    {
                        release: catalog.release,
                        ...(catalog.region ? { region: catalog.region } : {}),
                    },
                ),
                { signal: controller.signal },
            );
            httpStatus = signed.status;
            if (!signed.ok)
                throw new Error('Tile download service unavailable');
            const { url } = await signed.json();
            if (typeof url !== 'string' || !url.startsWith('https://'))
                throw new Error('Invalid tile download URL');
            const response = await fetch(url, { signal: controller.signal });
            httpStatus = response.status;
            if (!response.ok) throw new Error('Tile download failed');
            const bytes = new Uint8Array(await response.arrayBuffer());
            // The complete body is now local. Verification and persistence must finish
            // even if the requesting matcher has moved on or been cancelled.
            clearTimeout(timeout);
            tileEvent(tile, 'DOWNLOAD_COMPLETE');
            await pending.write(bytes);
            const records = await verifiedRecords(pending, tile);
            if (records.length !== tile.record_count)
                throw new Error('Tile validation failed');
            await pending.move(file);
            cacheRevision++;
            tileEvent(tile, 'SAVED_OFFLINE');
            return records;
        } catch (error) {
            reportCorridorFailure(
                'tile_download',
                controller.signal.aborted ? timeoutError : error,
                {
                    release: catalog.release,
                    tileSha256: tile.sha256,
                    compressedBytes: tile.size_bytes,
                    httpStatus,
                    elapsedMs: Date.now() - startedAt,
                    fallback: 'existing_service',
                },
            );
            tileEvent(
                tile,
                controller.signal.aborted
                    ? 'DOWNLOAD_TIMEOUT'
                    : 'DOWNLOAD_FAILED',
            );
            throw error;
        } finally {
            clearTimeout(timeout);
            try {
                if (pending.exists && pending.uri !== file.uri)
                    pending.delete();
            } finally {
                releaseSlot();
            }
        }
    })();
    tileJobs.set(jobKey, job);
    job.finally(() => tileJobs.delete(jobKey)).catch(() => {});
    return job;
}

const storagePrefix = `road-corridor-releases.v1.${buildApiURL('v1/road-corridor-manifest')}`;
const catalogKey = (release) => `${storagePrefix}.catalog.${release}`;
async function readSavedCatalog(release) {
    try {
        return JSON.parse(await AsyncStorage.getItem(catalogKey(release)));
    } catch {
        return null;
    }
}
let manifestEtag, lastManifest, manifestRegion;
const releaseManager = createCorridorReleaseManager({
    bundled: { schema_version: 1, ...bundledCatalog },
    onError: reportCorridorFailure,
    read: async () => {
        const pointer = JSON.parse(
            (await AsyncStorage.getItem(storagePrefix)) ?? 'null',
        );
        if (!pointer) return null;
        return {
            ...pointer,
            active: await readSavedCatalog(pointer.active),
            previous: pointer.previous
                ? await readSavedCatalog(pointer.previous)
                : null,
        };
    },
    write: async (state) => {
        await AsyncStorage.setItem(
            catalogKey(corridorCatalogIdentity(state.active)),
            JSON.stringify(state.active),
        );
        if (state.previous)
            await AsyncStorage.setItem(
                catalogKey(corridorCatalogIdentity(state.previous)),
                JSON.stringify(state.previous),
            );
        await AsyncStorage.setItem(
            storagePrefix,
            JSON.stringify({
                ...state,
                active: corridorCatalogIdentity(state.active),
                previous: state.previous
                    ? corridorCatalogIdentity(state.previous)
                    : null,
            }),
        );
    },
    fetchControl: async (options) => {
        const region = corridorRegion(options.location);
        if (region !== manifestRegion) {
            manifestEtag = undefined;
            lastManifest = undefined;
            manifestRegion = region;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            let response = await fetch(
                buildApiURL('v2/road-corridor-manifest', { region }),
                {
                    signal: controller.signal,
                    headers: manifestEtag
                        ? { 'If-None-Match': manifestEtag }
                        : {},
                },
            );
            if (response.status === 404) {
                response = await fetch(
                    buildApiURL('v1/road-corridor-manifest'),
                    {
                        signal: controller.signal,
                    },
                );
            }
            if (response.status === 304 && lastManifest) return lastManifest;
            if (!response.ok)
                throw new Error(
                    'Manifest unavailable; retaining current roads',
                );
            const control = await response.json();
            manifestEtag = response.headers?.get('etag');
            lastManifest = control;
            return control;
        } finally {
            clearTimeout(timeout);
        }
    },
    prepare: async (catalog, options) => {
        const ways = await loadPilotCorridor({
            ...options,
            signal: undefined,
            catalog,
            normalize: normalizeRoadCorridorWay,
            loadTile: (tile) => ensureTile(catalog, tile),
            service: () => {
                throw new Error(
                    'Replacement tiles unavailable; retaining current release',
                );
            },
        });
        if (!createDirectedRoadGraph(ways).edges.length)
            throw new Error('Replacement graph contains no roads');
    },
    cleanup: async (state, options) => {
        const retained = [state.active, state.previous].filter(Boolean);
        const protectedPaths = new Set();
        const root = new Directory(Paths.document, 'road-corridors');
        if (!root.exists) return;
        for (const catalog of retained) {
            try {
                for (const tile of selectCorridorTiles(
                    catalog,
                    options?.location,
                    options?.radiusMeters,
                )) {
                    protectedPaths.add(
                        new File(
                            new Directory(root, catalog.release),
                            `${tile.id}-${tile.sha256}.gz`,
                        ).uri,
                    );
                }
            } catch {}
        }
        const entries = [];
        const filesByPath = new Map();
        for (const directory of root.list()) {
            if (!(directory instanceof Directory)) continue;
            for (const file of directory.list()) {
                if (!(file instanceof File)) continue;
                const release = directory.name;
                const hash = file.name.match(
                    /-([a-f0-9]{64})\.(?:gz|partial)$/,
                )?.[1];
                if (hash && tileJobs.has(`${release}:${hash}`))
                    protectedPaths.add(file.uri);
                entries.push({
                    path: file.uri,
                    release,
                    size: file.size ?? 0,
                    modifiedAt: file.modificationTime ?? 0,
                    partial: file.name.endsWith('.partial'),
                });
                filesByPath.set(file.uri, file);
            }
        }
        for (const path of corridorCacheDeletions(entries, {
            retainedReleases: new Set(retained.map((c) => c.release)),
            protectedPaths,
        })) {
            filesByPath.get(path).delete();
        }
        for (const directory of root.list()) {
            if (
                directory instanceof Directory &&
                directory.list().length === 0 &&
                !retained.some((c) => c.release === directory.name)
            )
                directory.delete();
        }
        const keep = new Set(
            retained.map((c) => catalogKey(corridorCatalogIdentity(c))),
        );
        const obsolete = (await AsyncStorage.getAllKeys()).filter(
            (key) =>
                key.startsWith(`${storagePrefix}.catalog.`) && !keep.has(key),
        );
        if (obsolete.length) await AsyncStorage.multiRemove(obsolete);
    },
});
export const subscribeCorridorRelease = releaseManager.subscribe;
export const getCorridorRelease = releaseManager.getSnapshot;
export const setCorridorServiceOnly = releaseManager.setForceService;
export const initializeCorridorReleases = releaseManager.ready;

export async function getPilotRoadCorridor(options) {
    lastOptions = {
        location: options.location,
        radiusMeters: options.radiusMeters,
    };
    await releaseManager.ready();
    void releaseManager.refresh(lastOptions);
    const state = releaseManager.getState();
    const catalog = state.active;
    const releaseRevision = releaseManager.getRevision();
    if (state.forceService || !state.enabled) {
        const result = await getRoadCorridor(options);
        Object.defineProperty(result, 'corridorSource', {
            value: {
                source: 'service',
                reason: state.forceService
                    ? 'Existing service selected in debug menu'
                    : 'Downloads disabled by server',
            },
        });
        return result;
    }
    const serviceController = new AbortController();
    let serviceRequest;
    let finished = false;
    const startService = () => {
        if (!serviceRequest) {
            serviceRequest = getRoadCorridor({
                ...options,
                signal: serviceController.signal,
            });
            serviceRequest.catch(() => {});
        }
        return serviceRequest;
    };
    let rejectWait;
    const waitDeadline = new Promise((_, reject) => {
        rejectWait = reject;
    });
    waitDeadline.catch(() => {});
    const cancel = () => {
        serviceController.abort(options.signal?.reason);
        rejectWait(
            Object.assign(new Error('Request cancelled'), {
                name: 'AbortError',
            }),
        );
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) {
        cancel();
        options.signal?.removeEventListener('abort', cancel);
        throw Object.assign(new Error('Request cancelled'), {
            name: 'AbortError',
        });
    }
    const timeout = setTimeout(
        () => rejectWait(new Error('Tiles downloading in background')),
        5000,
    );
    try {
        let tiles = [];
        try {
            tiles = selectCorridorTiles(
                catalog,
                options.location,
                options.radiusMeters,
            );
        } catch {}
        const jobs = new Map(
            tiles.map((tile) => [
                tile.id,
                ensureTile(catalog, tile, () => {
                    if (!finished && !options.signal?.aborted) startService();
                }),
            ]),
        );
        const ways = await loadPilotCorridor({
            ...options,
            catalog,
            normalize: normalizeRoadCorridorWay,
            service: () => startService(),
            loadTile: (tile) => Promise.race([jobs.get(tile.id), waitDeadline]),
        });
        const latestState = releaseManager.getState();
        if (latestState.forceService || !latestState.enabled)
            return await getPilotRoadCorridor(options);
        Object.defineProperty(ways, 'corridorCacheRevision', {
            value: cacheRevision + releaseRevision,
        });
        return ways;
    } finally {
        finished = true;
        clearTimeout(timeout);
        serviceController.abort(
            Object.assign(new Error('Corridor request completed'), {
                name: 'AbortError',
            }),
        );
        options.signal?.removeEventListener('abort', cancel);
    }
}
