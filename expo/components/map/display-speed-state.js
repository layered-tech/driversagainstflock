const DISPLAY_SPEED_RETENTION_MS = 2000;
const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362920544;

export function getValidSpeedMps(value) {
    if (
        (typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && value.trim() === '')
    ) {
        return null;
    }

    const speed = Number(value);

    return Number.isFinite(speed) && speed >= 0 ? speed : null;
}

export function getCurrentSpeedMph(value) {
    const speed = getValidSpeedMps(value);

    return speed === null
        ? null
        : Math.round(speed * METERS_PER_SECOND_TO_MILES_PER_HOUR);
}

export function getDisplaySpeedState(
    previous,
    { enabled, speed, recordedAt },
    now,
) {
    let lastValid = enabled ? (previous?.lastValid ?? null) : null;
    let expiresAt = null;
    let displayedSpeed = null;

    if (enabled && speed !== null) {
        lastValid = {
            speed,
            recordedAt,
            receivedAt:
                lastValid && lastValid.recordedAt === recordedAt
                    ? lastValid.receivedAt
                    : now,
        };
        displayedSpeed = speed;
    } else if (
        lastValid &&
        now < lastValid.receivedAt + DISPLAY_SPEED_RETENTION_MS
    ) {
        expiresAt = lastValid.receivedAt + DISPLAY_SPEED_RETENTION_MS;
        displayedSpeed = lastValid.speed;
    }

    return { enabled, speed, recordedAt, lastValid, expiresAt, displayedSpeed };
}
