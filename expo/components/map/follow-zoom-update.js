export const FOLLOW_ZOOM_UPDATE_EPSILON = 0.05;
// A long throttle makes normal acceleration look like a sequence of large
// camera jumps. This is short enough to track driving speed while still
// coalescing the high-frequency location stream.
export const FOLLOW_ZOOM_UPDATE_INTERVAL_MS = 750;
export const FOLLOW_SPEED_ZOOM_RETURN_DEBOUNCE_MS = 5000;

const METERS_PER_SECOND_PER_MPH = 0.44704;
const LOCATION_FOLLOW_SPEED_ZOOM_LEVELS = [
    { speedMph: 25, zoomLevel: 18.5 },
    { speedMph: 30, zoomLevel: 18.25 },
    { speedMph: 35, zoomLevel: 17.5 },
    { speedMph: 40, zoomLevel: 16.75 },
    { speedMph: 45, zoomLevel: 16 },
    { speedMph: 50, zoomLevel: 15.25 },
    { speedMph: 55, zoomLevel: 14.5 },
    { speedMph: 65, zoomLevel: 13.75 },
];

function getFollowSpeedZoomBracket(speed) {
    if (Number.isFinite(speed)) {
        for (
            let index = LOCATION_FOLLOW_SPEED_ZOOM_LEVELS.length - 1;
            index > 0;
            index--
        ) {
            if (
                speed >=
                LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[index].speedMph *
                    METERS_PER_SECOND_PER_MPH
            ) {
                return index;
            }
        }
    }
    return 0;
}

export function getFollowSpeedZoomLevel(speed, clampZoomLevel) {
    return clampZoomLevel(
        LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[getFollowSpeedZoomBracket(speed)]
            .zoomLevel,
    );
}

export function createFollowSpeedZoomController() {
    let currentBracket = null;
    let previousBracket = null;
    let returnStartedAt = null;
    let lastRecordedAt = null;

    function reset() {
        currentBracket = null;
        previousBracket = null;
        returnStartedAt = null;
        lastRecordedAt = null;
    }

    function update({ speed, now = Date.now(), force = false }) {
        const nextBracket = getFollowSpeedZoomBracket(speed);
        if (force || currentBracket === null) {
            reset();
            currentBracket = nextBracket;
        } else if (Number.isFinite(lastRecordedAt) && now < lastRecordedAt) {
            return LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[currentBracket].zoomLevel;
        } else if (nextBracket === currentBracket) {
            returnStartedAt = null;
        } else {
            const returningToAdjacentBracket =
                nextBracket === previousBracket &&
                Math.abs(nextBracket - currentBracket) === 1;
            if (returningToAdjacentBracket) {
                returnStartedAt ??= now;
            }
            if (
                !returningToAdjacentBracket ||
                now - returnStartedAt >= FOLLOW_SPEED_ZOOM_RETURN_DEBOUNCE_MS
            ) {
                previousBracket = currentBracket;
                currentBracket = nextBracket;
                returnStartedAt = null;
            }
        }
        lastRecordedAt = now;
        return LOCATION_FOLLOW_SPEED_ZOOM_LEVELS[currentBracket].zoomLevel;
    }

    return { update, reset };
}

export function getFollowZoomUpdate({
    currentZoomLevel,
    force = false,
    lastUpdateAt = null,
    nextZoomLevel,
    now = Date.now(),
    userZoomOverrideIsActive = false,
}) {
    const updateIntervalHasElapsed =
        force ||
        !Number.isFinite(lastUpdateAt) ||
        (Number.isFinite(now) &&
            now - lastUpdateAt >= FOLLOW_ZOOM_UPDATE_INTERVAL_MS);
    const shouldUpdate =
        (!userZoomOverrideIsActive || force) &&
        updateIntervalHasElapsed &&
        (force ||
            Math.abs(currentZoomLevel - nextZoomLevel) >=
                FOLLOW_ZOOM_UPDATE_EPSILON);

    return {
        shouldUpdate,
    };
}
