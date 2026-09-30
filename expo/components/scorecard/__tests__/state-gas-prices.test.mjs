import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const source = readFileSync(
    new URL('../state-gas-prices.js', import.meta.url),
    'utf8',
);
const transformedSource = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
}).code;
const HOUR_MS = 60 * 60 * 1_000;
const prices = Object.fromEntries(
    'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'
        .split(' ')
        .map((stateCode) => [stateCode, stateCode === 'CA' ? 4 : 3]),
);

function createHarness({
    cachedAt = null,
    offline = false,
    failFirstRead = false,
    secure = true,
} = {}) {
    const calls = { fetch: 0, read: 0, write: 0 };
    const module = { exports: {} };
    const mocks = {
        '../../lib/private-cache-storage': {
            async getPrivateCacheItem() {
                calls.read += 1;
                if (failFirstRead && calls.read === 1) {
                    throw new Error('storage temporarily unavailable');
                }
                return cachedAt === null
                    ? null
                    : JSON.stringify({ cachedAt, prices });
            },
            async setPrivateCacheItem() {
                calls.write += 1;
            },
        },
        '../map/config': { buildApiURL: (path) => path },
        './scorecard-storage': {
            scorecardSecureStorageIsAvailable: () => secure,
        },
    };
    new Function('require', 'module', 'exports', 'fetch', transformedSource)(
        (specifier) => mocks[specifier],
        module,
        module.exports,
        async () => {
            calls.fetch += 1;
            if (offline) {
                throw new Error('offline');
            }
            return {
                ok: true,
                async json() {
                    return {
                        ok: true,
                        data: { prices, retrieved_at: '2026-09-20' },
                    };
                },
            };
        },
    );
    return { calls, getPrice: module.exports.getRegularGasPriceForState };
}

test('shares one hydration and request across state lookups and reuses fresh prices', async () => {
    const { calls, getPrice } = createHarness();
    const [texas, california] = await Promise.all([
        getPrice('TX', 10 * HOUR_MS),
        getPrice('CA', 10 * HOUR_MS),
    ]);

    assert.equal(texas.price, 3);
    assert.equal(california.price, 4);
    assert.deepEqual(calls, { fetch: 1, read: 1, write: 1 });
    assert.equal((await getPrice('TX', 11 * HOUR_MS)).price, 3);
    assert.deepEqual(calls, { fetch: 1, read: 1, write: 1 });
});

test('refreshes an in-memory snapshot when the six-hour freshness window expires', async () => {
    const { calls, getPrice } = createHarness({ cachedAt: HOUR_MS });

    assert.equal((await getPrice('TX', 2 * HOUR_MS)).price, 3);
    assert.deepEqual(calls, { fetch: 0, read: 1, write: 0 });
    await Promise.all([
        getPrice('TX', 8 * HOUR_MS),
        getPrice('CA', 8 * HOUR_MS),
    ]);
    assert.deepEqual(calls, { fetch: 1, read: 1, write: 1 });
});

test('retains offline fallback expiry and allows a failed refresh to retry', async () => {
    const { calls, getPrice } = createHarness({
        cachedAt: HOUR_MS,
        offline: true,
    });

    const results = await Promise.all([
        getPrice('TX', 8 * HOUR_MS),
        getPrice('CA', 8 * HOUR_MS),
    ]);
    assert.deepEqual(
        results.map((result) => result.price),
        [3, 4],
    );
    assert.equal(calls.fetch, 1);
    assert.equal(await getPrice('TX', 170 * HOUR_MS), null);
    assert.equal(calls.fetch, 2);
    assert.equal(calls.read, 1);
});

test('does not hydrate or fetch invalid or unsupported-device lookups', async () => {
    const unsupported = createHarness({ secure: false });
    const invalid = createHarness();

    assert.equal(await unsupported.getPrice('TX'), null);
    assert.equal(await invalid.getPrice('tx'), null);
    assert.deepEqual(unsupported.calls, { fetch: 0, read: 0, write: 0 });
    assert.deepEqual(invalid.calls, { fetch: 0, read: 0, write: 0 });
});

test('retries a failed hydration so recovered storage remains available offline', async () => {
    const { calls, getPrice } = createHarness({
        cachedAt: HOUR_MS,
        failFirstRead: true,
        offline: true,
    });

    assert.equal(await getPrice('TX', 8 * HOUR_MS), null);
    assert.equal((await getPrice('TX', 8 * HOUR_MS))?.price, 3);
    assert.equal(calls.read, 2);
});
