import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    AUTO_PLAY_NAVIGATION_ALERT_ACTION_TITLE,
    AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS,
    AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR,
    getAutoPlayNavigationAlertContent,
    getAutoPlayNavigationAlertDismissedState,
    getAutoPlayNavigationAlertTransition,
    getDismissedAutoPlayNavigationAlertKeys,
    pruneDismissedAutoPlayNavigationAlertKeys,
} from './auto-play-navigation-alert';

const AUTO_PLAY_IS_SUPPORTED =
    Platform.OS === 'android' || Platform.OS === 'ios';

// U+E565 lives in FontAwesome 6+, outside the FontAwesome 4 range the car glyph
// font covers, so road-circle-exclamation ships as a tintable asset instead of
// a glyph. Both hosts tint it with SRC_IN, so the alpha channel carries the
// shape and the colour comes from here.
const AUTO_PLAY_NAVIGATION_ALERT_IMAGE = {
    color: AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR,
    image: require('../assets/auto-play/road-circle-exclamation.png'),
    type: 'asset',
};

// Car hosts address alerts by integer id, and a replaced announcement needs a
// fresh id so the host treats it as new instead of a redraw of the old one.
let nextAutoPlayNavigationAlertId = 1;

function makeAutoPlayNavigationAlertTitle(content) {
    return content.distance
        ? { distance: content.distance, text: content.title }
        : { text: content.title };
}

function useAutoPlayMapTemplate() {
    if (!AUTO_PLAY_IS_SUPPORTED) {
        return null;
    }

    const { useMapTemplate } = require('@iternio/react-native-auto-play');

    return useMapTemplate();
}

/**
 * Announces upcoming ALPR and police alerts through the car host's own
 * navigation alert banner instead of drawing a card onto the map surface. It is
 * inert outside the car map template, where there is no host to announce to.
 */
export function useAutoPlayNavigationAlerts({
    currentSpeedMps,
    enabled,
    upcomingAlerts,
}) {
    const mapTemplate = useAutoPlayMapTemplate();
    const alertStateRef = useRef(null);
    const dismissedAlertKeysRef = useRef(new Set());
    const followUpTimerRef = useRef(null);
    const currentSpeedMpsRef = useRef(currentSpeedMps);
    const [dismissalRevision, setDismissalRevision] = useState(0);
    const handleAlertDismissed = useCallback((alertId) => {
        const nextDismissedAlertKeys = getDismissedAutoPlayNavigationAlertKeys({
            alertId,
            dismissedAlertKeys: dismissedAlertKeysRef.current,
            state: alertStateRef.current,
        });
        const nextState = getAutoPlayNavigationAlertDismissedState(
            alertStateRef.current,
            alertId,
            Date.now(),
        );

        if (
            nextState === alertStateRef.current &&
            nextDismissedAlertKeys === dismissedAlertKeysRef.current
        ) {
            return;
        }

        dismissedAlertKeysRef.current = nextDismissedAlertKeys;
        alertStateRef.current = nextState;
        // The dismissal only mutates a ref, so nudge the effect to run again and
        // give the next alert its turn rather than waiting for the next location
        // update to change `upcomingAlerts`. The nudge waits out the follow-up
        // pause, and the transition holds any earlier pass until it has elapsed.
        clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = setTimeout(() => {
            followUpTimerRef.current = null;
            setDismissalRevision((revision) => revision + 1);
        }, AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS);
    }, []);

    useEffect(() => () => clearTimeout(followUpTimerRef.current), []);

    // Speed only feeds the banner duration, which is read once per
    // announcement. Keeping it in a ref stops every GPS tick from re-running
    // the effect for a value that cannot change an already-visible banner.
    currentSpeedMpsRef.current = currentSpeedMps;

    useEffect(() => {
        if (!mapTemplate) {
            alertStateRef.current = null;
            dismissedAlertKeysRef.current = new Set();
            clearTimeout(followUpTimerRef.current);
            followUpTimerRef.current = null;

            return;
        }

        // A dismissed banner stands aside for the next upcoming alert, and the
        // dismissal is forgotten once that alert is no longer ahead.
        dismissedAlertKeysRef.current =
            pruneDismissedAutoPlayNavigationAlertKeys(
                dismissedAlertKeysRef.current,
                upcomingAlerts,
            );

        const content = enabled
            ? getAutoPlayNavigationAlertContent({
                  currentSpeedMps: currentSpeedMpsRef.current,
                  dismissedAlertKeys: dismissedAlertKeysRef.current,
                  upcomingAlerts,
              })
            : null;
        const transition = getAutoPlayNavigationAlertTransition({
            content,
            nextAlertId: nextAutoPlayNavigationAlertId,
            state: alertStateRef.current,
        });

        alertStateRef.current = transition.state;

        if (transition.action === 'none') {
            return;
        }

        if (transition.action === 'show') {
            nextAutoPlayNavigationAlertId = transition.alertId + 1;
        }

        try {
            if (transition.action === 'show') {
                mapTemplate.showAlert({
                    durationMs: content.durationMs,
                    id: transition.alertId,
                    image: AUTO_PLAY_NAVIGATION_ALERT_IMAGE,
                    onDidDismiss: () =>
                        handleAlertDismissed(transition.alertId),
                    primaryAction: {
                        onPress: () => handleAlertDismissed(transition.alertId),
                        title: AUTO_PLAY_NAVIGATION_ALERT_ACTION_TITLE,
                    },
                    priority: content.priority,
                    subtitle: { text: content.subtitle },
                    title: makeAutoPlayNavigationAlertTitle(content),
                });
            } else if (transition.action === 'update') {
                mapTemplate.updateAlert(
                    transition.alertId,
                    makeAutoPlayNavigationAlertTitle(content),
                    { text: content.subtitle },
                );
            } else {
                mapTemplate.dismissAlert(transition.alertId);
            }
        } catch {
            // The host refuses alerts while a non-navigation template owns the
            // screen. Drop the announcement and let the next approach retry
            // rather than tearing the map surface down.
            alertStateRef.current = null;
        }
    }, [
        dismissalRevision,
        enabled,
        handleAlertDismissed,
        mapTemplate,
        upcomingAlerts,
    ]);
}
