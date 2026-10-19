import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { gunzipSync, strFromU8 } from 'fflate';
import catalog from '../../assets/map/wisconsin-corridor.json';
import { getRoadCorridor, normalizeRoadCorridorWay } from './api';
import { buildApiURL } from './config';
import { loadPilotCorridor } from './road-corridor-pilot-core';

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

export async function getPilotRoadCorridor(options) {
    const controller = new AbortController();
    const serviceController = new AbortController();
    let serviceRequest;
    const startService = () => {
        if (!serviceRequest) {
            serviceRequest = getRoadCorridor({
                ...options,
                signal: serviceController.signal,
            });
            // A cold download races the service so fallback retains its original time budget.
            serviceRequest.catch(() => {});
        }
        return serviceRequest;
    };
    const cancel = () => {
        controller.abort();
        serviceController.abort();
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        return await loadPilotCorridor({
            ...options,
            catalog,
            normalize: normalizeRoadCorridorWay,
            service: async () => {
                clearTimeout(timeout);
                return startService();
            },
            loadTile: async (tile) => {
                const directory = new Directory(
                    Paths.document,
                    'road-corridors',
                    catalog.release,
                );
                directory.create({ intermediates: true, idempotent: true });
                const file = new File(
                    directory,
                    `${tile.id}-${tile.sha256}.gz`,
                );
                if (file.exists) {
                    try {
                        return await verifiedRecords(file, tile);
                    } catch {
                        file.delete();
                    }
                }
                startService();
                if (controller.signal.aborted)
                    throw new Error('Download not ready');
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
                const response = await fetch(url, {
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error('Tile download failed');
                const bytes = new Uint8Array(await response.arrayBuffer());
                const pending = new File(directory, `${tile.id}.partial`);
                try {
                    pending.write(bytes);
                    const records = await verifiedRecords(pending, tile);
                    if (controller.signal.aborted)
                        throw new Error('Download not ready');
                    pending.move(file);
                    return records;
                } finally {
                    if (pending.exists && pending.uri !== file.uri)
                        pending.delete();
                }
            },
        });
    } finally {
        clearTimeout(timeout);
        serviceController.abort();
        options.signal?.removeEventListener('abort', cancel);
    }
}
