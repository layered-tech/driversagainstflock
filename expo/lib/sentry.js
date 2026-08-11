import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { getApiBaseURL } from './auth/urls';
import { installNetworkErrorMonitor } from './network-error-monitor';
import {
    getPrivacySafeMonitoringPathname,
    isPrivateScorecardPath,
    redactPrivateScorecardPath,
} from './privacy-routes';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? '';
const SENTRY_ENABLED_ENV = process.env.EXPO_PUBLIC_SENTRY_ENABLED;
const APP_ENVIRONMENT =
    Constants.expoConfig?.extra?.environment ?? 'production';
const APP_VERSION =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown';
const NATIVE_BUILD_VERSION = Constants.nativeBuildVersion ?? 'unknown';
const API_BASE_URL = getApiBaseURL();
const ANDROID_AUTO_METRO_LOG_PREFIX = '[Android Auto]';
const CARPLAY_METRO_LOG_PREFIX = '[CarPlay]';
let privateScorecardRouteIsActive = false;

export const SENTRY_IS_ENABLED =
    Boolean(SENTRY_DSN) &&
    SENTRY_ENABLED_ENV !== '0' &&
    (APP_ENVIRONMENT !== 'e2e' || SENTRY_ENABLED_ENV === '1');

const sentryReactNavigationIntegration = Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: true,
    useFullPathsForNavigationRoutes: false,
});

function getSampleRate(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const sampleRate = Number(value);

    if (!Number.isFinite(sampleRate)) {
        return null;
    }

    return Math.min(1, Math.max(0, sampleRate));
}

function setInitialSentryScope() {
    Sentry.setTag('app.environment', APP_ENVIRONMENT);
    Sentry.setTag('app.version', APP_VERSION);
    Sentry.setTag('app.build', NATIVE_BUILD_VERSION);
    Sentry.setTag('api.base_url', API_BASE_URL);

    Sentry.setContext('app', {
        build: NATIVE_BUILD_VERSION,
        environment: APP_ENVIRONMENT,
        version: APP_VERSION,
    });
    Sentry.setContext('api', {
        baseUrl: API_BASE_URL,
    });
}

function beforeSend(event) {
    if (sentryEventIsPrivateScorecard(event)) {
        return null;
    }

    if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
    }

    if (typeof event.transaction === 'string') {
        event.transaction = redactPrivateScorecardPath(event.transaction);
    }

    if (typeof event.request?.url === 'string') {
        event.request.url = redactPrivateScorecardPath(event.request.url);
    }

    if (typeof event.tags?.['route.pathname'] === 'string') {
        event.tags['route.pathname'] = getPrivacySafeMonitoringPathname(
            event.tags['route.pathname'],
        );
    }

    if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs
            .map(beforeBreadcrumb)
            .filter(Boolean);
    }

    return event;
}

function sentryEventIsPrivateScorecard(event) {
    return (
        privateScorecardRouteIsActive ||
        [
            event?.transaction,
            event?.request?.url,
            event?.tags?.['route.pathname'],
        ].some(
            (value) =>
                typeof value === 'string' &&
                value.toLowerCase().includes('scorecard'),
        )
    );
}

function beforeSendTransaction(event) {
    return sentryEventIsPrivateScorecard(event) ? null : event;
}

function beforeBreadcrumb(breadcrumb) {
    let serializedBreadcrumb = '';

    try {
        serializedBreadcrumb = JSON.stringify(breadcrumb ?? {});
    } catch {
        serializedBreadcrumb = String(breadcrumb?.message ?? '');
    }

    if (serializedBreadcrumb.toLowerCase().includes('scorecard')) {
        return null;
    }

    if (breadcrumb?.category !== 'console') {
        return breadcrumb;
    }

    const consoleArguments = breadcrumb.data?.arguments;
    const firstArgument = Array.isArray(consoleArguments)
        ? String(consoleArguments[0] ?? '')
        : '';
    const message = String(breadcrumb.message ?? '');

    if (
        firstArgument.startsWith(ANDROID_AUTO_METRO_LOG_PREFIX) ||
        message.startsWith(ANDROID_AUTO_METRO_LOG_PREFIX) ||
        firstArgument.startsWith(CARPLAY_METRO_LOG_PREFIX) ||
        message.startsWith(CARPLAY_METRO_LOG_PREFIX)
    ) {
        return null;
    }

    return breadcrumb;
}

