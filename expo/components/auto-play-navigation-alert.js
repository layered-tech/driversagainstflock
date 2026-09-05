import {
    getDrivingAlertsPresentation,
    getUpcomingAlertId,
} from './map/driving-alerts.js';

export const AUTO_PLAY_NAVIGATION_ALERT_ACTION_TITLE = 'OK';
export const AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR = '#ffdf92';

/**
 * Matches `TextPlaceholders.Distance`. Sending the distance as a placeholder
 * plus a {value, unit} pair lets the car host format and localize it the same
 * way it formats its own maneuver distances.
 */
export const AUTO_PLAY_NAVIGATION_ALERT_DISTANCE_PLACEHOLDER = '{distance}';
export const AUTO_PLAY_NAVIGATION_ALERT_TITLE = `${AUTO_PLAY_NAVIGATION_ALERT_DISTANCE_PLACEHOLDER} ahead`;
export const AUTO_PLAY_NAVIGATION_ALERT_TITLE_WITHOUT_DISTANCE = 'Ahead';

/**
 * The banner is timed to clear as the driver passes the alert, so its duration
 * is how long the remaining distance takes to cover. Speed goes missing, stale,
 * or near zero in stopped traffic, where time-to-pass stops meaning anything,
 * so it is clamped at both ends and falls back to a fixed banner.
 */
export const AUTO_PLAY_NAVIGATION_ALERT_FALLBACK_DURATION_MS = 10000;
export const AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_DURATION_MS = 5000;
export const AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_DURATION_MS = 300000;

// A follow-up announced the instant a banner is dismissed reads as the same
// banner being kept. Leaving the slot empty for a beat makes the swap visible.
export const AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS = 800;

// ~3 mph. Below this the driver is crawling or stopped and the computed
// time-to-pass balloons past anything worth leaving on screen.
const AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_SPEED_MPS = 1.5;

const AUTO_PLAY_NAVIGATION_ALERT_TYPE_LABELS = {
    alpr: 'ALPR',
    police: 'Police',
};

// ALPR readers are fixed and always there, so they outrank a crowd-sourced
// police report when the host has to pick one banner.
const AUTO_PLAY_NAVIGATION_ALERT_TYPE_PRIORITIES = {
    alpr: 'high',
    police: 'medium',
};

const AUTO_PLAY_NAVIGATION_ALERT_PRIORITY_RANKS = {
    high: 2,
    low: 0,
    medium: 1,
};

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const FEET_DISTANCE_MAXIMUM_METERS = 161;

function getNavigationAlertDistanceForSort(alertPresentation) {
    const distance = Number(alertPresentation?.alert?.distanceMeters);

    return Number.isFinite(distance) && distance >= 0
        ? distance
        : Number.POSITIVE_INFINITY;
}

/**
 * getDrivingAlertsPresentation orders police before ALPR for the side-by-side
 * handset card. The car banner has room for one alert, so it leads with
 * whichever the driver reaches first and keeps the police-first order when both
 * sit at the same distance.
 */
function getNavigationAlertsClosestFirst(alertPresentations) {
    return [...alertPresentations].sort(
        (firstAlert, secondAlert) =>
            getNavigationAlertDistanceForSort(firstAlert) -
            getNavigationAlertDistanceForSort(secondAlert),
    );
}

/**
 * Mirrors getDirectionsDistanceEstimate so a car alert reads in the same units
 * and granularity as the maneuver card above it. Values are quantized to what
 * the host actually renders, which keeps the alert from being re-sent on every
 * location update for a change no driver can see.
 */
