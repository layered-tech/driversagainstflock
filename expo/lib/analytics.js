import {
    getAnalytics,
    logEvent as firebaseLogEvent,
    setAnalyticsCollectionEnabled as firebaseSetAnalyticsCollectionEnabled,
    setUserId as firebaseSetUserId,
    setUserProperties as firebaseSetUserProperties,
} from '@react-native-firebase/analytics';

import { sanitizeDiagnosticValue } from './diagnostic-privacy';
import { getFirebaseApp } from './firebase';
import { getPrivacySafeMonitoringPathname } from './privacy-routes';

const ANALYTICS_DISABLED_VALUE = '0';

let analyticsInstancePromise = null;

function analyticsIsEnabled() {
    return (
        process.env.EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED !==
        ANALYTICS_DISABLED_VALUE
    );
}

function warnAnalyticsError(error) {
    if (__DEV__) {
        console.warn('Firebase Analytics call failed.', error);
    }
}

function getCleanAnalyticsParams(params) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
        return undefined;
    }

    const entries = Object.entries(params).flatMap(([key, value]) => {
        if (value === null || value === undefined || value === '') {
            return [];
        }

        if (typeof value === 'boolean') {
            return [[key, value ? 1 : 0]];
        }

        if (typeof value === 'number' || typeof value === 'string') {
            return [[key, value]];
        }

        return [];
    });

    return entries.length ? Object.fromEntries(entries) : undefined;
}

async function getAnalyticsInstance() {
    if (!analyticsIsEnabled()) {
        return null;
    }

    if (!analyticsInstancePromise) {
        analyticsInstancePromise = getFirebaseApp()
            .then(async (firebaseApp) => {
                if (!firebaseApp) {
                    analyticsInstancePromise = null;
                    return null;
                }

                const analytics = getAnalytics(firebaseApp);
                // Clear legacy account IDs before any app-managed event can run.
                await firebaseSetUserId(analytics, null);
                return analytics;
            })
            .catch((error) => {
                analyticsInstancePromise = null;
                warnAnalyticsError(error);

                return null;
            });
    }

    return analyticsInstancePromise;
}

export async function initializeAnalytics() {
    await getAnalyticsInstance();
}

export function getAnalyticsScreenName(pathname) {
    if (!pathname || pathname === '/') {
        return 'Home';
    }

    return getPrivacySafeMonitoringPathname(pathname)
        .split('/')
        .filter(Boolean)
        .map((segment) =>
            segment
                .replace(/^\((.*)\)$/, '$1')
                .replace(/^\[(.*)\]$/, '$1')
                .replace(/[-_]+/g, ' ')
                .replace(/\b\w/g, (character) => character.toUpperCase()),
        )
        .join(' / ');
}

export async function logAnalyticsEvent(name, params) {
    try {
        const analytics = await getAnalyticsInstance();

        if (!analytics) {
            return;
        }

        await firebaseLogEvent(
            analytics,
            name,
            getCleanAnalyticsParams(sanitizeDiagnosticValue(params)),
        );
    } catch (error) {
        warnAnalyticsError(error);
    }
}

export async function logAnalyticsScreenView(pathname) {
    const screenName = getAnalyticsScreenName(pathname);

    try {
        const analytics = await getAnalyticsInstance();

        if (!analytics) {
            return;
        }

        await firebaseLogEvent(analytics, 'screen_view', {
            screen_class: screenName,
            screen_name: screenName,
        });
    } catch (error) {
        warnAnalyticsError(error);
    }
}

export async function setAnalyticsCollectionEnabled(enabled) {
    try {
        const analytics = await getAnalyticsInstance();

        if (!analytics) {
            return;
        }

        await firebaseSetAnalyticsCollectionEnabled(
            analytics,
            Boolean(enabled),
        );
    } catch (error) {
        warnAnalyticsError(error);
    }
}

export async function setAnalyticsAuthProvider(isSignedInToOpenStreetMap) {
    try {
        const analytics = await getAnalyticsInstance();

        if (!analytics) {
            return;
        }

        await firebaseSetUserProperties(analytics, {
            auth_provider:
                isSignedInToOpenStreetMap === true ? 'openstreetmap' : null,
        });
    } catch (error) {
        warnAnalyticsError(error);
    }
}
