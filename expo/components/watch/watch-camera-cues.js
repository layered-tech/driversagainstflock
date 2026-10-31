import { watchSourceIsStale } from './watch-contract.js';
import { AUTOMOTIVE_ALERT_REPEAT_COOLDOWN_MS } from '../map/automotive-alert-policy.js';

export const WATCH_CAMERA_CUE_MAX_AGE_MS = 2_000;
export const WATCH_CAMERA_CUE_MERGE_MS = 8_000;

export function createWatchCameraCuePlanner() {
    let observed = false;
    let lastId = null;
    let lastCueAt = -Infinity;
    let pending = null;
    const seen = new Map();
    return {
        consume(
            snapshot,
            now,
            maneuverCue,
            enabled,
            speedMetersPerSecond = null,
        ) {
            const alert = snapshot.cameraAlert;
            if (!observed) {
                observed = true;
                lastId = alert?.id ?? null;
                return null;
            }
            if (!alert) {
                lastId = null;
                pending = null;
                return null;
            }
            for (const [id, at] of seen) {
                if (now - at >= AUTOMOTIVE_ALERT_REPEAT_COOLDOWN_MS)
                    seen.delete(id);
            }
            if (alert.id !== lastId) {
                lastId = alert.id;
                pending = null;
                if (
                    !enabled ||
                    watchSourceIsStale(alert.sourceAt, now) ||
                    seen.has(alert.id)
                )
                    return null;
                seen.set(alert.id, now);
                if (now - lastCueAt < WATCH_CAMERA_CUE_MERGE_MS) return null;
                pending = { id: alert.id, at: now };
            }
            if (!pending || pending.id !== alert.id) return null;
            if (
                !enabled ||
                watchSourceIsStale(alert.sourceAt, now) ||
                now - pending.at > WATCH_CAMERA_CUE_MAX_AGE_MS
            ) {
                pending = null;
                return null;
            }
            const maneuverDistance =
                snapshot.navigation?.maneuver?.distanceMeters;
            const secondsToManeuver =
                Number.isFinite(speedMetersPerSecond) &&
                speedMetersPerSecond > 0 &&
                Number.isFinite(maneuverDistance)
                    ? maneuverDistance / speedMetersPerSecond
                    : null;
            if (
                !maneuverCue &&
                secondsToManeuver !== null &&
                Math.abs(secondsToManeuver - 10) <= 2
            )
                return null;
            pending = null;
            lastCueAt = now;
            return {
                version: 1,
                id: `${snapshot.publisherId}:camera:${alert.id}:${now}`,
                publisherId: snapshot.publisherId,
                cameraId: alert.id,
                pattern: 'camera',
                issuedAt: now,
                expiresAt: now + WATCH_CAMERA_CUE_MAX_AGE_MS,
            };
        },
    };
}