function getNavigationAlertDistance(distanceMeters) {
    const distance = Number(distanceMeters);

    if (!Number.isFinite(distance)) {
        return null;
    }

    const clampedDistance = Math.max(0, distance);

    if (clampedDistance < FEET_DISTANCE_MAXIMUM_METERS) {
        return {
            unit: 'feet',
            value:
                clampedDistance <= 0
                    ? 0
                    : Math.max(
                          50,
                          Math.round((clampedDistance * FEET_PER_METER) / 50) *
                              50,
                      ),
        };
    }

    return {
        unit: 'miles',
        value: Math.round((clampedDistance / METERS_PER_MILE) * 10) / 10,
    };
}

export function getAutoPlayNavigationAlertDurationMs({
    currentSpeedMps,
    distanceMeters,
}) {
    const distance = Number(distanceMeters);
    const speed = Number(currentSpeedMps);

    if (
        !Number.isFinite(distance) ||
        distance <= 0 ||
        !Number.isFinite(speed) ||
        speed < AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_SPEED_MPS
    ) {
        return AUTO_PLAY_NAVIGATION_ALERT_FALLBACK_DURATION_MS;
    }

    return Math.min(
        AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_DURATION_MS,
        Math.max(
            AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_DURATION_MS,
            Math.round((distance / speed) * 1000),
        ),
    );
}

/**
 * The car banner has room for one alert, so a dismissed alert has to step
 * aside for the next upcoming one instead of holding the slot until the driver
 * passes it. Dismissed keys are excluded here and pruned once they stop being
 * upcoming, which also keeps a dismissed alert from being announced again.
 */
export function getAutoPlayNavigationAlertContent({
    currentSpeedMps,
    dismissedAlertKeys = null,
    upcomingAlerts,
} = {}) {
    const presentation = getDrivingAlertsPresentation(
        upcomingAlerts,
        dismissedAlertKeys,
    );

    if (!presentation) {
        return null;
    }

    const [primaryAlert] = getNavigationAlertsClosestFirst(presentation.alerts);
    const distanceMeters = primaryAlert.alert?.distanceMeters;
    const distance = getNavigationAlertDistance(distanceMeters);
    const priority =
        AUTO_PLAY_NAVIGATION_ALERT_TYPE_PRIORITIES[primaryAlert.type];

    return {
        alertKey: primaryAlert.id,
        distance,
        durationMs: getAutoPlayNavigationAlertDurationMs({
            currentSpeedMps,
            distanceMeters,
        }),
        priority,
        priorityRank: AUTO_PLAY_NAVIGATION_ALERT_PRIORITY_RANKS[priority],
        subtitle: `${AUTO_PLAY_NAVIGATION_ALERT_TYPE_LABELS[primaryAlert.type]} - on your route`,
        title: distance
            ? AUTO_PLAY_NAVIGATION_ALERT_TITLE
            : AUTO_PLAY_NAVIGATION_ALERT_TITLE_WITHOUT_DISTANCE,
        type: primaryAlert.type,
    };
}

/**
 * The host owns the banner's lifetime, and a dropped onDidDismiss would
 * otherwise leave isVisible stuck true and mute every lower-ranked alert for
 * the rest of the session. Treating the announced duration as the outer bound
 * means a missed callback costs one late release, not permanent silence.
 */
function navigationAlertIsOnScreen(state, now) {
    return Boolean(state?.isVisible && now < state.expiresAt);
}

function navigationAlertTextChanged(state, content) {
    return (
        state.title !== content.title ||
        state.subtitle !== content.subtitle ||
        state.distance?.unit !== content.distance?.unit ||
        state.distance?.value !== content.distance?.value
    );
}

/**
 * Maps the alert the driver should hear about next onto a single car-host call.
 * A new closest alert becomes its own announcement with a fresh host id, an
 * announcement still on screen only gets its text refreshed, and the banner is
 * dismissed once nothing is upcoming. Keeping the alert key in state after the
 * host auto-dismisses the banner is what stops one alert from being announced
 * over and over while the driver approaches it.
 *
 * @param {object} options
 * @param {{alertKey: string, distance: object|null, durationMs: number, priority: string, priorityRank: number, subtitle: string, title: string}|null} options.content
 * @param {number} options.nextAlertId
 * @param {number} [options.now]
 * @param {{alertId: number, alertKey: string, distance: object|null, expiresAt: number, isVisible: boolean, priorityRank: number, subtitle: string, title: string}|null} [options.state]
 * @returns {{action: 'none'|'show'|'update'|'dismiss', alertId?: number, state: object|null}}
 */
