import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    BACKGROUND_ALERT_FETCH_TIMEOUT_MS,
    BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
} from './background-alert-budget';
import {
    POLICE_ALERTS_REFETCH_DISTANCE_METERS,
    POLICE_ALERTS_REFRESH_INTERVAL_MS,
} from './constants';
import { createDurableAlertStore } from './durable-alert-store';
import { getCoordinateDistanceMeters, getStoredNumber } from './geo';
import { getWazePoliceAlerts } from './waze-alerts-api';

const WAZE_POLICE_ALERTS_STORAGE_KEY =
    'driversagainstflock.wazePoliceAlertsSnapshot.v1';

export const EMPTY_WAZE_POLICE_ALERTS = Object.freeze([]);

export function getWazePoliceAlertsCenter(location) {
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

function normalizeWazePoliceAlert(alert, index) {
    const coordinateCenter = getWazePoliceAlertsCenter({
        latitude: alert?.coordinate?.[1],
        longitude: alert?.coordinate?.[0],
    });

    if (!coordinateCenter) {
        return null;
    }

    return {
        city: typeof alert.city === 'string' ? alert.city : '',
        confidence: getStoredNumber(alert.confidence),
        coordinate: [coordinateCenter.longitude, coordinateCenter.latitude],
        id: String(alert.id ?? `police-alert-${index}`),
        numThumbsUp: getStoredNumber(alert.numThumbsUp) ?? 0,
        publishedAt:
            typeof alert.publishedAt === 'string' ? alert.publishedAt : null,
        reliability: getStoredNumber(alert.reliability),
        street: typeof alert.street === 'string' ? alert.street : '',
        subtype: typeof alert.subtype === 'string' ? alert.subtype : '',
    };
}

function normalizeWazePoliceAlerts(alerts) {
    if (!Array.isArray(alerts)) {
        return null;
    }

    const normalizedAlerts = alerts.map(normalizeWazePoliceAlert);

    if (normalizedAlerts.some((alert) => alert === null)) {
        return null;
    }

    return normalizedAlerts.length
        ? normalizedAlerts
        : EMPTY_WAZE_POLICE_ALERTS;
}

function normalizeWazePoliceAlertsInput(input) {
    return getWazePoliceAlertsCenter(input);
}

function normalizeWazePoliceAlertsMetadata(metadata) {
    const fetchCenter = getWazePoliceAlertsCenter(metadata?.fetchCenter);

    return fetchCenter ? { fetchCenter } : null;
}

function sharedPoliceAlertsAreFresh(state, center, now) {
    const fetchCenter = state.metadata?.fetchCenter;

    if (!state.fetchedAt || !fetchCenter) {
        return false;
    }

    if (now - state.fetchedAt >= POLICE_ALERTS_REFRESH_INTERVAL_MS) {
        return false;
    }

    const distanceMeters = getCoordinateDistanceMeters(
        [fetchCenter.longitude, fetchCenter.latitude],
        [center.longitude, center.latitude],
    );

    return (
        distanceMeters !== null &&
        distanceMeters < POLICE_ALERTS_REFETCH_DISTANCE_METERS
    );
}

function policeAlertInputsAreEquivalent(firstCenter, secondCenter) {
    const distanceMeters = getCoordinateDistanceMeters(
        [firstCenter.longitude, firstCenter.latitude],
        [secondCenter.longitude, secondCenter.latitude],
    );

    return (
        distanceMeters !== null &&
        distanceMeters < POLICE_ALERTS_REFETCH_DISTANCE_METERS
    );
}

const wazePoliceAlertStore = createDurableAlertStore({
    emptyItems: EMPTY_WAZE_POLICE_ALERTS,
    fetchItems: (center, signal) =>
        getWazePoliceAlerts({ location: center, signal }),
    getMetadataForInput: (center) => ({ fetchCenter: center }),
    inputsAreEquivalent: policeAlertInputsAreEquivalent,
    isFresh: sharedPoliceAlertsAreFresh,
    normalizeInput: normalizeWazePoliceAlertsInput,
    normalizeItems: normalizeWazePoliceAlerts,
    normalizeMetadata: normalizeWazePoliceAlertsMetadata,
    storage: AsyncStorage,
    storageKey: WAZE_POLICE_ALERTS_STORAGE_KEY,
    storageTimeoutMs: BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
    timeoutMs: BACKGROUND_ALERT_FETCH_TIMEOUT_MS,
});

export function addWazePoliceAlertsListener(listener) {
    return wazePoliceAlertStore.addListener(listener);
}

export function getSharedWazePoliceAlerts() {
    return wazePoliceAlertStore.getItems();
}

export function hydrateWazePoliceAlerts() {
    return wazePoliceAlertStore.hydrate();
}

export function sharedWazePoliceAlertsNeedRefresh(center) {
    return wazePoliceAlertStore.needsRefresh(center);
}

export function refreshWazePoliceAlertsIfStale(center) {
    return wazePoliceAlertStore.refreshIfStale(center);
}
