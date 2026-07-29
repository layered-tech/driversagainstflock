import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const androidAutoPerformanceTraceSource = readFileSync(
    new URL('../../android-auto-performance-trace.js', import.meta.url),
    'utf8',
);
const debugDrawerSource = readFileSync(
    new URL('../../root/debug-drawer.js', import.meta.url),
    'utf8',
);
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function createTraceHarness({ platformOS = 'android' } = {}) {
    let autoPlaySessionStateListener = null;
    let sessionState = { isConnected: false };
    let storedTrace = null;
    const calls = {
        setItems: [],
    };
    const AsyncStorage = {
        async getItem() {
            return storedTrace;
        },
        async setItem(key, value) {
            calls.setItems.push({ key, value });
            storedTrace = value;
        },
    };
    const module = { exports: {} };
    const transformedSource = transformSync(androidAutoPerformanceTraceSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        '@react-native-async-storage/async-storage': {
            __esModule: true,
            default: AsyncStorage,
        },
        'react-native': {
            Platform: { OS: platformOS },
        },
        './auto-play-session-state': {
            addAutoPlaySessionStateListener(listener) {
                autoPlaySessionStateListener = listener;
                listener(sessionState);

                return () => {};
            },
            getAutoPlaySessionState() {
                return sessionState;
            },
        },
    };
    const loadModule = new Function(
        'require',
        'module',
        'exports',
        transformedSource,
    );

    loadModule(
        (specifier) => {
            if (!(specifier in mockedModules)) {
                throw new Error(`Unexpected module request: ${specifier}`);
            }

            return mockedModules[specifier];
        },
        module,
        module.exports,
    );

    return {
        calls,
        trace: module.exports,
        transitionAutoPlaySession(nextSessionState) {
            sessionState = nextSessionState;
            autoPlaySessionStateListener(nextSessionState);
        },
    };
}

describe('Android Auto performance trace', () => {
    test('persists Android Auto timing events without location data', async () => {
        const harness = createTraceHarness();

        harness.transitionAutoPlaySession({ isConnected: true });

        assert.equal(
            harness.trace.recordAndroidAutoPerformanceTrace(
                'road_graph.loaded',
                {
                    durationMs: 7,
                    longitude: -87.6244,
                    requestDurationMs: 182,
                },
            ),
            true,
        );

        harness.transitionAutoPlaySession({ isConnected: false });

        const trace = await harness.trace.getAndroidAutoPerformanceTraceAsync();
        const recordedEvent = trace.entries.find(
            (entry) => entry.event === 'road_graph.loaded',
        );

        assert.equal(trace.schemaVersion, 1);
        assert.equal(recordedEvent.data.durationMs, 7);
        assert.equal(recordedEvent.data.requestDurationMs, 182);
        assert.equal('longitude' in recordedEvent.data, false);
        assert.ok(
            trace.entries.some(
                (entry) => entry.event === 'android_auto.connected',
            ),
        );
        assert.ok(
            trace.entries.some(
                (entry) => entry.event === 'android_auto.disconnected',
            ),
        );
        assert.equal(harness.calls.setItems.length > 0, true);
    });

    test('does not record a CarPlay session', () => {
        const harness = createTraceHarness({ platformOS: 'ios' });

        harness.transitionAutoPlaySession({ isConnected: true });

        assert.equal(
            harness.trace.recordAndroidAutoPerformanceTrace(
                'road_graph.loaded',
            ),
            false,
        );
    });

    test('makes the stored trace selectable from the debug drawer', () => {
        assert.match(
            androidAutoPerformanceTraceSource,
            /MAX_TRACE_ENTRIES = 4000/,
        );
        assert.match(
            androidAutoPerformanceTraceSource,
            /EVENT_LOOP_DELAY_THRESHOLD_MS = 100/,
        );
        assert.match(debugDrawerSource, /getAndroidAutoPerformanceTraceAsync/);
        assert.match(debugDrawerSource, /selectable/);
    });
});
