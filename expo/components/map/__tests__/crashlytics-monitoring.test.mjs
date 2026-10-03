import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import {
    sanitizeDiagnosticError,
    sanitizeDiagnosticValue,
} from '../../../lib/diagnostic-privacy.js';
import { getPrivacySafeMonitoringPathname } from '../../../lib/privacy-routes.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const source = readFileSync(
    new URL('../../../lib/crashlytics.js', import.meta.url),
    'utf8',
);
const code = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [require('@babel/plugin-transform-modules-commonjs')],
}).code;
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function loadMonitoring({
    platform = 'android',
    dev = false,
    environment = 'production',
    enabled,
    unavailable = false,
    hermes = false,
    collectionEnabled = true,
} = {}) {
    const errors = [];
    const fatalErrors = [];
    const originalErrors = [];
    const logs = [];
    const attributes = [];
    const userIds = [];
    const collection = [];
    const monitors = [];
    let deletedReports = 0;
    let crashes = 0;
    let sdkCalls = 0;
    let rejectionHandler;
    let pathname = '/';
    let handler = (error, fatal) => originalErrors.push({ error, fatal });
    const sdk = { isCrashlyticsCollectionEnabled: collectionEnabled };
    const globals = {
        ErrorUtils: {
            getGlobalHandler: () => handler,
            setGlobalHandler: (value) => {
                handler = value;
            },
        },
    };
    if (hermes) {
        globals.HermesInternal = {
            hasPromise: () => true,
            enablePromiseRejectionTracker: (options) => {
                rejectionHandler = options.onUnhandled;
            },
        };
    }
    const modules = {
        '@react-native-firebase/crashlytics': {
            getCrashlytics() {
                sdkCalls++;
                if (unavailable) throw new Error('Native module unavailable');
                handler = (error, fatal) => fatalErrors.push({ error, fatal });
                return sdk;
            },
            async deleteUnsentReports() {
                deletedReports++;
            },
            async setCrashlyticsCollectionEnabled(_sdk, value) {
                collection.push(value);
            },
            async setAttributes(_sdk, value) {
                attributes.push(value);
            },
            async setUserId(_sdk, value) {
                userIds.push(value);
            },
            recordError(_sdk, error) {
                errors.push(error);
            },
            log(_sdk, value) {
                logs.push(value);
            },
            crash() {
                crashes++;
            },
        },
        'expo-constants': {
            __esModule: true,
            default: {
                expoConfig: { extra: { environment }, version: '1.0.0' },
                nativeBuildVersion: '1',
            },
        },
        'expo-router': { usePathname: () => pathname },
        react: {
            useEffect: (callback) => callback(),
            useRef: () => ({ current: null }),
        },
        'react-native': { Platform: { OS: platform } },
        'promise/setimmediate/rejection-tracking': {
            enable: (options) => {
                rejectionHandler = options.onUnhandled;
            },
        },
        './auth/urls': { getApiBaseURL: () => 'https://api.example.test' },
        './network-error-monitor': {
            installNetworkErrorMonitor: (options) => monitors.push(options),
        },
        './privacy-routes': { getPrivacySafeMonitoringPathname },
        './diagnostic-privacy': {
            sanitizeDiagnosticError,
            sanitizeDiagnosticValue,
        },
    };
    const module = { exports: {} };
    new Function(
        'require',
        'module',
        'exports',
        'globalThis',
        '__DEV__',
        'process',
        code,
    )(
        (name) => {
            assert.ok(modules[name], `Unexpected import: ${name}`);
            return modules[name];
        },
        module,
        module.exports,
        globals,
        dev,
        { env: { EXPO_PUBLIC_FIREBASE_CRASHLYTICS_ENABLED: enabled } },
    );
    await flush();
    return {
        exports: module.exports,
        errors,
        fatalErrors,
        originalErrors,
        logs,
        attributes,
        userIds,
        collection,
        monitors,
        get deletedReports() {
            return deletedReports;
        },
        get crashes() {
            return crashes;
        },
        get sdkCalls() {
            return sdkCalls;
        },
        handleError: (...args) => handler(...args),
        reject: (error) => rejectionHandler?.(1, error),
        async navigate(value) {
            pathname = value;
            module.exports.useCrashlyticsRouteTracking();
            await flush();
        },
    };
}

