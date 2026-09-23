export const AUTOMOTIVE_ALERT_MINIMUM_RANGE_METERS = 1609.344 * 0.5;
export const AUTOMOTIVE_ALERT_MAXIMUM_RANGE_METERS = 1609.344 * 2;
export const AUTOMOTIVE_ALERT_MINIMUM_SPACING_MS = 2 * 60 * 1000;

const EARTH_RADIUS_METERS = 6371008.8;
const AUTOMOTIVE_ALERT_TYPES = new Set(['alpr', 'police']);

function getCoordinateNumber(value) {
    if (
        value === null ||
        value === undefined ||
        (typeof value === 'string' && !value.trim())
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

export function getAutomotiveAlertCoordinate(value) {
    if (!Array.isArray(value) || value.length < 2) {
        return null;
    }

    const longitude = getCoordinateNumber(value[0]);
    const latitude = getCoordinateNumber(value[1]);

    if (
        longitude === null ||
        latitude === null ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

function degreesToRadians(value) {
    return (value * Math.PI) / 180;
}

export function getAutomotiveAlertDistanceMeters(fromCoordinate, toCoordinate) {
    const from = getAutomotiveAlertCoordinate(fromCoordinate);
    const to = getAutomotiveAlertCoordinate(toCoordinate);

    if (!from || !to) {
        return null;
    }

    const [fromLongitude, fromLatitude] = from;
    const [toLongitude, toLatitude] = to;
    const fromLatitudeRadians = degreesToRadians(fromLatitude);
    const toLatitudeRadians = degreesToRadians(toLatitude);
    const latitudeDelta = degreesToRadians(toLatitude - fromLatitude);
    const longitudeDelta = degreesToRadians(toLongitude - fromLongitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(fromLatitudeRadians) *
            Math.cos(toLatitudeRadians) *
            Math.sin(longitudeDelta / 2) ** 2;
    const clampedHaversine = Math.min(1, Math.max(0, haversine));

    return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(clampedHaversine), Math.sqrt(1 - clampedHaversine))
    );
}

export function getAutomotiveAlertKey(alert) {
    const type = alert?.type;
    const id = alert?.id;

    if (
        !AUTOMOTIVE_ALERT_TYPES.has(type) ||
        id === null ||
        id === undefined ||
        id === ''
    ) {
        return null;
    }

    return `${type}:${String(id)}`;
}

export function getAutomotiveAlertHistoryEntry(alert) {
    const alertKey = getAutomotiveAlertKey(alert);
    const coordinate = getAutomotiveAlertCoordinate(alert?.coordinate);

    if (!alertKey || !coordinate) {
        return null;
    }

    return { alertKey, coordinate, type: alert.type };
}

export function createAutomotiveAlertHistory(driveId) {
    return { driveId, entries: [], lastShownAt: null };
}

export function normalizeAutomotiveAlertHistory(
    value,
    driveId,
    now = Date.now(),
) {
    if (value === undefined || value === null) {
        return createAutomotiveAlertHistory(driveId);
    }

    if (
        typeof value !== 'object' ||
        Array.isArray(value) ||
        value.driveId !== driveId ||
        !Array.isArray(value.entries)
    ) {
        throw new Error('Invalid automotive alert history');
    }

    const entries = value.entries.map((entry) => {
        const coordinate = getAutomotiveAlertCoordinate(entry?.coordinate);

        if (
            !coordinate ||
            !AUTOMOTIVE_ALERT_TYPES.has(entry?.type) ||
            typeof entry?.alertKey !== 'string' ||
            !entry.alertKey.startsWith(`${entry.type}:`)
        ) {
            throw new Error('Invalid automotive alert history');
        }

        return {
            alertKey: entry.alertKey,
            coordinate,
            type: entry.type,
        };
    });

    if (
        new Set(entries.map(({ alertKey }) => alertKey)).size !== entries.length
    ) {
        throw new Error('Invalid automotive alert history');
    }

    const lastShownAt =
        value.lastShownAt === undefined
            ? entries.length > 0
                ? now
                : null
            : value.lastShownAt;
    if (!(lastShownAt === null || Number.isFinite(lastShownAt))) {
        throw new Error('Invalid automotive alert history');
    }

    return { driveId, entries, lastShownAt };
}

export function recordAutomotiveAlertHistoryEntry(
    history,
    entry,
    shownAt = Date.now(),
) {
    if (
        !entry ||
        history.entries.some(({ alertKey }) => alertKey === entry.alertKey)
    ) {
        return history;
    }

    return {
        ...history,
        entries: [...history.entries, entry],
        lastShownAt: shownAt,
    };
}

export function automotiveAlertHistoryAllowsEntry(
    history,
    entry,
    currentAlertKey = null,
    now = Date.now(),
) {
    if (!history || !entry) {
        return false;
    }

    if (entry.alertKey === currentAlertKey) {
        return true;
    }

    return (
        history.entries.every((shown) => shown.alertKey !== entry.alertKey) &&
        (history.lastShownAt === null ||
            now - history.lastShownAt >= AUTOMOTIVE_ALERT_MINIMUM_SPACING_MS)
    );
}

export function getAutomotiveAlertsAllowedByHistory({
    alerts,
    currentAlertKey = null,
    history,
    now = Date.now(),
}) {
    if (!Array.isArray(alerts) || !history) {
        return [];
    }

    return alerts.filter((alert) => {
        const entry = getAutomotiveAlertHistoryEntry(alert);

        if (!entry) {
            return false;
        }

        return automotiveAlertHistoryAllowsEntry(
            history,
            entry,
            currentAlertKey,
            now,
        );
    });
}
