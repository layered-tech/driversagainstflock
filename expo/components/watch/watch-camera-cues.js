import { watchSourceIsStale } from './watch-contract.js';

export const WATCH_CAMERA_CUE_MAX_AGE_MS = 5_000;

export function createWatchCameraCuePlanner() {
    let lastId = null;
    let consumed = false;

    return {
        consume(snapshot, now, enabled) {
            const alert = snapshot.cameraAlert;
            const id = alert?.id ?? null;
            if (id !== lastId) {
                lastId = id;
                consumed = false;
            }
            if (
                !alert ||
                consumed ||
                !enabled ||
                watchSourceIsStale(alert.sourceAt, now)
            )
                return null;
            consumed = true;

            return {
                version: 1,
                id: `${snapshot.publisherId}:camera:${id}:${now}`,
                publisherId: snapshot.publisherId,
                cameraId: id,
                pattern: 'camera',
                issuedAt: now,
                expiresAt: now + WATCH_CAMERA_CUE_MAX_AGE_MS,
            };
        },
    };
}
