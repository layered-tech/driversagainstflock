import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as urlHelpers from '../../root/e2e-map-api-mock-url.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModules = require('@babel/plugin-transform-modules-commonjs');
const resetURL = 'driversagainstflock://e2e-mocks?liveGpsDrive=reset';

function loadModule(path, modules, logs = []) {
    const module = { exports: {} };
    const { code } = transformSync(
        readFileSync(new URL(path, import.meta.url), 'utf8'),
        {
            babelrc: false,
            configFile: false,
            plugins: [transformModules],
        },
    );
    new Function('require', 'module', 'exports', 'console', code)(
        (name) => {
            assert.ok(name in modules, `Unexpected dependency: ${name}`);
            return modules[name];
        },
        module,
        module.exports,
        { info: (value) => logs.push(value) },
    );
    return module.exports;
}

function createHandler(enabled, resetError = null) {
    const calls = [];
    const logs = [];
    let listener;
    const record =
        (name) =>
        (...args) =>
            calls.push([name, ...args]);
    const { E2EMapApiMockHandler } = loadModule(
        '../../root/e2e-map-api-mock-handler.js',
        {
            'expo-linking': {
                getInitialURL: async () => null,
                addEventListener: (_, callback) => {
                    listener = callback;
                    return { remove() {} };
                },
            },
            react: { useEffect: (effect) => effect() },
            '../../lib/auth': { injectE2EMockSession: record('auth') },
            '../../lib/osm/api-mocks': { setOSMApiMocksEnabled: record('osm') },
            '../auto-play': { dispatchAutoPlayE2ECommand: record('autoPlay') },
            '../map/alpr-presence-runtime': {
                presenceCoordinator: {
                    async resetLimits() {
                        calls.push(['limits']);
                        if (resetError) throw resetError;
                    },
                    async resetAutomotiveAlertHistory() {
                        calls.push(['history']);
                    },
                },
            },
            '../map/api-mocks': {
                e2eMapApiMocksCanBeEnabled: () => enabled,
                setMapApiMocksEnabled: record('map'),
            },
            '../map/e2e-driving-alert-fixture': {
                setE2EDrivingAlertsFixture: record('fixture'),
            },
            '../map/electronic-horizon-alpr-store': {},
            '../map/road-matching-session': {},
            '../map/scorecard-drive-e2e-fixture': {},
            './e2e-map-api-mock-url': urlHelpers,
        },
        logs,
    );
    E2EMapApiMockHandler();
    return { calls, listener, logs };
}

test('live drive reset clears cooldowns and warning history without injecting mocks or auth', async () => {
    const { calls, listener } = createHandler(true);
    listener({ url: resetURL });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [
        ['map', false],
        ['osm', false],
        ['limits'],
        ['history'],
    ]);
});

test('live drive reset cannot register a production URL listener', () => {
    const { calls, listener } = createHandler(false);
    assert.equal(listener, undefined);
    assert.deepEqual(calls, []);
});

test('a failed reset cannot satisfy the harness success marker', async () => {
    const { calls, listener, logs } = createHandler(
        true,
        new Error('storage unavailable'),
    );
    listener({ url: resetURL });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
        calls.some(([name]) => name === 'history'),
        false,
    );
    assert.deepEqual(logs, ['[E2E] live-gps-drive-failed:storage unavailable']);
    assert.equal(
        logs.some((value) => value.includes('[E2E] live-gps-drive-reset')),
        false,
    );
});

test('native intent routing keeps live drive reset from enabling API mocks', () => {
    for (const environment of ['e2e', 'development', 'production']) {
        const { redirectSystemPath } = loadModule(
            '../../../app/+native-intent.js',
            {
                '../components/map/config': { APP_ENVIRONMENT: environment },
                '../components/root/e2e-map-api-mock-url': urlHelpers,
            },
        );
        assert.equal(
            redirectSystemPath({ path: resetURL }),
            environment === 'production' ? resetURL : '/',
        );
        if (environment !== 'production') {
            assert.equal(
                redirectSystemPath({
                    path: 'driversagainstflock://e2e-mocks?auth=1',
                }),
                '/?e2eMapApiMocks=1&e2eAuthMock=1',
            );
        }
    }
});
