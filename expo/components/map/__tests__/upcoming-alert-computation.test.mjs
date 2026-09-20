import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const source = transformSync(
    readFileSync(
        new URL(
            '../use-upcoming-electronic-horizon-alerts.js',
            import.meta.url,
        ),
        'utf8',
    ),
    { babelrc: false, configFile: false, plugins: [transformModulesCommonJs] },
).code;

function createAlertHookHarness() {
    const values = [];
    let cursor = 0;
    const counts = { paths: 0, alerts: 0 };
    const react = {
        useMemo(factory, dependencies) {
            const index = cursor++;
            const cached = values[index];
            if (
                !cached ||
                dependencies.some(
                    (value, index) =>
                        !Object.is(value, cached.dependencies[index]),
                )
            ) {
                values[index] = { value: factory(), dependencies };
            }
            return values[index].value;
        },
        useEffect() {},
        useRef(value) {
            return react.useMemo(() => ({ current: value }), []);
        },
        useState(value) {
            const state = react.useRef(
                typeof value === 'function' ? value() : value,
            );
            return [
                state.current,
                (value) => {
                    state.current = value;
                },
            ];
        },
        useCallback(callback, dependencies) {
            return react.useMemo(() => callback, dependencies);
        },
    };
    const emptyNodes = Object.freeze([]);
    const modules = {
        react,
        'react-native': { AppState: { currentState: 'active' } },
        './directions': { getSelectedDirectionsRouteOption: (route) => route },
        './electronic-horizon': {
            getDirectionsRouteCoordinatesAhead(coordinates) {
                counts.paths += 1;
                return coordinates?.slice() ?? [];
            },
            getElectronicHorizonPrimaryCoordinates: (horizon) =>
                horizon?.coordinates ?? [],
            getUpcomingElectronicHorizonAlerts({ policeAlerts = [] }) {
                counts.alerts += 1;
                return policeAlerts.slice();
            },
        },
        './electronic-horizon-alpr-store': {
            EMPTY_ELECTRONIC_HORIZON_ALPR_NODES: emptyNodes,
            getElectronicHorizonAlprCoordinatePathStateKey: (coordinates) =>
                JSON.stringify(coordinates),
            getElectronicHorizonAlprDirectionsRoutePathKey: (route) =>
                route?.routeKey ?? '',
            getElectronicHorizonAlprPathStateKey: ({ routePathKey }) =>
                routePathKey,
            getSharedElectronicHorizonAlprCoverageComplete: () => null,
            getSharedElectronicHorizonAlprNodes: () => emptyNodes,
        },
        './location-watch-options': { shouldRefreshLocationData: () => true },
        './map-performance-signposts': { recordMapPerformanceSignpost() {} },
        './use-device-location': {
            usePersistentRoadMatchingWatchIsActive: () => false,
        },
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', source)(
        (specifier) => {
            assert.ok(modules[specifier], specifier);
            return modules[specifier];
        },
        module,
        module.exports,
    );
    return {
        counts,
        render(input) {
            cursor = 0;
            return module.exports.useUpcomingElectronicHorizonAlerts(input);
        },
    };
}

test('disabled warning surfaces perform no path or alert computation', () => {
    const harness = createAlertHookHarness();
    const result = harness.render({
        enabled: false,
        directionsRoute: {
            coordinates: [
                [0, 0],
                [0.01, 0],
            ],
        },
        policeAlerts: [{ id: 'police-1' }],
        userLocation: { latitude: 0, longitude: 0 },
    });

    assert.deepEqual(harness.counts, { paths: 0, alerts: 0 });
    assert.deepEqual(result.upcomingAlerts, []);
    assert.equal(result.pathPointCount, 0);
});

test('unrelated renders reuse paths and alerts while source changes invalidate them', () => {
    const harness = createAlertHookHarness();
    const input = {
        enabled: true,
        directionsRoute: {
            routeKey: 'route',
            coordinates: [
                [0, 0],
                [0.01, 0],
            ],
        },
        policeAlerts: [{ id: 'police-1' }],
        userLocation: { latitude: 0, longitude: 0 },
    };
    const first = harness.render(input);
    const repeated = harness.render({
        ...input,
        userLocation: { ...input.userLocation, heading: 180, recordedAt: 2000 },
    });

    assert.deepEqual(harness.counts, { paths: 1, alerts: 1 });
    assert.equal(first.upcomingAlerts, repeated.upcomingAlerts);
    const changedAlerts = harness.render({
        ...input,
        policeAlerts: [{ id: 'police-2' }],
    });
    assert.deepEqual(harness.counts, { paths: 1, alerts: 2 });
    assert.equal(changedAlerts.upcomingAlerts[0].id, 'police-2');
    harness.render({
        ...input,
        userLocation: { ...input.userLocation, longitude: 0.001 },
    });
    assert.deepEqual(harness.counts, { paths: 2, alerts: 3 });
    harness.render({
        ...input,
        directionsRoute: {
            ...input.directionsRoute,
            coordinates: [
                [1, 1],
                [1.01, 1],
            ],
        },
    });
    assert.deepEqual(harness.counts, { paths: 3, alerts: 4 });
    assert.deepEqual(
        harness.render({ ...input, enabled: false }).upcomingAlerts,
        [],
    );
    assert.deepEqual(harness.counts, { paths: 3, alerts: 4 });
    harness.render(input);
    assert.deepEqual(harness.counts, { paths: 4, alerts: 5 });
});
