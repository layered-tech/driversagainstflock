import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const source = readFileSync(
    new URL('../../auto-play-route-preference.js', import.meta.url),
    'utf8',
);
const { code } = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(
    (name) => {
        assert.equal(name, './map/directions');
        return {
            DIRECTIONS_ROUTE_FASTEST: 'direct',
            DIRECTIONS_ROUTE_PRIVATE: 'ideal',
        };
    },
    module,
    module.exports,
);
const { getAutoPlayInitialRouteKey } = module.exports;

test('new Auto Play routes respect the shared private-route preference', () => {
    const routeOptions = [{ routeKey: 'ideal' }, { routeKey: 'direct' }];

    assert.equal(getAutoPlayInitialRouteKey(routeOptions, true), 'ideal');
    assert.equal(getAutoPlayInitialRouteKey(routeOptions, false), 'direct');
});

test('route preference falls back when the preferred alternate is unavailable', () => {
    assert.equal(
        getAutoPlayInitialRouteKey([{ routeKey: 'ideal' }], false),
        'ideal',
    );
    assert.equal(
        getAutoPlayInitialRouteKey([{ routeKey: 'direct' }], true),
        'direct',
    );
    assert.equal(getAutoPlayInitialRouteKey([], true), null);
});