export function getAutoPlayNavigationAlertTransition({
    content,
    followUpDelayMs = AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS,
    nextAlertId,
    now = Date.now(),
    state = null,
}) {
    const alertIsOnScreen = navigationAlertIsOnScreen(state, now);

    if (!content) {
        if (!state) {
            return { action: 'none', state: null };
        }

        return {
            action: alertIsOnScreen ? 'dismiss' : 'none',
            alertId: state.alertId,
            state: null,
        };
    }

    if (!state || state.alertKey !== content.alertKey) {
        // Both car hosts silently drop an alert ranked below the banner already
        // on screen — no callback, no retry. Hold the announcement instead of
        // recording it as shown, and it gets re-derived and announced on the
        // next pass once the banner clears.
        if (alertIsOnScreen && content.priorityRank < state.priorityRank) {
            return { action: 'none', state };
        }

        if (
            state &&
            !alertIsOnScreen &&
            Number.isFinite(state.dismissedAt) &&
            now - state.dismissedAt < followUpDelayMs
        ) {
            return { action: 'none', state };
        }

        return {
            action: 'show',
            alertId: nextAlertId,
            state: {
                alertId: nextAlertId,
                alertKey: content.alertKey,
                distance: content.distance,
                expiresAt: now + content.durationMs,
                isVisible: true,
                priorityRank: content.priorityRank,
                subtitle: content.subtitle,
                title: content.title,
            },
        };
    }

    if (alertIsOnScreen && navigationAlertTextChanged(state, content)) {
        return {
            action: 'update',
            alertId: state.alertId,
            state: {
                ...state,
                distance: content.distance,
                subtitle: content.subtitle,
                title: content.title,
            },
        };
    }

    return { action: 'none', state };
}

export function getAutoPlayNavigationAlertDismissedState(
    state,
    alertId,
    now = Date.now(),
) {
    if (!state || state.alertId !== alertId || !state.isVisible) {
        return state;
    }

    return { ...state, dismissedAt: now, isVisible: false };
}

/**
 * Records the alert behind a dismissed host banner so the next announcement
 * pass moves on to the following upcoming alert. Dismissals reported for an
 * alert the host already replaced leave the set untouched.
 */
export function getDismissedAutoPlayNavigationAlertKeys({
    alertId,
    dismissedAlertKeys,
    state,
}) {
    const currentKeys = dismissedAlertKeys ?? new Set();

    if (
        !state ||
        state.alertId !== alertId ||
        !state.alertKey ||
        currentKeys.has(state.alertKey)
    ) {
        return currentKeys;
    }

    return new Set([...currentKeys, state.alertKey]);
}

/**
 * Forgets dismissed alerts that are no longer upcoming, so the same reader can
 * be announced again on a later approach.
 */
export function pruneDismissedAutoPlayNavigationAlertKeys(
    dismissedAlertKeys,
    upcomingAlerts,
) {
    if (!dismissedAlertKeys?.size) {
        return dismissedAlertKeys ?? new Set();
    }

    const upcomingAlertKeys = new Set(
        (Array.isArray(upcomingAlerts) ? upcomingAlerts : []).map(
            (alert, index) => getUpcomingAlertId(alert, index),
        ),
    );
    const retainedKeys = [...dismissedAlertKeys].filter((alertKey) =>
        upcomingAlertKeys.has(alertKey),
    );

    return retainedKeys.length === dismissedAlertKeys.size
        ? dismissedAlertKeys
        : new Set(retainedKeys);
}
