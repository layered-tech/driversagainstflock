import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function loadWazeModules(response) {
    const modules = new Map();
    let policy;
    const stubs = {
        'expo/fetch': { fetch: async () => response },
        '@react-native-async-storage/async-storage': {},
        './durable-alert-store': {
            createDurableAlertStore: (options) => {
                policy = options;
                return {};
            },
        },
        '../../lib/crashlytics': { addCrashlyticsLog() {} },
        './config': { buildApiURL: () => 'https://test.invalid/police-alerts' },
        './api-mocks': {
            mapApiMocksAreEnabled: () => false,
            mockWazePoliceAlertsAreEnabled: () => false,
        },
    };
    function load(url) {
        if (url.pathname.endsWith('.png.js')) return {};
        if (modules.has(url.href)) return modules.get(url.href).exports;
        const module = { exports: {} };
        modules.set(url.href, module);
        const source = transformSync(readFileSync(url, 'utf8'), {
            babelrc: false,
            configFile: false,
            plugins: [transformModulesCommonJs],
        }).code;
        new Function('require', 'module', 'exports', source)(
            (specifier) =>
                stubs[specifier] ??
                load(
                    new URL(
                        specifier.endsWith('.js')
                            ? specifier
                            : `${specifier}.js`,
                        url,
                    ),
                ),
            module,
            module.exports,
        );
        return module.exports;
    }
    const api = load(new URL('../waze-alerts-api.js', import.meta.url));
    load(new URL('../waze-police-alert-store.js', import.meta.url));
    return { api, policy };
}

test('Waze error responses carry Retry-After into the backoff policy', async () => {
    for (const header of [
        '1800',
        new Date(Date.now() + 1800000).toUTCString(),
    ]) {
        const { api } = loadWazeModules({
            ok: false,
            headers: new Headers({ 'Retry-After': header }),
            json: async () => ({ ok: false, error: 'Quota exhausted' }),
        });
        await assert.rejects(
            api.getWazePoliceAlerts({
                location: { latitude: 30, longitude: -97 },
            }),
            (error) => {
                assert.equal(error.message, 'Quota exhausted');
                assert.ok(
                    error.retryAfterMs > 1790000 &&
                        error.retryAfterMs <= 1800000,
                );
                return true;
            },
        );
    }
});

test('Waze refreshes after five minutes or eight kilometers and enables bounded backoff', () => {
    const { policy } = loadWazeModules();
    const state = {
        fetchedAt: 1000,
        metadata: { fetchCenter: { latitude: 30, longitude: -97 } },
    };
    assert.equal(
        policy.isFresh(state, { latitude: 30.04, longitude: -97 }, 181000),
        true,
    );
    assert.equal(
        policy.isFresh(state, { latitude: 30, longitude: -97 }, 300999),
        true,
    );
    assert.equal(
        policy.isFresh(state, { latitude: 30, longitude: -97 }, 301000),
        false,
    );
    assert.equal(
        policy.isFresh(state, { latitude: 30.08, longitude: -97 }, 2000),
        false,
    );
    assert.equal(policy.failureBackoffMs, 60000);
    assert.equal(policy.maxFailureBackoffMs, 900000);
});
