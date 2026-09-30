import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const privateCacheStorageSource = readFileSync(
    new URL('../../../lib/private-cache-storage.js', import.meta.url),
    'utf8',
);
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

function createPrivateCacheStorageHarness({ legacyEntries = {} } = {}) {
    const legacyStorage = new Map(Object.entries(legacyEntries));
    const secureStorage = new Map();
    let secureDeleteFailure = null;
    let encodingCalls = 0;
    const module = { exports: {} };
    const transformedSource = transformSync(privateCacheStorageSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        '@react-native-async-storage/async-storage': {
            getItem: async (key) => legacyStorage.get(key) ?? null,
            removeItem: async (key) => {
                legacyStorage.delete(key);
            },
            setItem: async (key, value) => {
                legacyStorage.set(key, value);
            },
        },
        'expo-secure-store': {
            AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
            deleteItemAsync: async (key) => {
                if (secureDeleteFailure?.(key)) {
                    secureDeleteFailure = null;
                    throw new Error('secure delete failed');
                }

                secureStorage.delete(key);
            },
            getItemAsync: async (key) => secureStorage.get(key) ?? null,
            setItemAsync: async (key, value) => {
                secureStorage.set(key, value);
            },
        },
        'react-native': {
            Platform: { OS: 'ios' },
        },
    };

    new Function(
        'require',
        'module',
        'exports',
        'globalThis',
        transformedSource,
    )((specifier) => mockedModules[specifier], module, module.exports, {
        TextEncoder: class extends TextEncoder {
            encode(value) {
                encodingCalls += 1;
                return super.encode(value);
            }
        },
    });

    return {
        failNextSecureDelete(predicate) {
            secureDeleteFailure = predicate;
        },
        legacyStorage,
        privateCacheStorage: module.exports,
        secureStorage,
        getEncodingCalls: () => encodingCalls,
    };
}

describe('private cache storage', () => {
    test('chunks Unicode safely without allocating an encoder result per character', async () => {
        const harness = createPrivateCacheStorageHarness();
        const value = `${'a'.repeat(1799)}😀é中${'x'.repeat(1798)}\ud800${'🚘'.repeat(1000)}`;

        await harness.privateCacheStorage.setPrivateCacheItem('unicode', value);

        assert.equal(
            await harness.privateCacheStorage.getPrivateCacheItem('unicode'),
            value,
        );
        const chunks = [...harness.secureStorage.entries()]
            .filter(([key]) => /\.\d+$/.test(key))
            .map(([, chunk]) => chunk);
        assert.ok(chunks.length > 1);
        assert.ok(
            chunks.every((chunk) => Buffer.byteLength(chunk, 'utf8') <= 1800),
        );
        assert.equal(chunks.join(''), value);
        assert.ok(harness.getEncodingCalls() <= 1);
    });
    test('round trips large route values through chunked secure storage', async () => {
        const harness = createPrivateCacheStorageHarness();
        const storageKey = 'driversagainstflock.sharedRoutingState.v1';
        const value = JSON.stringify({
            directionsRoute: {
                coordinates: Array.from({ length: 2_500 }, (_, index) => [
                    -88.2 + index / 100_000,
                    43.1 + index / 100_000,
                ]),
            },
        });

        assert.equal(
            harness.privateCacheStorage.privateCacheStorageIsEncrypted(),
            true,
        );

        await harness.privateCacheStorage.setPrivateCacheItem(
            storageKey,
            value,
        );

        assert.equal(harness.legacyStorage.has(storageKey), false);
        assert.ok(harness.secureStorage.size > 2);

        harness.legacyStorage.set(storageKey, 'legacy plaintext');

        assert.equal(
            await harness.privateCacheStorage.getPrivateCacheItem(storageKey),
            value,
        );
        assert.equal(harness.legacyStorage.has(storageKey), false);
    });

    test('migrates a legacy plaintext entry and removes it after secure write', async () => {
        const storageKey = 'driversagainstflock.mapSearch.recentLocations.v1';
        const value = JSON.stringify([
            {
                address: '123 Main Street',
                latitude: 43.1,
                longitude: -88.2,
                name: 'Home',
                placeId: 'place-123',
            },
        ]);
        const harness = createPrivateCacheStorageHarness({
            legacyEntries: { [storageKey]: value },
        });

        assert.equal(
            await harness.privateCacheStorage.getPrivateCacheItem(storageKey),
            value,
        );
        assert.equal(harness.legacyStorage.has(storageKey), false);
        assert.ok(harness.secureStorage.size > 0);
    });

    test('keeps the manifest until every encrypted chunk is deleted', async () => {
        const harness = createPrivateCacheStorageHarness();
        const storageKey = 'driversagainstflock.deviceScorecard.v1';

        await harness.privateCacheStorage.setPrivateCacheItem(
            storageKey,
            'encrypted scorecard payload',
        );

        const [manifestKey, serializedManifest] = [
            ...harness.secureStorage.entries(),
        ].find(([, value]) => value.includes('"generation"'));
        const manifest = JSON.parse(serializedManifest);
        const chunkKeyPrefix = `${manifestKey}.${manifest.generation}.`;

        harness.failNextSecureDelete((key) => key.startsWith(chunkKeyPrefix));

        await assert.rejects(
            harness.privateCacheStorage.removePrivateCacheItem(storageKey),
            /secure delete failed/,
        );
        assert.equal(harness.secureStorage.has(manifestKey), true);

        await harness.privateCacheStorage.removePrivateCacheItem(storageKey);

        assert.equal(
            [...harness.secureStorage.keys()].some(
                (key) => key === manifestKey || key.startsWith(chunkKeyPrefix),
            ),
            false,
        );
    });
});

test('strict private hydration rejects corrupt or incomplete encrypted values', async () => {
    const h = createPrivateCacheStorageHarness();
    assert.equal(
        await h.privateCacheStorage.getPrivateCacheItemStrict('presence'),
        null,
    );
    await h.privateCacheStorage.setPrivateCacheItem(
        'presence',
        'private limits',
    );
    assert.equal(
        await h.privateCacheStorage.getPrivateCacheItemStrict('presence'),
        'private limits',
    );
    const manifest = [...h.secureStorage.keys()].find((key) => {
        try {
            return JSON.parse(h.secureStorage.get(key)).chunks;
        } catch {
            return false;
        }
    });
    const chunk = [...h.secureStorage.keys()].find((key) => key !== manifest);
    h.secureStorage.delete(chunk);
    await assert.rejects(
        h.privateCacheStorage.getPrivateCacheItemStrict('presence'),
        /Incomplete/,
    );
    h.secureStorage.set(manifest, 'broken');
    await assert.rejects(
        h.privateCacheStorage.getPrivateCacheItemStrict('presence'),
        /Invalid/,
    );
});