function isSentryIngestRequest(url) {
    try {
        return new URL(url).host === new URL(SENTRY_DSN).host;
    } catch {
        return false;
    }
}

function captureSentryNetworkError({ method, status, url }) {
    if (isSentryIngestRequest(url)) {
        return;
    }

    const error = new Error(`HTTP ${status} ${method} ${url}`);

    error.name = 'NetworkRequestError';

    Sentry.withScope((scope) => {
        scope.setTag('http.method', method);
        scope.setTag('http.status_code', String(status));
        scope.setTag('network.error', 'http-response');
        scope.setContext('network_request', {
            method,
            status,
            url,
        });
        Sentry.captureException(error);
    });
}

function initializeSentry() {
    if (!SENTRY_IS_ENABLED) {
        return;
    }

    const tracesSampleRate = getSampleRate(
        process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    );
    const options = {
        beforeBreadcrumb,
        beforeSend,
        beforeSendTransaction,
        debug: __DEV__ && process.env.EXPO_PUBLIC_SENTRY_DEBUG === '1',
        dsn: SENTRY_DSN,
        enableAutoSessionTracking: true,
        environment: APP_ENVIRONMENT,
        integrations: [sentryReactNavigationIntegration],
        sendDefaultPii: false,
    };

    if (tracesSampleRate !== null) {
        options.tracesSampleRate = tracesSampleRate;
    }

    Sentry.init(options);
    setInitialSentryScope();
    installNetworkErrorMonitor({ onHttpError: captureSentryNetworkError });
}

initializeSentry();

function normalizeBreadcrumbData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return undefined;
    }

    return Object.fromEntries(
        Object.entries(data)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => {
                if (
                    typeof value === 'string' ||
                    typeof value === 'number' ||
                    typeof value === 'boolean'
                ) {
                    return [key, value];
                }

                return [key, String(value)];
            }),
    );
}

export function addSentryBreadcrumb({
    category,
    data,
    level = 'info',
    message,
    type,
}) {
    if (!SENTRY_IS_ENABLED) {
        return;
    }

    Sentry.addBreadcrumb({
        category,
        data: normalizeBreadcrumbData(data),
        level,
        message,
        type,
    });
}

export function emitSentryTestError() {
    if (!SENTRY_IS_ENABLED) {
        return false;
    }

    addSentryBreadcrumb({
        category: 'debug.sentry',
        message: 'Manual Sentry test error requested',
    });
    Sentry.captureException(new Error('Manual Sentry test error'));

    return true;
}

export function triggerSentryNativeCrash() {
    if (!SENTRY_IS_ENABLED) {
        return false;
    }

    addSentryBreadcrumb({
        category: 'debug.sentry',
        level: 'fatal',
        message: 'Manual native crash requested',
    });
    Sentry.nativeCrash();

    return true;
}

export function setSentryUser(user) {
    if (!SENTRY_IS_ENABLED) {
        return;
    }

    if (!user?.id) {
        Sentry.setUser(null);
        Sentry.setTag('auth.provider', 'anonymous');
        return;
    }

    const provider = user.provider || 'user';

    Sentry.setUser({
        id: `${provider}:${user.id}`,
    });
    Sentry.setTag('auth.provider', provider);
}

export function registerSentryNavigationContainer(navigationRef) {
    if (!SENTRY_IS_ENABLED || !navigationRef) {
        return;
    }

    sentryReactNavigationIntegration.registerNavigationContainer(navigationRef);
}

export function useSentryRouteTracking() {
    const pathname = usePathname();
    const previousPathnameRef = useRef(null);

    privateScorecardRouteIsActive = isPrivateScorecardPath(pathname);

    useEffect(() => {
        if (!SENTRY_IS_ENABLED || !pathname) {
            return;
        }

        if (isPrivateScorecardPath(pathname)) {
            previousPathnameRef.current = null;

            return;
        }

        const safePathname = getPrivacySafeMonitoringPathname(pathname);

        Sentry.setTag('route.pathname', safePathname);

        if (previousPathnameRef.current !== safePathname) {
            addSentryBreadcrumb({
                category: 'navigation',
                data: {
                    from: previousPathnameRef.current,
                    to: safePathname,
                },
                message: `Navigation to ${safePathname}`,
                type: 'navigation',
            });
            previousPathnameRef.current = safePathname;
        }
    }, [pathname]);
}

export function withSentryRoot(Component) {
    if (!SENTRY_IS_ENABLED) {
        return Component;
    }

    return Sentry.wrap(Component);
}
