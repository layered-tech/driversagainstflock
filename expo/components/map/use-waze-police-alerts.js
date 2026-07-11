import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
    POLICE_ALERTS_REFETCH_DISTANCE_METERS,
    POLICE_ALERTS_REFRESH_INTERVAL_MS,
    POLICE_ALERTS_STALE_CHECK_INTERVAL_MS,
} from './constants';
import { getCoordinateDistanceMeters, getStoredNumber } from './geo';
import { getWazePoliceAlerts } from './waze-alerts-api';

const EMPTY_POLICE_ALERTS = Object.freeze([]);

// Module-level store so the phone map and the Android Auto surface share one
// polling cadence and alert list instead of each fetching the metered Waze
// alerts API on its own.
const sharedPoliceAlertsState = {
    alerts: EMPTY_POLICE_ALERTS,
    fetchCenter: null,
    fetchedAt: 0,
    inFlightPromise: null,
};
const policeAlertsListeners = new Set();

function notifyPoliceAlertsListeners() {
    policeAlertsListeners.forEach((listener) =>
        listener(sharedPoliceAlertsState.alerts),
    );
}

function getPoliceAlertsCenter(location) {
    const latitude = getStoredNumber(location?.latitude);
    const longitude = getStoredNumber(location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return { latitude, longitude };
}

function sharedPoliceAlertsAreFresh(center) {
    const { fetchCenter, fetchedAt } = sharedPoliceAlertsState;

    if (!fetchedAt || !fetchCenter) {
        return false;
    }

    if (Date.now() - fetchedAt >= POLICE_ALERTS_REFRESH_INTERVAL_MS) {
        return false;
    }

    const distanceMeters = getCoordinateDistanceMeters(
        [fetchCenter.longitude, fetchCenter.latitude],
        [center.longitude, center.latitude],
    );

    return distanceMeters < POLICE_ALERTS_REFETCH_DISTANCE_METERS;
}

function refreshSharedPoliceAlerts(center) {
    if (sharedPoliceAlertsState.inFlightPromise) {
        return sharedPoliceAlertsState.inFlightPromise;
    }

    sharedPoliceAlertsState.inFlightPromise = (async () => {
        try {
            const policeAlerts = await getWazePoliceAlerts({
                location: center,
            });

            sharedPoliceAlertsState.alerts = policeAlerts.length
                ? policeAlerts
                : EMPTY_POLICE_ALERTS;
            sharedPoliceAlertsState.fetchCenter = center;
            sharedPoliceAlertsState.fetchedAt = Date.now();
            notifyPoliceAlertsListeners();
        } catch {
            // Police alerts are a passive overlay; failures already leave an API
            // breadcrumb and the previous alerts stay on the map until a retry.
        } finally {
            sharedPoliceAlertsState.inFlightPromise = null;
        }
    })();

    return sharedPoliceAlertsState.inFlightPromise;
}

export function useWazePoliceAlerts({ policeAlertsAreEnabled, userLocation }) {
    const [policeAlerts, setPoliceAlerts] = useState(
        policeAlertsAreEnabled
            ? sharedPoliceAlertsState.alerts
            : EMPTY_POLICE_ALERTS,
    );
    const centerRef = useRef(getPoliceAlertsCenter(userLocation));
    const latitude = getStoredNumber(userLocation?.latitude);
    const longitude = getStoredNumber(userLocation?.longitude);

    const refreshPoliceAlertsIfStale = useCallback(() => {
        if (AppState.currentState !== 'active') {
            return;
        }

        const center = centerRef.current;

        if (!center || sharedPoliceAlertsAreFresh(center)) {
            return;
        }

        refreshSharedPoliceAlerts(center);
    }, []);

    useEffect(() => {
        centerRef.current = getPoliceAlertsCenter({ latitude, longitude });

        if (policeAlertsAreEnabled) {
            refreshPoliceAlertsIfStale();
        }
    }, [
        latitude,
        longitude,
        policeAlertsAreEnabled,
        refreshPoliceAlertsIfStale,
    ]);

    useEffect(() => {
        if (!policeAlertsAreEnabled) {
            setPoliceAlerts(EMPTY_POLICE_ALERTS);

            return undefined;
        }

        setPoliceAlerts(sharedPoliceAlertsState.alerts);
        policeAlertsListeners.add(setPoliceAlerts);

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
            policeAlertsListeners.delete(setPoliceAlerts);
            clearInterval(intervalId);
            appStateSubscription.remove();
        };
    }, [policeAlertsAreEnabled, refreshPoliceAlertsIfStale]);

    return { policeAlerts };
}
