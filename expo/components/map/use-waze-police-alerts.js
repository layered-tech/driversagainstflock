import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMockWazePoliceAlertsEnabled } from './api-mocks';
import { POLICE_ALERTS_STALE_CHECK_INTERVAL_MS } from './constants';
import { getStoredNumber } from './geo';
import { shouldRefreshLocationData } from './location-watch-options';
import { usePersistentRoadMatchingWatchIsActive } from './use-device-location';
import {
    addWazePoliceAlertsListener,
    EMPTY_WAZE_POLICE_ALERTS,
    getSharedWazePoliceAlerts,
    getWazePoliceAlertsCenter,
    hydrateWazePoliceAlerts,
    invalidateWazePoliceAlerts,
    refreshWazePoliceAlertsIfStale,
} from './waze-police-alert-store';

export function useWazePoliceAlerts({ policeAlertsAreEnabled, userLocation }) {
    const mockWazePoliceAlertsEnabled = useMockWazePoliceAlertsEnabled();
    const persistentRoadMatchingWatchIsActive =
        usePersistentRoadMatchingWatchIsActive();
    const [policeAlerts, setPoliceAlerts] = useState(
        policeAlertsAreEnabled
            ? getSharedWazePoliceAlerts()
            : EMPTY_WAZE_POLICE_ALERTS,
    );
    const currentCenter = getWazePoliceAlertsCenter(userLocation);
    const centerRef = useRef(currentCenter);
    const latitude = getStoredNumber(userLocation?.latitude);
    const longitude = getStoredNumber(userLocation?.longitude);

    centerRef.current = currentCenter;

    useEffect(() => {
        invalidateWazePoliceAlerts();
    }, [mockWazePoliceAlertsEnabled]);

    const refreshPoliceAlertsIfStale = useCallback(() => {
        if (
            !policeAlertsAreEnabled ||
            !shouldRefreshLocationData({
                appState: AppState.currentState,
                persistentRoadMatchingWatchIsActive,
            })
        ) {
            return;
        }

        const center = centerRef.current;

        if (!center) {
            return;
        }

        return refreshWazePoliceAlertsIfStale(center);
    }, [
        mockWazePoliceAlertsEnabled,
        persistentRoadMatchingWatchIsActive,
        policeAlertsAreEnabled,
    ]);

    useEffect(() => {
        if (policeAlertsAreEnabled) {
            refreshPoliceAlertsIfStale();
        }
    }, [
        latitude,
        longitude,
        mockWazePoliceAlertsEnabled,
        policeAlertsAreEnabled,
        refreshPoliceAlertsIfStale,
    ]);

    useEffect(() => {
        if (!policeAlertsAreEnabled) {
            setPoliceAlerts(EMPTY_WAZE_POLICE_ALERTS);

            return undefined;
        }

        setPoliceAlerts(getSharedWazePoliceAlerts());
        const policeAlertsSubscription =
            addWazePoliceAlertsListener(setPoliceAlerts);

        void hydrateWazePoliceAlerts();

        const intervalId = setInterval(
            refreshPoliceAlertsIfStale,
            POLICE_ALERTS_STALE_CHECK_INTERVAL_MS,
        );
        const appStateSubscription = AppState.addEventListener(
            'change',
            (appState) => {
                if (appState === 'active') {
                    refreshPoliceAlertsIfStale();
                }
            },
        );

        refreshPoliceAlertsIfStale();

        return () => {
            policeAlertsSubscription.remove();
            clearInterval(intervalId);
            appStateSubscription.remove();
        };
    }, [
        mockWazePoliceAlertsEnabled,
        policeAlertsAreEnabled,
        refreshPoliceAlertsIfStale,
    ]);

    return { policeAlerts };
}
