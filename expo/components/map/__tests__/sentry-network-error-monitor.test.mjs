import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const sentrySource = readFileSync(
    new URL('../../../lib/sentry.js', import.meta.url),
    'utf8',
);
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function loadSentryModule() {
    const capturedExceptions = [];
    const installedNetworkMonitors = [];
    const scopeContexts = [];
    const scopeTags = [];
    const module = { exports: {} };
    const transformedSource = transformSync(sentrySource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        '@sentry/react-native': {
            captureException(error) {
                capturedExceptions.push(error);
            },
            init() {},
            reactNavigationIntegration() {
                return {};
            },
            setContext() {},
            setTag() {},
            withScope(callback) {
                callback({
                    setContext(name, value) {
                        scopeContexts.push({ name, value });
                    },
                    setTag(name, value) {
                        scopeTags.push({ name, value });
                    },
                });
            },
        },
        'expo-constants': {
            __esModule: true,
            default: {
                expoConfig: {
                    extra: { environment: 'production' },
                    version: '1.0.0',
                },
                nativeAppVersion: '1.0.0',
                nativeBuildVersion: '1',
            },
        },
        'expo-router': {
            usePathname() {
                return '/';
            },
        },
        react: {
            useEffect() {},
            useRef() {
                return { current: null };
            },
        },
        './auth/urls': {
            getApiBaseURL() {
                return 'https://api.example.test';
            },
        },
        './network-error-monitor': {
            installNetworkErrorMonitor(options) {
                installedNetworkMonitors.push(options);

                return true;
            },
        },
    };

    new Function('require', 'module', 'exports', transformedSource)(
        (specifier) => mockedModules[specifier],
        module,
        module.exports,
    );

    return {
        capturedExceptions,
        installedNetworkMonitors,
        scopeContexts,
        scopeTags,
    };
}

describe('Sentry network error reporting', () => {
    test('captures failed HTTP responses and excludes Sentry ingestion', () => {
        const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
        const originalEnabled = process.env.EXPO_PUBLIC_SENTRY_ENABLED;
        const originalDev = globalThis.__DEV__;

        process.env.EXPO_PUBLIC_SENTRY_DSN =
            'https://key@o123.ingest.us.sentry.io/456';
        process.env.EXPO_PUBLIC_SENTRY_ENABLED = '1';
        globalThis.__DEV__ = false;

        try {
            const harness = loadSentryModule();
            const onHttpError =
                harness.installedNetworkMonitors[0]?.onHttpError;

            assert.equal(typeof onHttpError, 'function');
            onHttpError({
                method: 'GET',
                status: 503,
                url: 'https://api.example.test/v1/road-corridor',
            });
            onHttpError({
                method: 'POST',
                status: 429,
                url: 'https://o123.ingest.us.sentry.io/api/456/envelope',
            });

            assert.equal(harness.capturedExceptions.length, 1);
            assert.equal(
                harness.capturedExceptions[0].name,
                'NetworkRequestError',
            );
            assert.equal(
                harness.capturedExceptions[0].message,
                'HTTP 503 GET https://api.example.test/v1/road-corridor',
            );
            assert.deepEqual(harness.scopeTags, [
                { name: 'http.method', value: 'GET' },
                { name: 'http.status_code', value: '503' },
                { name: 'network.error', value: 'http-response' },
            ]);
            assert.deepEqual(harness.scopeContexts, [
                {
                    name: 'network_request',
                    value: {
                        method: 'GET',
                        status: 503,
                        url: 'https://api.example.test/v1/road-corridor',
                    },
                },
            ]);
        } finally {
            if (originalDsn === undefined) {
                delete process.env.EXPO_PUBLIC_SENTRY_DSN;
            } else {
                process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
            }

            if (originalEnabled === undefined) {
                delete process.env.EXPO_PUBLIC_SENTRY_ENABLED;
            } else {
                process.env.EXPO_PUBLIC_SENTRY_ENABLED = originalEnabled;
            }

            globalThis.__DEV__ = originalDev;
        }
    });
});
