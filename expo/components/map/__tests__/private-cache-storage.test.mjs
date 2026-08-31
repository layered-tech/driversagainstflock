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

    new Function('require', 'module', 'exports', transformedSource)(
        (specifier) => mockedModules[specifier],
        module,
        module.exports,
    );

    return {
        failNextSecureDelete(predicate) {
            secureDeleteFailure = predicate;
        },
        legacyStorage,
        privateCacheStorage: module.exports,
        secureStorage,
    };
}

describe('private cache storage', () => {
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
