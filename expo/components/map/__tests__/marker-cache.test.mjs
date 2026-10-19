import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarkerCache, MARKER_CACHE_FRESH_MS } from '../marker-cache.js';

const bounds = { sw_lng: -88.3, sw_lat: 43, ne_lng: -88.1, ne_lat: 43.2 };
const camera = { sw: [-88.25, 43.05], ne: [-88.15, 43.15] };

test('completed coverage survives a cache restart, including valid empty areas', async () => {
    let saved;
    const options = {
        read: async () => saved,
        write: async (value) => {
            saved = value;
        },
        now: () => 1000,
    };
    const first = createMarkerCache(options);
    await first.hydrate();
    await first.put({ bounds, points: [], loadedAt: 1000 });
    const restarted = createMarkerCache(options);
    await restarted.hydrate();
    assert.deepEqual(restarted.find(camera), {
        bounds,
        points: [],
        loadedAt: 1000,
    });
    assert.equal(restarted.find({ sw: [0, 0], ne: [1, 1] }), null);
});

test('stale cache remains available offline but expires after seven days', async () => {
    let now = 1000;
    const cache = createMarkerCache({
        read: async () => null,
        write: async () => {},
        now: () => now,
    });
    await cache.hydrate();
    await cache.put({ bounds, points: [{ id: 1 }], loadedAt: now });
    now += MARKER_CACHE_FRESH_MS + 1;
    assert.equal(cache.find(camera).points[0].id, 1);
    now += 7 * 86400000;
    assert.equal(cache.find(camera), null);
});

test('corrupt storage and failed writes do not prevent subsequent cache use', async () => {
    let writes = 0;
    const cache = createMarkerCache({
        read: async () => '{bad',
        write: async () => {
            if (++writes === 1) throw Error('disk');
        },
    });
    await cache.hydrate();
    await cache.put({ bounds, points: [], loadedAt: Date.now() });
    await cache.put({ bounds, points: [{ id: 2 }], loadedAt: Date.now() });
    assert.equal(cache.find(camera).points[0].id, 2);
    assert.equal(writes, 2);
});

test('cache bounds storage size and replaces an area instead of retaining deleted markers', async () => {
    let saved;
    const cache = createMarkerCache({
        read: async () => null,
        write: async (v) => {
            saved = v;
        },
    });
    await cache.hydrate();
    await cache.put({ bounds, points: [{ id: 1 }], loadedAt: Date.now() });
    await cache.put({ bounds, points: [], loadedAt: Date.now() });
    assert.deepEqual(cache.find(camera).points, []);
    await cache.put({
        bounds,
        points: [{ payload: 'x'.repeat(500001) }],
        loadedAt: Date.now(),
    });
    assert.ok(saved.length <= 500000);
});

test('a contribution invalidation wins over disk hydration already in flight', async () => {
    let resolveRead;
    const cache = createMarkerCache({
        read: () =>
            new Promise((resolve) => {
                resolveRead = resolve;
            }),
        write: async () => {},
    });
    const hydration = cache.hydrate();
    await new Promise(setImmediate);
    await cache.clear();
    resolveRead(
        JSON.stringify([{ bounds, points: [{ id: 1 }], loadedAt: Date.now() }]),
    );
    await hydration;
    assert.equal(cache.find(camera), null);
});

test('keeps at most eight completed areas and does not evict them for one oversized response', async () => {
    let saved;
    const cache = createMarkerCache({
        read: async () => null,
        write: async (v) => {
            saved = v;
        },
    });
    await cache.hydrate();
    for (let i = 0; i < 10; i++) {
        await cache.put({
            bounds: { ...bounds, sw_lat: 40 + i * 0.01 },
            points: [],
            loadedAt: Date.now(),
        });
    }
    assert.equal(JSON.parse(saved).length, 8);
    await cache.put({
        bounds: { ...bounds, sw_lat: 0 },
        points: [{ payload: 'x'.repeat(500001) }],
        loadedAt: Date.now(),
    });
    assert.equal(JSON.parse(saved).length, 8);
});
