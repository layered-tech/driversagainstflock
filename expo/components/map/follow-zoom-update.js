import {
    getSpeedZoomStops,
    resolveNavigationTuning,
} from './navigation-tuning.js';

export const FOLLOW_ZOOM_UPDATE_EPSILON = 0.05;
// A long throttle makes normal acceleration look like a sequence of large
// camera jumps. This is short enough to track driving speed while still
// coalescing the high-frequency location stream.
export const FOLLOW_ZOOM_UPDATE_INTERVAL_MS = 750;
export const FOLLOW_SPEED_ZOOM_RETURN_DEBOUNCE_MS = 5000;

const METERS_PER_SECOND_PER_MPH = 0.44704;
function getFollowSpeedZoomBracket(speed, levels) {
    if (Number.isFinite(speed)) {
        for (let index = levels.length - 1; index > 0; index--) {
            if (speed >= levels[index].speedMph * METERS_PER_SECOND_PER_MPH) {
                return index;
            }
        }
    }
    return 0;
}

export function getFollowSpeedZoomLevel(speed, clampZoomLevel, options) {
    const levels = getSpeedZoomStops(resolveNavigationTuning(options));
    return clampZoomLevel(
        levels[getFollowSpeedZoomBracket(speed, levels)].zoomLevel,
    );
}

export function createFollowSpeedZoomController(options) {
    const levels = getSpeedZoomStops(resolveNavigationTuning(options));
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
        const nextBracket = getFollowSpeedZoomBracket(speed, levels);
        if (force || currentBracket === null) {
            reset();
            currentBracket = nextBracket;
        } else if (Number.isFinite(lastRecordedAt) && now < lastRecordedAt) {
            return levels[currentBracket].zoomLevel;
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
        return levels[currentBracket].zoomLevel;
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
