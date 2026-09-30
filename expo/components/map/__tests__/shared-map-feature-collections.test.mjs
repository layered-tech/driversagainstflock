import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const modules = new Map();
const nativeModules = {
    'sentry.js': { addSentryBreadcrumb() {} },
    'config.js': {},
    'api-mocks.js': {},
};

function loadModule(url) {
    if (url.pathname.endsWith('.png')) return {};
    const nativeModule = nativeModules[url.pathname.split('/').at(-1)];
    if (nativeModule) return nativeModule;
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
            specifier === 'expo/fetch'
                ? {}
                : loadModule(
                      new URL(
                          /\.(?:js|png)$/.test(specifier)
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

const { makeMarkerFeatureCollection } = loadModule(
    new URL('../geo.js', import.meta.url),
);
const { makeWazePoliceAlertFeatureCollection } = loadModule(
    new URL('../waze-alerts-api.js', import.meta.url),
);

test('phone and car share marker geometry and direction parsing for each published inventory', () => {
    let directionReads = 0;
    const marker = {
        location: [-97, 30],
        properties: {
            id: 'camera',
            get direction() {
                directionReads += 1;
                return '90;270';
            },
            osm_nodes: [{ tags: { 'brand:wikidata': 'Q108485435' } }],
        },
    };
    const markers = [marker, { properties: { id: 'invalid' } }];
    const phone = makeMarkerFeatureCollection(markers);
    const initialReads = directionReads;
    const car = makeMarkerFeatureCollection(markers);

    assert.equal(car, phone);
    assert.equal(directionReads, initialReads);
    assert.equal(phone.features.length, 1);
    assert.equal(phone.features[0].properties.coneDirection0, 90);
    assert.equal(phone.features[0].properties.coneDirection1, 270);
    assert.equal(phone.features[0].properties.showsAlprSymbol, true);

    const updated = makeMarkerFeatureCollection([
        { ...marker, location: [-96, 31] },
    ]);
    assert.notEqual(updated, phone);
    assert.deepEqual(updated.features[0].geometry.coordinates, [-96, 31]);
    assert.deepEqual(phone.features[0].geometry.coordinates, [-97, 30]);
});

test('police feature derivation reuses the shared alert snapshot and refreshes replacements', () => {
    let coordinateReads = 0;
    const alert = {
        id: 'police',
        get coordinate() {
            coordinateReads += 1;
            return [-97, 30];
        },
        street: 'First Street',
        numThumbsUp: 2,
    };
    const alerts = [alert];
    const first = makeWazePoliceAlertFeatureCollection(alerts);
    const initialReads = coordinateReads;

    assert.equal(makeWazePoliceAlertFeatureCollection(alerts), first);
    assert.equal(coordinateReads, initialReads);
    const updated = makeWazePoliceAlertFeatureCollection([
        { ...alert, numThumbsUp: 3 },
    ]);
    assert.equal(updated.features[0].properties.numThumbsUp, 3);
    assert.equal(first.features[0].properties.numThumbsUp, 2);
});
