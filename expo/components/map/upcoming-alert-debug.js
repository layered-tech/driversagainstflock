import {
    AUTOMOTIVE_ALERT_MAXIMUM_RANGE_METERS,
    AUTOMOTIVE_ALERT_MINIMUM_RANGE_METERS,
    automotiveAlertHistoryAllowsEntry,
    getAutomotiveAlertDistanceMeters,
    getAutomotiveAlertHistoryEntry,
} from './automotive-alert-policy.js';

export function buildUpcomingAlertDebugSnapshot(
    {
        enabled,
        blockers = [],
        hasTemplate,
        suppressed,
        upcomingAlerts = [],
        userLocation,
        alertHistory,
        currentAlertKey,
        content,
        transition,
        pathSource,
        pathPointCount,
        alprNodeCount,
    },
    now = Date.now(),
) {
    const reasons = [...blockers];
    if (!enabled && !reasons.length) reasons.push('Upcoming warnings disabled');
    if (!hasTemplate) reasons.push('Car map template unavailable');
    if (suppressed) reasons.push('Banner temporarily suppressed');
    if (!alertHistory) reasons.push('Warning history unavailable');
    if (!upcomingAlerts.length) reasons.push('No upcoming candidates on path');
    const candidates = upcomingAlerts.map((alert) => {
        const entry = getAutomotiveAlertHistoryEntry(alert);
        const distance = getAutomotiveAlertDistanceMeters(
            [userLocation?.longitude, userLocation?.latitude],
            alert.coordinate,
        );
        const blockers = [];
        if (!Number.isFinite(distance)) blockers.push('Location unavailable');
        else if (distance < AUTOMOTIVE_ALERT_MINIMUM_RANGE_METERS)
            blockers.push('Inside 0.5 mile minimum');
        else if (distance > AUTOMOTIVE_ALERT_MAXIMUM_RANGE_METERS)
            blockers.push('Outside 2 mile maximum');
        if (
            !automotiveAlertHistoryAllowsEntry(
                alertHistory,
                entry,
                currentAlertKey,
            )
        ) {
            blockers.push(
                alertHistory
                    ? 'Already recorded or same type within 150 m'
                    : 'Warning history unavailable',
            );
        }
        return {
            key: entry?.alertKey ?? null,
            type: alert.type,
            geographicMeters: Number.isFinite(distance)
                ? Math.round(distance)
                : null,
            pathMeters: Number.isFinite(alert.distanceMeters)
                ? Math.round(alert.distanceMeters)
                : null,
            blockers,
        };
    });
    return {
        capturedAt: new Date(now).toISOString(),
        pathSource,
        pathPointCount,
        alprNodeCount,
        blockers: reasons,
        candidateCount: candidates.length,
        eligibleCount: candidates.filter(
            (candidate) => !candidate.blockers.length,
        ).length,
        candidates: candidates.slice(0, 8),
        historyCount: alertHistory?.entries.length ?? null,
        selectedKey: content?.alertKey ?? null,
        transition: transition?.action ?? 'none',
    };
}

export function createUpcomingAlertDebugStore() {
    let value = { enabled: false, latest: null, events: [] };
    let lastPublishedAt = -Infinity;
    const listeners = new Set();
    const emit = () => listeners.forEach((listener) => listener());
    return {
        getSnapshot: () => value,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setEnabled(enabled) {
            if (value.enabled === enabled) return;
            value = { ...value, enabled };
            lastPublishedAt = -Infinity;
            emit();
        },
        record(createSnapshot, now = Date.now()) {
            if (!value.enabled || now - lastPublishedAt < 1000) return;
            lastPublishedAt = now;
            value = { ...value, latest: createSnapshot() };
            emit();
        },
        event(event, alertId = null, now = Date.now()) {
            if (!value.enabled) return;
            value = {
                ...value,
                events: [
                    ...value.events,
                    {
                        at: new Date(now).toISOString(),
                        event,
                        alertId,
                    },
                ].slice(-60),
            };
            emit();
        },
        clear() {
            value = { ...value, latest: null, events: [] };
            lastPublishedAt = -Infinity;
            emit();
        },
    };
}
export const upcomingAlertDebugStore = createUpcomingAlertDebugStore();
export const formatUpcomingAlertDebugSnapshot = (snapshot) =>
    JSON.stringify({ feature: 'Upcoming car alerts', ...snapshot }, null, 2);
