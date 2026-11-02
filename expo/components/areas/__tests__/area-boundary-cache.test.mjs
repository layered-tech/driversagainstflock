import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    AREA_BOUNDARIES_STORAGE_KEY,
    createAreaBoundaryCache,
} from '../area-boundary-cache.js';
import { areaCameraSettings } from '../area-map-camera.js';

const area = (id = 1, kind = 'zip') => ({
    id,
    name: '53089',
    kind,
    geometry: {
        type: 'Polygon',
        coordinates: [
            [
                [-88.4, 43],
                [-88, 43],
                [-88, 43.2],
                [-88.4, 43],
            ],
        ],
    },
    bounds: [-88.4, 43, -88, 43.2],
    counts: { added: 12 },
    alert_mode: 'daily',
});
function setup(value = null, options = {}) {
    const values = new Map([[AREA_BOUNDARIES_STORAGE_KEY, value]]);
    const cache = createAreaBoundaryCache({
        storage: {
            getItem: async (key) => values.get(key) ?? null,
            setItem: async (key, value) => values.set(key, value),
            removeItem: async (key) => values.delete(key),
        },
        hasDevice: async () => true,
        ...options,
    });
    return { cache, values };
}

test('saved ZIP and city boundaries survive restarting the cache without caching counts or alert settings', async () => {
    const { cache, values } = setup();
    await cache.replace([area(1), area(2, 'city')]);
    const restarted = setup(values.get(AREA_BOUNDARIES_STORAGE_KEY)).cache;
    const loaded = await restarted.load();
    assert.equal(loaded.length, 2);
    assert.deepEqual(loaded[0].geometry, area().geometry);
    assert.equal(loaded[1].kind, 'city');
    assert.ok(!('counts' in loaded[0]));
    assert.ok(!('alert_mode' in loaded[0]));
});

test('fresh lists prune removed areas and stopping watching evicts their saved boundary', async () => {
    const { cache, values } = setup();
    await cache.replace([area(1), area(2)]);
    await cache.remove('1');
    assert.deepEqual(
        JSON.parse(values.get(AREA_BOUNDARIES_STORAGE_KEY)).map(
            (area) => area.id,
        ),
        [2],
    );
    await cache.replace([]);
    assert.deepEqual(cache.all(), []);
    assert.deepEqual(JSON.parse(values.get(AREA_BOUNDARIES_STORAGE_KEY)), []);
});

test('late hydration cannot overwrite newer boundaries or resurrect a removed area', async () => {
    let finishRead;
    const { cache } = setup(null, {
        storage: {
            getItem: () =>
                new Promise((resolve) => {
                    finishRead = resolve;
                }),
            setItem: async () => {},
            removeItem: async () => {},
        },
    });
    const loading = cache.load();
    await Promise.resolve();
    await cache.remember(area(2));
    finishRead(JSON.stringify([area(1)]));
    await loading;
    assert.deepEqual(
        cache.all().map((area) => area.id),
        [2],
    );
});

test('a new installation does not hydrate boundaries retained from a previous device session', async () => {
    const { cache, values } = setup(JSON.stringify([area()]), {
        hasDevice: async () => false,
    });
    assert.deepEqual(await cache.load(), []);
    assert.equal(values.has(AREA_BOUNDARIES_STORAGE_KEY), false);
});

test('missing, corrupt, and incomplete cached boundaries are ignored', async () => {
    for (const value of [
        null,
        'broken',
        '{}',
        '[{"id":1,"geometry":null}]',
        '[{"id":1,"geometry":{"type":"Polygon","coordinates":[]}}]',
    ]) {
        assert.deepEqual(await setup(value).cache.load(), []);
    }
});

test('an authoritative empty list clears stale persistent boundaries before hydration finishes', async () => {
    const { cache, values } = setup(JSON.stringify([area()]));
    await cache.replace([]);
    assert.deepEqual(await cache.load(), []);
    assert.deepEqual(JSON.parse(values.get(AREA_BOUNDARIES_STORAGE_KEY)), []);
});

test('cache writes remain ordered and identical refreshes do not write again', async () => {
    const persisted = [];
    const { cache } = setup(null, {
        storage: {
            getItem: async () => null,
            removeItem: async () => {},
            setItem: async (_key, value) => {
                persisted.push(JSON.parse(value));
            },
        },
    });
    const first = cache.replace([area(1)]);
    const duplicate = cache.replace([area(1)]);
    const removed = cache.remove(1);
    await Promise.all([first, duplicate, removed]);
    assert.equal(persisted.length, 2);
    assert.equal(persisted[0][0].id, 1);
    assert.deepEqual(persisted[1], []);
});

test('background responses without geometry do not erase a known boundary', async () => {
    const { cache } = setup();
    await cache.remember(area());
    await cache.remember({ id: 1, name: '53089' });
    assert.deepEqual(cache.all()[0].geometry, area().geometry);
});

test('identical boundary refreshes have identical camera targets and point views keep their close zoom', () => {
    const initial = areaCameraSettings({ bounds: area().bounds });
    const refreshed = areaCameraSettings({ bounds: [...area().bounds] });
    assert.equal(JSON.stringify(initial), JSON.stringify(refreshed));
    assert.deepEqual(initial.bounds.ne, [-88, 43.2]);
    assert.deepEqual(
        areaCameraSettings({
            bounds: area().bounds,
            center: [-88.2, 43.1],
            fitGeometry: false,
            zoomLevel: 16,
        }),
        {
            centerCoordinate: [-88.2, 43.1],
            zoomLevel: 16,
        },
    );
});

test('Duo area boundaries fit outside either horizontal system rail', () => {
    const bounds = area().bounds;
    for (const insets of [
        { left: 0, right: 84 },
        { left: 84, right: 0 },
    ]) {
        const target = areaCameraSettings({ bounds, insets });
        assert.equal(target.bounds.paddingLeft, 40 + insets.left);
        assert.equal(target.bounds.paddingRight, 40 + insets.right);
        assert.equal(target.bounds.paddingTop, 40);
        assert.equal(target.bounds.paddingBottom, 40);
    }
});

test('Duo single-camera detail centers in the map space beside the system rail', () => {
    const target = areaCameraSettings({
        center: [-122.27, 37.8],
        zoomLevel: 16,
        insets: { left: 0, right: 84 },
    });
    assert.deepEqual(target.centerCoordinate, [-122.27, 37.8]);
    assert.equal(target.zoomLevel, 16);
    assert.deepEqual(target.padding, {
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 84,
    });
});

test('Duo map fitting leaves the measured sheet below its geometry and single-camera target', () => {
    const insets = { left: 0, right: 84 };
    const bounds = areaCameraSettings({
        bounds: area().bounds,
        insets,
        bottomInset: 350,
    });
    assert.equal(bounds.bounds.paddingBottom, 390);
    const point = areaCameraSettings({
        center: [-122.27, 37.8],
        insets,
        bottomInset: 350,
    });
    assert.equal(point.padding.paddingBottom, 350);
    assert.equal(point.padding.paddingRight, 84);
});
