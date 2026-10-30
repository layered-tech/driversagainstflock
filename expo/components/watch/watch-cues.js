import { watchSourceIsStale } from './watch-contract.js';

export const WATCH_CUE_ADVANCE_SECONDS = 10;
export const WATCH_CUE_MIN_METERS = 30;
export const WATCH_CUE_MAX_METERS = 300;
export const WATCH_CUE_FALLBACK_METERS = 100;
export const WATCH_CUE_EXPIRES_MS = 3_000;
export const WATCH_CUE_MIN_SEPARATION_MS = 2_000;

export function watchCuePattern(kind) {
    if (['left', 'slight-left', 'sharp-left', 'keep-left'].includes(kind))
        return 'left';
    if (['right', 'slight-right', 'sharp-right', 'keep-right'].includes(kind))
        return 'right';
    if (['roundabout', 'uturn'].includes(kind)) return 'neutral';
    return null;
}

export function watchCueDistanceMeters(speedMetersPerSecond) {
    return typeof speedMetersPerSecond === 'number' &&
        Number.isFinite(speedMetersPerSecond) &&
        speedMetersPerSecond > 0
        ? Math.min(
              WATCH_CUE_MAX_METERS,
              Math.max(
                  WATCH_CUE_MIN_METERS,
                  speedMetersPerSecond * WATCH_CUE_ADVANCE_SECONDS,
              ),
          )
        : WATCH_CUE_FALLBACK_METERS;
}

export function createWatchCuePlanner() {
    let identity = null;
    let previousDistance = null;
    let consumed = false;
    let lastCueAt = -Infinity;

    return {
        consume(snapshot, speedMetersPerSecond, enabled, now) {
            const nav = snapshot.navigation;
            const maneuver = nav.status === 'active' ? nav.maneuver : null;
            const nextIdentity = maneuver
                ? `${snapshot.publisherId}:${nav.sessionId}:${maneuver.id}`
                : null;
            if (nextIdentity !== identity) {
                identity = nextIdentity;
                previousDistance = null;
                consumed = false;
            }
            if (!maneuver) return null;
            const pattern = watchCuePattern(maneuver.kind);
            const distance = maneuver.distanceMeters;
            if (pattern === null || !Number.isFinite(distance)) return null;
            const threshold = watchCueDistanceMeters(speedMetersPerSecond);
            if (!enabled || watchSourceIsStale(nav.sourceAt, now)) {
                previousDistance = distance;
                if (distance <= threshold) consumed = true;
                return null;
            }
            const crossed =
                previousDistance !== null &&
                previousDistance > threshold &&
                distance <= threshold;
            previousDistance = distance;
            if (!crossed || consumed) return null;
            consumed = true;
            if (now - lastCueAt < WATCH_CUE_MIN_SEPARATION_MS) return null;
            lastCueAt = now;
            return {
                version: 1,
                id: nextIdentity,
                publisherId: snapshot.publisherId,
                sessionId: nav.sessionId,
                maneuverId: maneuver.id,
                pattern,
                issuedAt: now,
                expiresAt: now + WATCH_CUE_EXPIRES_MS,
            };
        },
    };
}
