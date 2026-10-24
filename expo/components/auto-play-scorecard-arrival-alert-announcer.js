import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAutoPlayMapTemplate } from './auto-play-navigation-alert-announcer';
import { createAutoPlayScorecardArrivalAlertController } from './auto-play-scorecard-arrival-alert';
import {
    getScorecardRuntimeSnapshot,
    initializeScorecardRuntime,
    subscribeScorecardRuntime,
} from './scorecard/scorecard-runtime-instance';

const AUTO_PLAY_SCORECARD_ARRIVAL_ALERT_DURATION_MS = 10000;
const AUTO_PLAY_SCORECARD_ARRIVAL_ALERT_IMAGE = {
    backgroundColor: 'transparent',
    color: 'default',
    name: 'flag-checkered',
    type: 'glyph',
};
let nextAutoPlayScorecardArrivalAlertId = 1000000;

function dismissScorecardArrivalAlert(mapTemplate, alertId) {
    try {
        mapTemplate.dismissAlert(alertId);
    } catch {
        // A disconnected host has no scorecard alert left to dismiss.
    }
}

export function useAutoPlayScorecardArrivalAlert({ enabled }) {
    const mapTemplate = useAutoPlayMapTemplate();
    const scorecardSnapshot = useSyncExternalStore(
        subscribeScorecardRuntime,
        getScorecardRuntimeSnapshot,
        getScorecardRuntimeSnapshot,
    );
    const alertControllerRef = useRef(null);

    useEffect(() => {
        void initializeScorecardRuntime().catch(() => {});
    }, []);

    useEffect(() => {
        if (!scorecardSnapshot.isHydrated) {
            return;
        }

        if (!alertControllerRef.current) {
            alertControllerRef.current =
                createAutoPlayScorecardArrivalAlertController(
                    scorecardSnapshot,
                );

            return;
        }

        if (!enabled || !mapTemplate) {
            return;
        }

        const content = alertControllerRef.current.consume(scorecardSnapshot);

        if (!content) {
            return;
        }

        const alertId = nextAutoPlayScorecardArrivalAlertId++;

        try {
            mapTemplate.showAlert({
                durationMs: AUTO_PLAY_SCORECARD_ARRIVAL_ALERT_DURATION_MS,
                id: alertId,
                image: AUTO_PLAY_SCORECARD_ARRIVAL_ALERT_IMAGE,
                onDidDismiss: () => {},
                primaryAction: {
                    onPress: () =>
                        dismissScorecardArrivalAlert(mapTemplate, alertId),
                    title: 'Dismiss',
                },
                subtitle: { text: content.subtitle },
                title: { text: content.title },
            });
        } catch {
            // The host may reject an alert while a non-map template is active.
        }
    }, [enabled, mapTemplate, scorecardSnapshot]);
}
