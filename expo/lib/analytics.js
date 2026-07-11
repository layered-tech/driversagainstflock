import {
    getAnalytics,
    logEvent as firebaseLogEvent,
    logScreenView as firebaseLogScreenView,
    setAnalyticsCollectionEnabled as firebaseSetAnalyticsCollectionEnabled,
    setUserId as firebaseSetUserId,
    setUserProperties as firebaseSetUserProperties,
} from '@react-native-firebase/analytics';

import { getFirebaseApp } from './firebase';

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
            .then((firebaseApp) =>
                firebaseApp ? getAnalytics(firebaseApp) : null,
            )
            .catch((error) => {
                analyticsInstancePromise = null;
                warnAnalyticsError(error);

                return null;
            });
    }

    return analyticsInstancePromise;
}

export function getAnalyticsScreenName(pathname) {
    if (!pathname || pathname === '/') {
        return 'Home';
    }

    return pathname
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
            getCleanAnalyticsParams(params),
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

        await firebaseLogScreenView(analytics, {
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

export async function setAnalyticsUser(user) {
    try {
        const analytics = await getAnalyticsInstance();

        if (!analytics) {
            return;
        }

        await firebaseSetUserId(analytics, user?.id ? String(user.id) : null);

        await firebaseSetUserProperties(analytics, {
            auth_provider: user?.provider ? String(user.provider) : null,
        });
    } catch (error) {
        warnAnalyticsError(error);
    }
}
