import {
    crash,
    deleteUnsentReports,
    getCrashlytics,
    log,
    recordError,
    setAttributes,
    setCrashlyticsCollectionEnabled,
    setUserId,
} from '@react-native-firebase/crashlytics';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import rejectionTracking from 'promise/setimmediate/rejection-tracking';
import { getApiBaseURL } from './auth/urls';
import { installNetworkErrorMonitor } from './network-error-monitor';
import { getPrivacySafeMonitoringPathname } from './privacy-routes';
import {
    sanitizeDiagnosticError,
    sanitizeDiagnosticValue,
} from './diagnostic-privacy';

const APP_ENVIRONMENT =
    Constants.expoConfig?.extra?.environment ?? 'production';
const CRASHLYTICS_IS_ENABLED =
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    APP_ENVIRONMENT !== 'e2e' &&
    process.env.EXPO_PUBLIC_FIREBASE_CRASHLYTICS_ENABLED !== '0';

let crashlytics = null;
let initializationPromise = null;
let reportingIsReady = false;

function canReport() {
    return CRASHLYTICS_IS_ENABLED && reportingIsReady;
}

function warnCrashlyticsError(error) {
    if (__DEV__) {
        console.warn('Firebase Crashlytics call failed.', error);
    }
}

function installJavascriptPrivacyGuards(originalHandler) {
    if (!CRASHLYTICS_IS_ENABLED) {
        return;
    }

    const firebaseHandler = globalThis.ErrorUtils?.getGlobalHandler();

    if (firebaseHandler && originalHandler) {
        globalThis.ErrorUtils.setGlobalHandler((error, isFatal) => {
            const safeError = sanitizeDiagnosticError(error);

            return canReport()
                ? firebaseHandler(safeError, isFatal)
                : originalHandler(safeError, isFatal);
        });
    }

    // RNFirebase's rejection handler bypasses its global exception handler.
    const rejectionOptions = {
        allRejections: true,
        onHandled() {},
        onUnhandled(_id, error) {
            recordCrashlyticsError(error);
        },
    };

    if (
        globalThis.HermesInternal?.hasPromise?.() &&
        typeof globalThis.HermesInternal.enablePromiseRejectionTracker ===
            'function'
    ) {
        globalThis.HermesInternal.enablePromiseRejectionTracker(
            rejectionOptions,
        );
    } else {
        rejectionTracking.enable(rejectionOptions);
    }
}

async function initializeCrashlytics() {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
        return;
    }

    try {
        const originalHandler = globalThis.ErrorUtils?.getGlobalHandler();
        crashlytics = getCrashlytics();
        installJavascriptPrivacyGuards(originalHandler);

        if (!CRASHLYTICS_IS_ENABLED) {
            await setCrashlyticsCollectionEnabled(crashlytics, false);
            await deleteUnsentReports(crashlytics);
            return;
        }

        // Discard cached reports collected while diagnostics were disabled.
        if (!crashlytics.isCrashlyticsCollectionEnabled) {
            await deleteUnsentReports(crashlytics);
        }

        await setAttributes(crashlytics, {
            'app.environment': APP_ENVIRONMENT,
            'app.version': String(
                Constants.nativeAppVersion ??
                    Constants.expoConfig?.version ??
                    'unknown',
            ),
            'app.build': String(Constants.nativeBuildVersion ?? 'unknown'),
            'api.base_url': sanitizeDiagnosticValue(getApiBaseURL()),
        });

        await setCrashlyticsCollectionEnabled(crashlytics, true);

        reportingIsReady = true;
        installNetworkErrorMonitor({
            onHttpError({ method, status, url }) {
                const error = new Error(`HTTP ${status} ${method} ${url}`);
                error.name = 'NetworkRequestError';
                recordCrashlyticsError(error);
            },
        });
    } catch (error) {
        reportingIsReady = false;
        warnCrashlyticsError(error);
    }
}

export function recordCrashlyticsError(error) {
    if (!canReport()) {
        return false;
    }

    try {
        const safeError = sanitizeDiagnosticError(error);
        recordError(crashlytics, safeError, safeError.name);
        return true;
    } catch (reportingError) {
        warnCrashlyticsError(reportingError);
        return false;
    }
}

export function addCrashlyticsLog({
    category,
    data,
    level = 'info',
    message,
    type,
}) {
    if (!canReport()) {
        return;
    }

    try {
        log(
            crashlytics,
            JSON.stringify(
                sanitizeDiagnosticValue({
                    category,
                    data,
                    level,
                    message,
                    type,
                }),
            ),
        );
    } catch (error) {
        warnCrashlyticsError(error);
    }
}

export async function setCrashlyticsUser(user) {
    await initializationPromise;

    if (!canReport()) {
        return;
    }

    try {
        const provider = user?.id ? user.provider || 'user' : 'anonymous';
        await setUserId(crashlytics, user?.id ? `${provider}:${user.id}` : '');
        await setAttributes(crashlytics, { 'auth.provider': provider });
    } catch (error) {
        warnCrashlyticsError(error);
    }
}

export async function emitCrashlyticsTestError() {
    await initializationPromise;
    return recordCrashlyticsError(new Error('Manual Crashlytics test error'));
}

export async function triggerCrashlyticsNativeCrash() {
    await initializationPromise;

    if (!canReport()) {
        return false;
    }

    log(crashlytics, 'Manual native crash requested');
    crash(crashlytics);
    return true;
}

export function useCrashlyticsRouteTracking() {
    const pathname = usePathname();
    const previousPathnameRef = useRef(null);
    useEffect(() => {
        const safePathname = getPrivacySafeMonitoringPathname(pathname);

        void initializationPromise.then(async () => {
            if (!canReport() || !pathname) {
                previousPathnameRef.current = null;
                return;
            }

            try {
                await setAttributes(crashlytics, {
                    'route.pathname': safePathname,
                });
                if (previousPathnameRef.current !== safePathname) {
                    addCrashlyticsLog({
                        category: 'navigation',
                        message: `Navigation to ${safePathname}`,
                        data: {
                            from: previousPathnameRef.current,
                            to: safePathname,
                        },
                    });
                    previousPathnameRef.current = safePathname;
                }
            } catch (error) {
                warnCrashlyticsError(error);
            }
        });
    }, [pathname]);
}

initializationPromise = initializeCrashlytics();
