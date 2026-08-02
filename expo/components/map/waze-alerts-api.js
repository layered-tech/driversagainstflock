import { fetch as expoFetch } from 'expo/fetch';
import { addSentryBreadcrumb } from '../../lib/sentry';
import { runAbortableOperation } from './abortable-operation';
import {
    getMockWazePoliceAlerts,
    mapApiMocksAreEnabled,
    mockWazePoliceAlertsAreEnabled,
} from './api-mocks';
import { buildApiURL } from './config';
import { EMPTY_FEATURE_COLLECTION } from './constants';
import { getStoredNumber, normalizeLongitude } from './geo';

export function normalizeWazePoliceAlert(alert, index) {
    const latitude = getStoredNumber(alert?.latitude);
    const longitude = getStoredNumber(alert?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return {
        city: typeof alert?.city === 'string' ? alert.city : '',
        confidence: getStoredNumber(alert?.confidence),
        coordinate: [normalizeLongitude(longitude), latitude],
        id: String(alert?.id ?? `police-alert-${index}`),
        numThumbsUp: getStoredNumber(alert?.num_thumbs_up) ?? 0,
        publishedAt:
            typeof alert?.published_at === 'string' ? alert.published_at : null,
        reliability: getStoredNumber(alert?.reliability),
        street: typeof alert?.street === 'string' ? alert.street : '',
        subtype: typeof alert?.subtype === 'string' ? alert.subtype : '',
    };
}

function normalizeWazePoliceAlerts(alerts) {
    if (!Array.isArray(alerts)) {
        return [];
    }

    return alerts.map(normalizeWazePoliceAlert).filter(Boolean);
}

async function readPoliceAlertsResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
        throw new Error(
            data?.error ||
                data?.message ||
                'Police alerts could not be loaded.',
        );
    }

    return normalizeWazePoliceAlerts(data?.result?.alerts);
}

export async function getWazePoliceAlerts({ location, signal } = {}) {
    const latitude = getStoredNumber(location?.latitude);
    const longitude = getStoredNumber(location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return [];
    }

    if (mapApiMocksAreEnabled() || mockWazePoliceAlertsAreEnabled()) {
        const mockAlerts = await getMockWazePoliceAlerts({
            center: { latitude, longitude },
            signal,
        });

        return normalizeWazePoliceAlerts(mockAlerts);
    }

    addSentryBreadcrumb({
        category: 'map.police_alerts',
        message: 'Police alerts requested',
    });

    try {
        const policeAlerts = await runAbortableOperation(async () => {
            const response = await expoFetch(
                buildApiURL('v1/police-alerts', {
                    latitude,
                    longitude: normalizeLongitude(longitude),
                }),
                {
                    headers: {
                        Accept: 'application/json',
                    },
                    signal,
                },
            );

            return readPoliceAlertsResponse(response);
        }, signal);

        addSentryBreadcrumb({
            category: 'map.police_alerts',
            data: {
                resultCount: policeAlerts.length,
            },
            message: 'Police alerts loaded',
        });

        return policeAlerts;
    } catch (error) {
        const requestWasAborted =
            signal?.aborted === true || error?.name === 'AbortError';

        if (!requestWasAborted) {
            addSentryBreadcrumb({
                category: 'api',
                data: {
                    errorMessage: error?.message,
                    operation: 'Police alerts',
                },
                level: 'error',
                message: 'Police alerts failed',
            });
        }

        throw error;
    }
}

export function makeWazePoliceAlertFeatureCollection(policeAlerts) {
    if (!Array.isArray(policeAlerts)) {
        return EMPTY_FEATURE_COLLECTION;
    }

    const features = policeAlerts
        .map((policeAlert) => {
            if (!Array.isArray(policeAlert?.coordinate)) {
                return null;
            }

            return {
                type: 'Feature',
                id: policeAlert.id,
                geometry: {
                    type: 'Point',
                    coordinates: policeAlert.coordinate,
                },
                properties: {
                    numThumbsUp: policeAlert.numThumbsUp,
                    policeAlertId: String(policeAlert.id),
                    publishedAt: policeAlert.publishedAt,
                    reliability: policeAlert.reliability,
                    street: policeAlert.street,
                    subtype: policeAlert.subtype,
                },
            };
        })
        .filter(Boolean);

    return features.length
        ? {
              type: 'FeatureCollection',
              features,
          }
        : EMPTY_FEATURE_COLLECTION;
}