describe('Crashlytics monitoring', () => {
    test('records HTTP failures with sanitized URLs and retains useful error context', async () => {
        const harness = await loadMonitoring();
        harness.monitors[0].onHttpError({
            method: 'GET',
            status: 503,
            url: 'https://user:password@api.example.test/v1/road-corridor?token=secret#location',
        });
        assert.equal(harness.errors[0].name, 'NetworkRequestError');
        assert.equal(
            harness.errors[0].message,
            'HTTP 503 GET https://api.example.test/v1/road-corridor',
        );
        assert.deepEqual(harness.collection, [true]);
    });

    test('covers Scorecard navigation and errors without exposing local identifiers', async () => {
        const harness = await loadMonitoring();
        await harness.navigate('/scorecard/event/local-secret');
        harness.exports.recordCrashlyticsError(
            new Error('Unable to open /scorecard/event/local-secret'),
        );
        harness.exports.addCrashlyticsLog({
            category: 'scorecard',
            message: 'Scorecard opened',
            data: { scorecardState: { secret: 'private' }, latitude: 40.12345 },
        });
        assert.equal(harness.errors.length, 1);
        assert.match(harness.errors[0].message, /scorecard\/event\/\[id\]/);
        assert.equal(harness.logs.length, 2);
        assert.match(harness.logs[1], /Scorecard opened/);
        assert.doesNotMatch(
            harness.logs.join(''),
            /local-secret|40\.12345|"secret"/,
        );
        assert.deepEqual(harness.attributes.at(-1), {
            'route.pathname': '/scorecard/event/[id]',
        });
        await harness.navigate('/hotlist');
        assert.equal(await harness.exports.emitCrashlyticsTestError(), true);
        assert.deepEqual(harness.collection, [true]);
    });

    test('sanitizes fatal JS errors and unhandled promise rejections', async () => {
        const harness = await loadMonitoring();
        const error = new Error(
            'Request failed for user@example.com with Bearer secret-token',
        );
        harness.handleError(error, true);
        harness.reject(error);
        assert.equal(harness.fatalErrors.length, 1);
        assert.equal(harness.fatalErrors[0].fatal, true);
        assert.equal(harness.originalErrors.length, 0);
        assert.equal(harness.errors.length, 1);
        for (const report of [
            harness.fatalErrors[0].error,
            harness.errors[0],
        ]) {
            assert.doesNotMatch(
                report.message + report.stack,
                /user@example\.com|secret-token/,
            );
        }
        assert.match(error.message, /user@example\.com/);
    });

    test('reports sanitized unhandled rejections from the native Hermes Promise implementation', async () => {
        const harness = await loadMonitoring({ hermes: true });
        harness.reject(new Error('Failure for user@example.com'));
        assert.equal(harness.errors.length, 1);
        assert.doesNotMatch(harness.errors[0].message, /user@example/);
    });

    test('associates only the opaque account identity and clears it at logout', async () => {
        const harness = await loadMonitoring();
        await harness.exports.setCrashlyticsUser({
            id: 12,
            provider: 'osm',
            email: 'private@example.com',
            name: 'Private Name',
        });
        await harness.exports.setCrashlyticsUser(null);
        assert.deepEqual(harness.userIds, ['osm:12', '']);
        assert.doesNotMatch(
            JSON.stringify(harness.attributes),
            /Private Name|private@example/,
        );
    });

    test('provides a working native crash test action', async () => {
        const harness = await loadMonitoring();
        assert.equal(
            await harness.exports.triggerCrashlyticsNativeCrash(),
            true,
        );
        assert.equal(harness.crashes, 1);
    });

    for (const platform of ['android', 'ios']) {
        test(`reports sanitized errors and supports crash tests in ${platform} debug builds`, async () => {
            const harness = await loadMonitoring({
                platform,
                dev: true,
                environment: 'development',
            });
            assert.deepEqual(harness.collection, [true]);
            assert.equal(harness.monitors.length, 1);
            harness.handleError(
                new Error('Failure for user@example.com'),
                true,
            );
            assert.equal(harness.fatalErrors.length, 1);
            assert.doesNotMatch(
                harness.fatalErrors[0].error.message,
                /user@example/,
            );
            assert.equal(
                await harness.exports.emitCrashlyticsTestError(),
                true,
            );
            assert.equal(
                await harness.exports.triggerCrashlyticsNativeCrash(),
                true,
            );
            assert.equal(harness.errors.length, 1);
            assert.equal(harness.crashes, 1);
        });
    }

    for (const options of [
        { platform: 'web' },
        { environment: 'e2e' },
        { dev: true, environment: 'e2e' },
        { enabled: '0' },
        { dev: true, enabled: '0' },
        { unavailable: true },
    ]) {
        test(`does not report when unavailable or disabled: ${JSON.stringify(options)}`, async () => {
            const harness = await loadMonitoring(options);
            assert.equal(
                await harness.exports.emitCrashlyticsTestError(),
                false,
            );
            assert.equal(
                await harness.exports.triggerCrashlyticsNativeCrash(),
                false,
            );
            assert.equal(harness.monitors.length, 0);
            assert.equal(harness.errors.length, 0);
            assert.equal(harness.crashes, 0);
            if (options.platform === 'web') assert.equal(harness.sdkCalls, 0);
            if (options.dev || options.environment || options.enabled) {
                assert.deepEqual(harness.collection, [false]);
                assert.equal(harness.deletedReports, 1);
                harness.reject(new Error('disabled rejection'));
                assert.equal(harness.errors.length, 0);
            }
        });
    }

    test('discards reports from an earlier opt-out before re-enabling collection', async () => {
        const harness = await loadMonitoring({ collectionEnabled: false });
        assert.equal(harness.deletedReports, 1);
        assert.deepEqual(harness.collection, [true]);
    });
});

