import {
    getScorecardPrivacyScore,
    getScorecardWindowStats,
} from '../scorecard/scorecard-engine.js';

const text = (value, limit = 120) =>
    typeof value === 'string' ? value.trim().slice(0, limit) : '';
const count = (value) =>
    Number.isSafeInteger(value) && value >= 0 ? value : 0;
const identifier = (value) =>
    Number.isSafeInteger(Number(value)) && Number(value) > 0
        ? Number(value)
        : null;

export function projectWatchAreas(areas, feeds = {}, sourceAt = Date.now()) {
    return {
        status: 'ready',
        sourceAt,
        items: (Array.isArray(areas) ? areas : [])
            .slice(0, 25)
            .flatMap((area) => {
                const id = identifier(area?.id);
                if (id === null) return [];
                const feed = feeds[id];
                return [
                    {
                        id,
                        name: text(area.name),
                        unreadCount: count(area.unread_count),
                        cameraCount: count(area.camera_count),
                        addedCount: count(area.counts?.added),
                        removedCount: count(area.counts?.removed),
                        readThroughId: identifier(feed?.read_through_id),
                        changesStatus:
                            feed === undefined
                                ? 'loading'
                                : feed === null
                                  ? 'unavailable'
                                  : 'ready',
                        changes: (feed?.changes?.data ?? [])
                            .slice(0, 10)
                            .flatMap((change) => {
                                const changeId = identifier(change?.id);
                                if (changeId === null) return [];
                                return [
                                    {
                                        id: changeId,
                                        kind:
                                            change.kind === 'removed'
                                                ? 'removed'
                                                : 'added',
                                        street: text(change.street),
                                        operator: text(change.operator),
                                        direction: text(change.direction),
                                        changedAt:
                                            Date.parse(change.changed_at) ||
                                            null,
                                    },
                                ];
                            }),
                    },
                ];
            }),
    };
}

export function projectWatchRecap(runtimeSnapshot) {
    if (!runtimeSnapshot?.isHydrated) return { status: 'initializing' };
    const state = runtimeSnapshot.scorecardState;
    if (!state?.settings?.enabled) return { status: 'tracking-off' };
    const trip = state.trips?.at(-1);
    if (!trip || trip.mode !== 'guided') return { status: 'none' };
    const stats = getScorecardWindowStats(state, trip.endedAt);
    const crossings =
        count(trip.confirmedReadCount) + count(trip.possibleReadCount);
    const beforeScore = getScorecardPrivacyScore(
        Math.max(0, stats.avoidedCameraCount - count(trip.avoidedCameraCount)),
        Math.max(0, stats.cameraCrossingCount - crossings),
    );
    return {
        status: trip.completed ? 'completed' : 'canceled',
        id: text(trip.id, 80),
        endedAt: trip.endedAt,
        durationSeconds: trip.durationSeconds,
        distanceMiles: trip.distanceMiles,
        confirmedCrossings: count(trip.confirmedReadCount),
        possibleCrossings: count(trip.possibleReadCount),
        avoidedCameras: count(trip.avoidedCameraCount),
        xpEarned: count(trip.xpEarned),
        privacyScore: stats.privacyScore,
        privacyScoreDelta:
            beforeScore === null || stats.privacyScore === null
                ? null
                : stats.privacyScore - beforeScore,
    };
}

export function projectWatchCamera(alerts, now, enabled = true) {
    if (!enabled || !Number.isFinite(now) || now <= 0) return null;
    const eligible = (Array.isArray(alerts) ? alerts : [])
        .filter(
            (alert) =>
                alert?.type === 'alpr' &&
                Number.isFinite(alert.distanceMeters) &&
                alert.distanceMeters >= 0 &&
                alert.distanceMeters <= 804.672,
        )
        .sort((first, second) => first.distanceMeters - second.distanceMeters);
    if (!eligible.length) return null;
    const nearest = eligible[0];
    const tags = nearest.source?.tags ?? {};
    return {
        id: text(String(nearest.id), 80),
        type: text(tags.brand || tags.manufacturer || 'ALPR', 40),
        road: text(tags['addr:street'] || tags.street, 80),
        distanceMeters: nearest.distanceMeters,
        count: eligible.length,
        sourceAt: now,
    };
}

export function createWatchCameraAppearanceTracker() {
    let lastId = null;
    let issuedAt = null;
    return (alert, now) => {
        if (alert?.id !== lastId) {
            lastId = alert?.id ?? null;
            issuedAt = alert ? now : null;
        }
        return alert ? { ...alert, issuedAt } : null;
    };
}
