import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { gunzipSync, strFromU8 } from 'fflate';
import catalog from '../../assets/map/wisconsin-corridor.json';
import { getRoadCorridor, normalizeRoadCorridorWay } from './api';
import { buildApiURL } from './config';
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
    return strFromU8(uncompressed).trimEnd().split('\n').map(JSON.parse);
}

const tileJobs = new Map();
const queuedDownloads = [];
let activeDownloads = 0;
let cacheRevision = 0;
export const getPilotCacheRevision = () => cacheRevision;

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

function ensureTile(tile, onMissing) {
    if (tileJobs.has(tile.sha256)) {
        onMissing();
        return tileJobs.get(tile.sha256);
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
            } catch {
                file.delete();
                tileEvent(tile, 'CACHE_INVALID');
            }
        }
        onMissing();
        const releaseSlot = await downloadSlot();
        const controller = new AbortController();
        const timeoutError = Object.assign(
            new Error('Tile download timed out'),
            { name: 'TimeoutError' },
        );
        const timeout = setTimeout(() => controller.abort(timeoutError), 60000);
        const pending = new File(directory, `${tile.id}.partial`);
        try {
            tileEvent(tile, 'DOWNLOAD_STARTED');
            const signed = await fetch(
                buildApiURL(
                    `v1/road-corridor-tiles/${tile.key.split('/').at(-1)}`,
                ),
                { signal: controller.signal },
            );
            if (!signed.ok)
                throw new Error('Tile download service unavailable');
            const { url } = await signed.json();
            if (typeof url !== 'string' || !url.startsWith('https://'))
                throw new Error('Invalid tile download URL');
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error('Tile download failed');
            const bytes = new Uint8Array(await response.arrayBuffer());
            // The complete body is now local. Verification and persistence must finish
            // even if the requesting matcher has moved on or been cancelled.
            clearTimeout(timeout);
            tileEvent(tile, 'DOWNLOAD_COMPLETE');
            pending.write(bytes);
            const records = await verifiedRecords(pending, tile);
            if (records.length !== tile.record_count)
                throw new Error('Tile validation failed');
            await pending.move(file);
            cacheRevision++;
            tileEvent(tile, 'SAVED_OFFLINE');
            return records;
        } catch (error) {
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
    tileJobs.set(tile.sha256, job);
    job.finally(() => tileJobs.delete(tile.sha256)).catch(() => {});
    return job;
}

export async function getPilotRoadCorridor(options) {
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
                ensureTile(tile, () => {
                    if (!finished && !options.signal?.aborted) startService();
                }),
            ]),
        );
        return await loadPilotCorridor({
            ...options,
            catalog,
            normalize: normalizeRoadCorridorWay,
            service: () => startService(),
            loadTile: (tile) => Promise.race([jobs.get(tile.id), waitDeadline]),
        });
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
