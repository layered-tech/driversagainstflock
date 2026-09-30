import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as primaryLocations from '../primary-locations.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const source = transformSync(
    readFileSync(new URL('../saved-locations.js', import.meta.url), 'utf8'),
    { babelrc: false, configFile: false, plugins: [transformModulesCommonJs] },
).code;
const storagePrefix = 'driversagainstflock.mapSearch.';
const place = (id) => ({ id, name: id, latitude: 43, longitude: -88 });

function createHarness({ beforeRead = async () => {} } = {}) {
    const storage = new Map();
    const reads = [];
    const writes = [];
    let failRead = false;
    let failWrite = false;
    const module = { exports: {} };
    const modules = {
        './primary-locations': primaryLocations,
        '../../lib/private-cache-storage': {
            async getPrivateCacheItem(key) {
                reads.push(key);
                await beforeRead(key);
                if (failRead) {
                    failRead = false;
                    throw new Error('read failed');
                }
                return storage.get(key) ?? null;
            },
            async setPrivateCacheItem(key, value) {
                writes.push(key);
                if (failWrite) {
                    failWrite = false;
                    throw new Error('write failed');
                }
                storage.set(key, value);
            },
        },
    };
    new Function('require', 'module', 'exports', source)(
        (name) => modules[name],
        module,
        module.exports,
    );
    return {
        ...module.exports,
        reads,
        writes,
        storage,
        failNextRead() {
            failRead = true;
        },
        failNextWrite() {
            failWrite = true;
        },
    };
}

test('phone and car share one hydration and normalized saved-place snapshot', async () => {
    const store = createHarness();
    const [phone, car] = await Promise.all([
        store.loadSearchSavedLocations(),
        store.loadPrimaryLocations(),
    ]);
    const reopened = await store.loadSearchSavedLocations();
    assert.equal(store.reads.length, 3);
    assert.equal(phone.primaryLocations, car);
    assert.equal(reopened.favoriteLocations, phone.favoriteLocations);
    assert.equal(reopened.recentLocations, phone.recentLocations);
});

test('slow initial hydration cannot replace a favorite committed by another surface', async () => {
    let releasePrimary;
    const primaryRead = new Promise((resolve) => {
        releasePrimary = resolve;
    });
    const store = createHarness({
        beforeRead: (key) =>
            key.endsWith('primaryLocations.v1') ? primaryRead : undefined,
    });
    const initialLoad = store.loadSearchSavedLocations();

    await store.toggleFavoriteLocation(place('new-favorite'));
    releasePrimary();

    assert.equal((await initialLoad).favoriteLocations[0]?.id, 'new-favorite');
});

test('concurrent recent and favorite changes preserve every update', async () => {
    const store = createHarness();
    await Promise.all([
        store.addRecentLocation(place('first')),
        store.addRecentLocation(place('second')),
        store.toggleFavoriteLocation(place('first')),
        store.toggleFavoriteLocation(place('second')),
    ]);
    const saved = await store.loadSearchSavedLocations();
    assert.deepEqual(
        saved.recentLocations.map(({ id }) => id),
        ['second', 'first'],
    );
    assert.deepEqual(
        saved.favoriteLocations.map(({ id }) => id),
        ['second', 'first'],
    );
    await Promise.all([
        store.toggleFavoriteLocation(place('first')),
        store.toggleFavoriteLocation(place('first')),
    ]);
    assert.equal(
        (await store.loadSearchSavedLocations()).favoriteLocations.length,
        2,
    );
});

test('primary changes from separate surfaces merge and publish after persistence', async () => {
    const store = createHarness();
    const seen = [];
    store.addPrimaryLocationsListener((locations) => seen.push(locations));
    await Promise.all([
        store.savePrimaryLocation('home', place('home')),
        store.savePrimaryLocation('work', place('work')),
    ]);
    const saved = await store.loadPrimaryLocations();
    assert.equal(saved.home.id, 'home');
    assert.equal(saved.work.id, 'work');
    assert.equal(seen.at(-1), saved);
    assert.deepEqual(
        JSON.parse(store.storage.get(`${storagePrefix}primaryLocations.v1`)),
        saved,
    );
});

test('failed reads retry and failed writes neither publish nor poison later updates', async () => {
    const store = createHarness();
    store.failNextRead();
    await assert.rejects(store.loadPrimaryLocations(), /read failed/);
    assert.deepEqual(await store.loadPrimaryLocations(), {
        home: null,
        work: null,
    });
    const seen = [];
    store.addPrimaryLocationsListener((value) => seen.push(value));
    store.failNextWrite();
    await assert.rejects(
        store.savePrimaryLocation('home', place('lost')),
        /write failed/,
    );
    assert.equal(seen.length, 0);
    assert.equal((await store.loadPrimaryLocations()).home, null);
    await store.savePrimaryLocation('work', place('work'));
    assert.equal((await store.loadPrimaryLocations()).work.id, 'work');
});

test('all search consumers receive committed updates and can unsubscribe', async () => {
    const store = createHarness();
    await store.loadSearchSavedLocations();
    const seen = [];
    const remove = store.addSearchSavedLocationsListener((snapshot) =>
        seen.push(snapshot),
    );
    await store.addRecentLocation(place('first'));
    await store.toggleFavoriteLocation(place('first'));
    await store.savePrimaryLocation('home', place('home'));
    assert.equal(seen.length, 3);
    assert.equal(seen.at(-1).favoriteLocations[0].id, 'first');
    assert.equal(seen.at(-1).recentLocations[0].id, 'first');
    assert.equal(seen.at(-1).primaryLocations.home.id, 'home');
    remove();
    await store.addRecentLocation(place('second'));
    assert.equal(seen.length, 3);
});

test('reopening an unchanged favorite avoids another write or subscriber update', async () => {
    const store = createHarness();
    await store.toggleFavoriteLocation(place('first'));
    const before = await store.loadSearchSavedLocations();
    const writesBefore = store.writes.length;
    const seen = [];
    store.addSearchSavedLocationsListener((snapshot) => seen.push(snapshot));

    const unchanged = await store.updateFavoriteLocation(place('first'));

    assert.equal(unchanged, before.favoriteLocations);
    assert.equal(store.writes.length, writesBefore);
    assert.equal(seen.length, 0);
    await store.updateFavoriteLocation({ ...place('first'), name: 'Updated' });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].favoriteLocations[0].name, 'Updated');
});

test('a failed subscriber cannot prevent hydration or delivery to other surfaces', async () => {
    const store = createHarness();
    store.addSearchSavedLocationsListener(() => {
        throw new Error('unmounted');
    });
    const seen = [];
    store.addSearchSavedLocationsListener((snapshot) => seen.push(snapshot));
    await store.loadSearchSavedLocations();
    await store.savePrimaryLocation('home', place('home'));
    assert.equal(seen.at(-1).primaryLocations.home.id, 'home');
});
