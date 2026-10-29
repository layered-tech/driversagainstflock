import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const source = transformSync(
    readFileSync(
        new URL('../automotive-e2e-map-snapshot.js', import.meta.url),
        'utf8',
    ),
    {
        babelrc: false,
        configFile: false,
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    },
).code;
function load(environment = 'e2e') {
    const module = { exports: {} };
    const modules = {
        './config': { APP_ENVIRONMENT: environment },
        './directions': {
            getDirectionsRouteOptionsBounds: (route) => route.bounds,
            getSelectedDirectionsRouteOption: (route) => route.selected,
        },
    };
    new Function('require', 'module', 'exports', source)(
        (name) => modules[name],
        module,
        module.exports,
    );
    return module.exports;
}

test('samples route distance evenly including long straight segments and endpoints', () => {
    const { sampleRouteCoordinates } = load();
    const points = sampleRouteCoordinates(
        [
            [0, 0],
            [0, 0],
            [1, 0],
            [4, 0],
        ],
        5,
    );
    assert.deepEqual(points, [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
    ]);
    assert.deepEqual(
        sampleRouteCoordinates([
            [1, 1],
            [1, 1],
        ]),
        [],
    );
    assert.deepEqual(sampleRouteCoordinates(null), []);
});

test('reads native camera, rendered selected features and projected bounds instead of trusting JS route state', async () => {
    const calls = [];
    const mapView = {
        getZoom: async () => 12,
        getCenter: async () => [-88, 43],
        getVisibleBounds: async () => [
            [-87, 44],
            [-89, 42],
        ],
        queryRenderedFeaturesInRect: async (...args) => {
            calls.push(args);
            return {
                features: [
                    { properties: { routeKey: 'direct', selected: false } },
                    { properties: { routeKey: 'ideal', selected: true } },
                ],
            };
        },
        getPointInView: async ([x, y]) => [x * 2, y * 2],
    };
    const route = {
        bounds: { ne: [-87, 44], sw: [-89, 42] },
        selected: {
            routeKey: 'ideal',
            coordinates: [
                [-88, 43],
                [-87.5, 43.5],
            ],
        },
    };
    const args = {
        mapView,
        route,
        previewVisible: true,
        viewport: { width: 800 },
    };
    const snapshot = await load().getAutomotiveE2EMapSnapshot(args);
    assert.equal(snapshot.zoom, 12);
    assert.deepEqual(snapshot.renderedRouteKeys, ['ideal']);
    assert.deepEqual(calls, [[[], [], ['directions-route-line']]]);
    assert.deepEqual(snapshot.boundsPoints, [
        [-174, 88],
        [-178, 84],
        [-174, 84],
        [-178, 88],
    ]);
    assert.equal(snapshot.routePoints.length, 49);
    mapView.queryRenderedFeaturesInRect = async () => ({ features: [] });
    assert.deepEqual(
        (await load().getAutomotiveE2EMapSnapshot(args)).renderedRouteKeys,
        [],
    );
    mapView.getZoom = async () => {
        throw new Error('native query failed');
    };
    assert.deepEqual(await load().getAutomotiveE2EMapSnapshot(args), {
        ready: false,
        error: 'native query failed',
    });
});

test('production never queries the native map; baseline does not query route features', async () => {
    const mapView = new Proxy(
        {},
        { get: () => assert.fail('No production native access') },
    );
    assert.equal(
        await load('production').getAutomotiveE2EMapSnapshot({ mapView }),
        null,
    );
    const camera = {
        getZoom: async () => 16,
        getCenter: async () => [0, 0],
        getVisibleBounds: async () => [
            [1, 1],
            [-1, -1],
        ],
    };
    const snapshot = await load().getAutomotiveE2EMapSnapshot({
        mapView: camera,
        previewVisible: false,
    });
    assert.equal(snapshot.zoom, 16);
    assert.equal(snapshot.renderedRouteKeys, undefined);
    assert.deepEqual(await load().getAutomotiveE2EMapSnapshot({}), {
        ready: false,
    });
});
