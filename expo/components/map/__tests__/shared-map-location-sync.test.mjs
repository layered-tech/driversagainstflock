import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function loadStore() {
    const modules = new Map();
    function load(url) {
        if (modules.has(url.href)) {
            return modules.get(url.href).exports;
        }
        const module = { exports: {} };
        modules.set(url.href, module);
        const source = transformSync(readFileSync(url, 'utf8'), {
            babelrc: false,
            configFile: false,
            plugins: [transformModulesCommonJs],
        }).code;
        new Function('require', 'module', 'exports', source)(
            (specifier) => load(new URL(`${specifier}.js`, url)),
            module,
            module.exports,
        );
        return module.exports;
    }
    return load(new URL('../shared-map-preferences-sync.js', import.meta.url));
}

const fix = { latitude: 30, longitude: -97, recordedAt: 1000 };
const matchedFix = {
    ...fix,
    roadMatch: {
        isOffRoad: false,
        roadContext: { primaryText: 'Congress Avenue' },
        speedLimit: { speedLimitMph: 35 },
    },
};

test('a delayed surface cannot replace a newer road match with an older GPS fix', () => {
    const store = loadStore();
    store.setSharedMapPreferencesState({ userLocation: matchedFix });
    store.setSharedMapPreferencesState({
        mapTrafficEnabled: true,
        userLocation: { ...fix, recordedAt: 900 },
    });

    assert.deepEqual(
        store.getSharedMapPreferencesState().userLocation,
        matchedFix,
    );
    assert.equal(store.getSharedMapPreferencesState().mapTrafficEnabled, true);
});

test('car-only location and same-fix road enrichment publish without a phone render', () => {
    const store = loadStore();
    const phone = [];
    const car = [];
    const removePhone = store.addSharedMapPreferencesStateListener(() => {
        phone.push(store.getSharedMapUserLocation());
    });
    store.addSharedMapPreferencesStateListener(() => {
        car.push(store.getSharedMapUserLocation());
    });

    store.setSharedMapUserLocation(fix);
    store.setSharedMapUserLocation(matchedFix);
    assert.deepEqual(phone, [fix, matchedFix]);
    assert.deepEqual(car, phone);
    removePhone();

    const nextRoad = {
        ...matchedFix,
        recordedAt: 2000,
        roadMatch: {
            ...matchedFix.roadMatch,
            roadContext: { primaryText: 'First Street' },
            speedLimit: { speedLimitMph: 25 },
        },
    };
    store.setSharedMapUserLocation(nextRoad);
    store.setSharedMapUserLocation((current) => current ?? fix);
    assert.equal(car.at(-1), nextRoad);
    assert.equal(car.length, 3);
    assert.equal(phone.length, 2);
});

test('newer off-road fixes clear road data rather than preserving an obsolete limit', () => {
    const store = loadStore();
    store.setSharedMapUserLocation(matchedFix);
    const offRoad = {
        ...fix,
        recordedAt: 2000,
        roadMatch: { isOffRoad: true, speedLimit: null, roadContext: null },
    };
    store.setSharedMapUserLocation(offRoad);
    assert.equal(store.getSharedMapUserLocation(), offRoad);
});

test('every map surface subscribes directly and never echoes rendered locations', () => {
    const source = readFileSync(
        new URL('../use-map-preferences-state.js', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /useSyncExternalStore\(\s*addSharedMapPreferencesStateListener,\s*getSharedMapUserLocation,\s*getSharedMapUserLocation/,
    );
    const publication = source.match(
        /setSharedMapPreferencesState\(\{[\s\S]*?\}\);/,
    );
    assert.ok(publication);
    assert.doesNotMatch(publication[0], /userLocation/);
    assert.doesNotMatch(source, /setUserLocation\(preferences\.userLocation/);
    assert.match(
        source,
        /setUserLocation\(\s*\(currentLocation\) =>\s*currentLocation \?\? storedUserLocation/,
    );
});