describe('diagnostic data sanitization', () => {
    test('redacts sensitive nested fields while retaining operational data', () => {
        const result = sanitizeDiagnosticValue({
            status: 503,
            operation: 'fetch-markers',
            nested: {
                access_token: 'secret',
                apiKey: 'secret',
                email: 'private@example.com',
                coordinates: [40.12345, -90.12345],
                requestBody: { local: 'secret' },
                searchTerm: 'home address',
                placeId: 'private-place',
                note: 'private note',
            },
        });
        assert.equal(result.status, 503);
        assert.equal(result.operation, 'fetch-markers');
        assert.ok(
            Object.values(result.nested).every(
                (value) => value === '[redacted]',
            ),
        );
    });

    test('redacts credentials and coordinates embedded in error text and stacks', () => {
        const message =
            'email=person@example.com token=secret {"accessToken":"other-secret"} latitude=40.12345 [40.12345,-90.12345] https://user:pass@example.com/path?key=secret';
        const error = sanitizeDiagnosticError(new Error(message));
        assert.doesNotMatch(
            error.message + error.stack,
            /person@example|secret|other-secret|40\.12345|90\.12345|user:pass/,
        );
        assert.match(error.message, /https:\/\/example.com\/path/);
    });

    test('bounds cyclic payloads without dropping the diagnostic event', () => {
        const payload = { status: 500 };
        payload.self = payload;
        assert.match(
            JSON.stringify(sanitizeDiagnosticValue(payload)),
            /redacted/,
        );
    });
});

test('analytics covers each Scorecard screen with sanitized event metadata', async () => {
    const calls = [];
    const analyticsCode = transformSync(
        readFileSync(
            new URL('../../../lib/analytics.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [require('@babel/plugin-transform-modules-commonjs')],
        },
    ).code;
    const modules = {
        '@react-native-firebase/analytics': {
            getAnalytics: () => ({}),
            logEvent: async (_instance, name, params) =>
                calls.push({ name, params }),
        },
        './firebase': { getFirebaseApp: async () => ({}) },
        './privacy-routes': { getPrivacySafeMonitoringPathname },
        './diagnostic-privacy': { sanitizeDiagnosticValue },
    };
    const module = { exports: {} };
    new Function(
        'require',
        'module',
        'exports',
        '__DEV__',
        'process',
        analyticsCode,
    )((name) => modules[name], module, module.exports, false, { env: {} });
    for (const pathname of [
        '/scorecard',
        '/scorecard/timeline',
        '/scorecard/trail',
        '/scorecard/event/private-id',
    ]) {
        await module.exports.logAnalyticsScreenView(pathname);
    }
    assert.equal(calls.length, 4);
    assert.deepEqual(
        calls.map(({ params }) => params.screen_name),
        [
            'Scorecard',
            'Scorecard / Timeline',
            'Scorecard / Trail',
            'Scorecard / Event / Id',
        ],
    );
    await module.exports.logAnalyticsEvent('search', {
        search_term: 'home address',
        item_id: 'private-place',
        result_count: 5,
        enabled: true,
    });
    assert.deepEqual(calls.at(-1).params, {
        search_term: '[redacted]',
        item_id: '[redacted]',
        result_count: 5,
        enabled: 1,
    });
    assert.doesNotMatch(
        JSON.stringify(calls),
        /private-id|home address|private-place/,
    );
});
