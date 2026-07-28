import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    BACKGROUND_ALERT_STORAGE_RETRY_DELAY_MS,
    BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
} from './background-alert-budget';
import { MAP_PREFERENCES_STORAGE_KEY } from './constants';
import { getSelectedDirectionsRouteOption } from './directions';
import {
    getDirectionsRouteCoordinatesAhead,
    getElectronicHorizonPrimaryCoordinates,
} from './electronic-horizon';
import {
    getElectronicHorizonAlprDirectionsRoutePathKey,
    getElectronicHorizonAlprPathStateKey,
    refreshElectronicHorizonAlprNodesIfStale,
} from './electronic-horizon-alpr-store';
import {
    getStoredPoliceAlertsVisible,
    parseStoredMapPreferences,
} from './map-preferences';
import { getSharedMapPreferencesState } from './shared-map-preferences-sync';
import { getSharedRoutingStateForBackgroundAsync } from './shared-routing-state';
import {
    getWazePoliceAlertsCenter,
    refreshWazePoliceAlertsIfStale,
    sharedWazePoliceAlertsNeedRefresh,
} from './waze-police-alert-store';

let storedPoliceAlertsAreEnabledPromise = null;
let storedPoliceAlertsPreferenceHasLoaded = false;
let storedPoliceAlertsPreferenceIsEnabled = false;
let storedPoliceAlertsPreferenceRetryAt = 0;

async function settleStorageReadWithinTimeout(read, timeoutMs) {
    const readResult = Promise.resolve()
        .then(read)
        .then(
            (value) => ({ status: 'fulfilled', value }),
            () => ({ status: 'rejected', value: null }),
        );
    let timeoutId = null;
    const timeoutResult = new Promise((resolve) => {
        timeoutId = setTimeout(
            () => resolve({ status: 'timed-out', value: null }),
            timeoutMs,
        );
    });
    const result = await Promise.race([readResult, timeoutResult]);

    if (timeoutId !== null) {
        clearTimeout(timeoutId);
    }

    return result;
}

export async function settleBackgroundWorkWithinDeadlineAsync(
    work,
    deadlineMs,
) {
    const settledWork = Promise.resolve(work).then(
        () => true,
        () => true,
    );

    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
        return false;
    }

    let timeoutId = null;
    const deadline = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(false), deadlineMs);
    });
    const workFinishedBeforeDeadline = await Promise.race([
        settledWork,
        deadline,
    ]);

    if (timeoutId !== null) {
        clearTimeout(timeoutId);
    }

    return workFinishedBeforeDeadline;
}

function getDeliveredLocation(context) {
    return (
        context?.location?.coords ??
        context?.location ??
        context?.rawLocation?.coords ??
        context?.rawLocation ??
        null
    );
}

async function storedPoliceAlertsAreEnabled() {
    const sharedMapPreferences = getSharedMapPreferencesState();

    if (sharedMapPreferences.mapPreferencesAreLoaded) {
        return sharedMapPreferences.policeAlertsVisible === true;
    }

    if (storedPoliceAlertsPreferenceHasLoaded) {
        return storedPoliceAlertsPreferenceIsEnabled;
    }

    if (
        !storedPoliceAlertsAreEnabledPromise &&
        Date.now() >= storedPoliceAlertsPreferenceRetryAt
    ) {
        const currentReadPromise = Promise.resolve()
            .then(() => AsyncStorage.getItem(MAP_PREFERENCES_STORAGE_KEY))
            .then((storedValue) => {
                storedPoliceAlertsPreferenceIsEnabled =
                    getStoredPoliceAlertsVisible(
                        parseStoredMapPreferences(storedValue),
                    );
                storedPoliceAlertsPreferenceHasLoaded = true;
                storedPoliceAlertsPreferenceRetryAt = 0;

                return storedPoliceAlertsPreferenceIsEnabled;
            })
            .catch(() => {
                storedPoliceAlertsPreferenceRetryAt =
                    Date.now() + BACKGROUND_ALERT_STORAGE_RETRY_DELAY_MS;

                return false;
            })
            .finally(() => {
                if (
                    storedPoliceAlertsAreEnabledPromise === currentReadPromise
                ) {
                    storedPoliceAlertsAreEnabledPromise = null;
                }
            });

        storedPoliceAlertsAreEnabledPromise = currentReadPromise;
    }

    if (!storedPoliceAlertsAreEnabledPromise) {
        return false;
    }

    const preferenceRead = storedPoliceAlertsAreEnabledPromise;
    const readResult = await settleStorageReadWithinTimeout(
        () => preferenceRead,
        BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
    );
    const storedPreferenceIsEnabled =
        readResult.status === 'fulfilled' && readResult.value === true;
    const latestSharedMapPreferences = getSharedMapPreferencesState();

    return latestSharedMapPreferences.mapPreferencesAreLoaded
        ? latestSharedMapPreferences.policeAlertsVisible === true
        : storedPreferenceIsEnabled;
}

export async function refreshBackgroundAlertsForLocationAsync(context) {
    const deliveredLocation = getDeliveredLocation(context);
    const policeAlertsCenter = getWazePoliceAlertsCenter(deliveredLocation);
    const policeAlertsNeedRefresh =
        policeAlertsCenter &&
        sharedWazePoliceAlertsNeedRefresh(policeAlertsCenter);
    const policeAlertsAreEnabledPromise = policeAlertsNeedRefresh
        ? storedPoliceAlertsAreEnabled()
        : Promise.resolve(false);
    const sharedRoutingState = await getSharedRoutingStateForBackgroundAsync();
    const routeOption = sharedRoutingState.drivingModeIsActive
        ? getSelectedDirectionsRouteOption(sharedRoutingState.directionsRoute)
        : null;
    const activeRouteCoordinates =
        routeOption && policeAlertsCenter
            ? getDirectionsRouteCoordinatesAhead(
                  routeOption.coordinates,
                  policeAlertsCenter,
              )
            : [];
    const electronicHorizonCoordinates = getElectronicHorizonPrimaryCoordinates(
        context?.roadLookAhead,
    );
    const pathSource =
        activeRouteCoordinates.length >= 2 ? 'route' : 'electronic-horizon';
    const alprCoordinates =
        pathSource === 'route'
            ? activeRouteCoordinates
            : electronicHorizonCoordinates;
    const work = [];
    const alprRefresh = refreshElectronicHorizonAlprNodesIfStale({
        coordinates: alprCoordinates,
        primaryPathKey: getElectronicHorizonAlprPathStateKey({
            coordinates: alprCoordinates,
            electronicHorizon: context?.roadLookAhead,
            pathSource,
            routePathKey:
                getElectronicHorizonAlprDirectionsRoutePathKey(routeOption),
        }),
    });

    if (alprRefresh) {
        work.push(alprRefresh);
    }

    if (policeAlertsNeedRefresh && (await policeAlertsAreEnabledPromise)) {
        const policeAlertsRefresh =
            refreshWazePoliceAlertsIfStale(policeAlertsCenter);

        if (policeAlertsRefresh) {
            work.push(policeAlertsRefresh);
        }
    }

    await Promise.allSettled(work);
}
