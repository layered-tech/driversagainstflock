import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    AUTO_PLAY_NAVIGATION_ALERT_ACTION_TITLE,
    AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS,
    AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR,
    createAutoPlayNavigationAlertSuppressionController,
    getAutoPlayNavigationAlertContent,
    getAutoPlayNavigationAlertDismissedState,
    getAutoPlayNavigationAlertTransition,
} from './auto-play-navigation-alert';
import {
    presenceCoordinator,
    startPresenceRuntime,
} from './map/alpr-presence-runtime';
import {
    buildUpcomingAlertDebugSnapshot,
    upcomingAlertDebugStore,
} from './map/upcoming-alert-debug';
import {
    addUpcomingAlertDebugResetListener,
    startUpcomingAlertDebug,
} from './map/upcoming-alert-debug-runtime';

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

function getActiveAutoPlayNavigationAlertKey(state, now = Date.now()) {
    return state?.isVisible && now < state.expiresAt ? state.alertKey : null;
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
    debugOwner = false,
    debugContext = {},
    enabled,
    upcomingAlerts,
    userLocation,
}) {
    const mapTemplate = useAutoPlayMapTemplate();
    const debugContextRef = useRef(debugContext);
    debugContextRef.current = debugContext;
    const debugEvent = useCallback(
        (event, alertId = null) => {
            if (debugOwner) upcomingAlertDebugStore.event(event, alertId);
        },
        [debugOwner],
    );
    const alertStateRef = useRef(null);
    const followUpTimerRef = useRef(null);
    const pendingPresentationRef = useRef(null);
    const currentSpeedMpsRef = useRef(currentSpeedMps);
    const [dismissalRevision, setDismissalRevision] = useState(0);
    const [historyRevision, setHistoryRevision] = useState(0);
    const [suppressionRevision, setSuppressionRevision] = useState(0);
    const suppressionControllerRef = useRef(null);
    if (!suppressionControllerRef.current) {
        suppressionControllerRef.current =
            createAutoPlayNavigationAlertSuppressionController(() =>
                setSuppressionRevision((revision) => revision + 1),
            );
    }
    const handleAlertDismissed = useCallback((alertId) => {
        const nextState = getAutoPlayNavigationAlertDismissedState(
            alertStateRef.current,
            alertId,
            Date.now(),
        );

        if (nextState === alertStateRef.current) return;

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
    const acceptPendingPresentation = useCallback(
        (presentation) => {
            if (presentation.status === 'accepted') return true;
            if (
                presentation.status !== 'pending' ||
                pendingPresentationRef.current !== presentation
            ) {
                return false;
            }

            presentation.status = 'accepted';
            debugEvent(
                'Host onWillShow callback; visibility not verified',
                presentation.alertId,
            );
            pendingPresentationRef.current = null;
            clearTimeout(presentation.timeoutId);
            return presentation.claim.commit();
        },
        [debugEvent],
    );
    const releasePendingPresentation = useCallback(
        (presentation = pendingPresentationRef.current) => {
            if (
                !presentation ||
                presentation.status !== 'pending' ||
                pendingPresentationRef.current !== presentation
            ) {
                return false;
            }

            presentation.status = 'refused';
            pendingPresentationRef.current = null;
            clearTimeout(presentation.timeoutId);
            return presentation.claim.release();
        },
        [],
    );

    useEffect(() => {
        if (!debugOwner) return;
        startUpcomingAlertDebug();
        let enabled = upcomingAlertDebugStore.getSnapshot().enabled;
        return upcomingAlertDebugStore.subscribe(() => {
            const next = upcomingAlertDebugStore.getSnapshot().enabled;
            if (next === enabled) return;
            enabled = next;
            setHistoryRevision((revision) => revision + 1);
        });
    }, [debugOwner]);

    useEffect(() => {
        let active = true;
        startPresenceRuntime();
        const unsubscribe = presenceCoordinator.subscribe(() => {
            if (active) {
                setHistoryRevision((revision) => revision + 1);
            }
        });
        void presenceCoordinator.hydrate().then(() => {
            if (active) {
                setHistoryRevision((revision) => revision + 1);
            }
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    useEffect(
        () => () => {
            clearTimeout(followUpTimerRef.current);
            releasePendingPresentation();
            suppressionControllerRef.current.reset({ notify: false });
        },
        [releasePendingPresentation],
    );

    const clearCurrentAlert = useCallback(() => {
        clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = null;
        releasePendingPresentation();
        const transition = getAutoPlayNavigationAlertTransition({
            content: null,
            nextAlertId: nextAutoPlayNavigationAlertId,
            state: alertStateRef.current,
            suppressed: true,
        });
        alertStateRef.current = transition.state;

        if (transition.action !== 'dismiss' || !mapTemplate) return;
        try {
            mapTemplate.dismissAlert(transition.alertId);
        } catch {
            // A stale or disconnected host has no upcoming banner to clear.
        }
    }, [mapTemplate, releasePendingPresentation]);
    useEffect(
        () => addUpcomingAlertDebugResetListener(clearCurrentAlert),
        [clearCurrentAlert],
    );
    const acquireSuppression = useCallback(
        () => suppressionControllerRef.current.acquire(clearCurrentAlert),
        [clearCurrentAlert],
    );

    // Speed only feeds the banner duration, which is read once per
    // announcement. Keeping it in a ref stops every GPS tick from re-running
    // the effect for a value that cannot change an already-visible banner.
    currentSpeedMpsRef.current = currentSpeedMps;

    useEffect(() => {
        if (!mapTemplate) {
            if (debugOwner)
                upcomingAlertDebugStore.record(() =>
                    buildUpcomingAlertDebugSnapshot({
                        ...debugContextRef.current,
                        enabled,
                        hasTemplate: false,
                        upcomingAlerts,
                        userLocation,
                        alertHistory:
                            presenceCoordinator.automotiveAlertHistory,
                    }),
                );
            alertStateRef.current = null;
            releasePendingPresentation();
            clearTimeout(followUpTimerRef.current);
            followUpTimerRef.current = null;
            suppressionControllerRef.current.reset();

            return;
        }

        const now = Date.now();
        const currentAlertKey = getActiveAutoPlayNavigationAlertKey(
            alertStateRef.current,
            now,
        );

        const content = enabled
            ? getAutoPlayNavigationAlertContent({
                  alertHistory: presenceCoordinator.automotiveAlertHistory,
                  currentSpeedMps: currentSpeedMpsRef.current,
                  currentAlertKey,
                  now,
                  upcomingAlerts,
                  userLocation,
              })
            : null;
        const transition = getAutoPlayNavigationAlertTransition({
            content,
            nextAlertId: nextAutoPlayNavigationAlertId,
            now,
            state: alertStateRef.current,
            suppressed: suppressionControllerRef.current.active,
        });

        if (debugOwner)
            upcomingAlertDebugStore.record(() =>
                buildUpcomingAlertDebugSnapshot({
                    ...debugContextRef.current,
                    enabled,
                    hasTemplate: true,
                    suppressed: suppressionControllerRef.current.active,
                    upcomingAlerts,
                    userLocation,
                    alertHistory: presenceCoordinator.automotiveAlertHistory,
                    currentAlertKey,
                    content,
                    transition,
                }),
            );
        alertStateRef.current = transition.state;

        if (transition.action === 'none') {
            return;
        }

        if (transition.action === 'show') {
            nextAutoPlayNavigationAlertId = transition.alertId + 1;
            releasePendingPresentation();
        } else if (transition.action === 'dismiss') {
            releasePendingPresentation();
        }

        const historyClaim =
            transition.action === 'show'
                ? presenceCoordinator.claimAutomotiveAlert(content.historyEntry)
                : null;

        if (transition.action === 'show' && !historyClaim) {
            debugEvent('Warning history claim refused', transition.alertId);
            alertStateRef.current = null;
            return;
        }

        const presentation = historyClaim
            ? {
                  alertId: transition.alertId,
                  claim: historyClaim,
                  status: 'pending',
                  timeoutId: null,
              }
            : null;

        if (presentation) {
            pendingPresentationRef.current = presentation;
            presentation.timeoutId = setTimeout(() => {
                if (!releasePendingPresentation(presentation)) return;
                debugEvent(
                    'No host callback within 1 second; claim released',
                    transition.alertId,
                );
                if (alertStateRef.current?.alertId === transition.alertId) {
                    alertStateRef.current = null;
                }
            }, 1000);
        }

        try {
            if (transition.action === 'show') {
                debugEvent('Submitting banner to host', transition.alertId);
                mapTemplate.showAlert({
                    durationMs: content.durationMs,
                    id: transition.alertId,
                    image: AUTO_PLAY_NAVIGATION_ALERT_IMAGE,
                    onDidDismiss: (reason) => {
                        releasePendingPresentation(presentation);
                        debugEvent(
                            `Host dismissed banner: ${['timeout', 'user', 'system'].includes(reason) ? reason : 'unknown'}`,
                            transition.alertId,
                        );
                        handleAlertDismissed(transition.alertId);
                    },
                    onWillShow: () => {
                        if (acceptPendingPresentation(presentation)) return;
                        try {
                            mapTemplate.dismissAlert(transition.alertId);
                        } catch {
                            // A late host callback may arrive after disconnect.
                        }
                    },
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
            releasePendingPresentation(presentation);
            debugEvent('Host call threw; claim released', transition.alertId);
            // The host refuses alerts while a non-navigation template owns the
            // screen. Drop the announcement and let the next approach retry
            // rather than tearing the map surface down.
            alertStateRef.current = null;
        }
    }, [
        dismissalRevision,
        debugOwner,
        debugEvent,
        enabled,
        acceptPendingPresentation,
        handleAlertDismissed,
        historyRevision,
        mapTemplate,
        releasePendingPresentation,
        suppressionRevision,
        upcomingAlerts,
        userLocation,
    ]);

    return {
        acquireSuppression,
        hasEligibleAlert:
            enabled &&
            Boolean(
                getAutoPlayNavigationAlertContent({
                    alertHistory: presenceCoordinator.automotiveAlertHistory,
                    currentAlertKey: getActiveAutoPlayNavigationAlertKey(
                        alertStateRef.current,
                    ),
                    currentSpeedMps: currentSpeedMpsRef.current,
                    upcomingAlerts,
                    userLocation,
                }),
            ),
        isSuppressed: suppressionControllerRef.current.active,
    };
}
