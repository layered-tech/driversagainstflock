import assert from 'node:assert/strict';
import test from 'node:test';
import { getAutoPlayViewportMetrics } from '../../auto-play-map-viewport.js';
import { createAutomotiveLocationPermissions } from '../../automotive/location-permissions.js';
import { createAutomotiveSetupStore } from '../../automotive/setup-store.js';

function permissions({
    granted = false,
    canAskAgain = true,
    services = true,
    accept = true,
} = {}) {
    let requests = 0,
        ready = 0;
    const state = { granted, canAskAgain, services };
    const runtime = createAutomotiveLocationPermissions({
        location: {
            getForegroundPermissionsAsync: async () => ({
                status: state.granted ? 'granted' : 'denied',
                canAskAgain: state.canAskAgain,
            }),
            hasServicesEnabledAsync: async () => state.services,
        },
        requestPermissions: async (names) => {
            requests++;
            assert.ok(
                names.includes('android.permission.ACCESS_FINE_LOCATION'),
            );
            state.granted = accept;
        },
        onReady: () => ready++,
    });
    return { runtime, state, counts: () => ({ requests, ready }) };
}

test('cold car startup coalesces permission requests and resumes once granted', async () => {
    const h = permissions();
    assert.equal(h.runtime.ensure(), h.runtime.ensure());
    assert.equal((await h.runtime.ensure()).ready, true);
    assert.deepEqual(h.counts(), { requests: 1, ready: 1 });
    await h.runtime.ensure();
    assert.deepEqual(h.counts(), { requests: 1, ready: 1 });
});
test('denial and permanent denial offer car-local recovery without repeated prompts', async () => {
    for (const canAskAgain of [true, false]) {
        const h = permissions({ canAskAgain, accept: false });
        const result = await h.runtime.ensure();
        assert.equal(result.ready, false);
        assert.match(result.message, /Car setup/);
        assert.doesNotMatch(result.message, /phone/);
        assert.equal(h.counts().requests, canAskAgain ? 1 : 0);
        h.state.granted = true;
        assert.equal((await h.runtime.ensure({ request: false })).ready, true);
        assert.equal(h.counts().ready, 1);
    }
});
test('disabled location and later revocation can recover without restarting the app', async () => {
    const h = permissions({ granted: true, services: false });
    assert.match((await h.runtime.ensure()).message, /turned off/);
    h.state.services = true;
    assert.equal((await h.runtime.ensure()).ready, true);
    h.state.granted = false;
    assert.equal((await h.runtime.ensure({ request: false })).ready, false);
    h.state.granted = true;
    await h.runtime.ensure();
    assert.deepEqual(h.counts(), { requests: 0, ready: 2 });
});

function setup() {
    let stored = null;
    const writes = [],
        primaries = [],
        favorites = [];
    const store = createAutomotiveSetupStore({
        read: async () => stored,
        write: async (value) => {
            stored = value;
            writes.push(value);
        },
        search: async ({ textQuery }) => [{ id: textQuery }],
        resolvePlace: async ({ placeId }) => ({
            id: placeId,
            location: { latitude: 43, longitude: -88 },
        }),
        toSavedLocation: ({ place }) =>
            place.location ? { id: place.id, ...place.location } : null,
        savePrimary: async (type, location) =>
            primaries.push({ type, location }),
        toggleFavorite: async (location) => favorites.push(location),
        getSnapshot: () => ({ favoriteLocations: favorites }),
        matches: (a, b) => a.id === b.id,
    });
    return { store, writes, primaries, favorites };
}
test('parked setup persists draft changes in order and restores them', async () => {
    const h = setup();
    assert.deepEqual(await h.store.loadDraft(), { query: '', target: 'home' });
    await Promise.all([
        h.store.saveDraft({ query: 'Madison', target: 'home' }),
        h.store.saveDraft({ query: 'Milwaukee', target: 'work' }),
    ]);
    assert.deepEqual(await h.store.loadDraft(), {
        query: 'Milwaukee',
        target: 'work',
    });
});
test('setup saves primary places and favorites without toggling an existing favorite off', async () => {
    const h = setup();
    await h.store.save('home', { id: 'h' });
    await h.store.save('work', { id: 'w' });
    await h.store.save('favorite', { id: 'f' });
    await h.store.save('favorite', { id: 'f' });
    assert.deepEqual(
        h.primaries.map((item) => item.type),
        ['home', 'work'],
    );
    assert.equal(h.favorites.length, 1);
    await assert.rejects(h.store.save('unknown', { id: 'f' }), /Choose/);
});
test('cancelled search cannot replace setup results', async () => {
    const h = setup();
    const pending = h.store.search('Madison');
    h.store.cancelSearch();
    assert.equal(await pending, null);
    assert.deepEqual(await h.store.search(' Milwaukee '), [
        { id: 'Milwaukee' },
    ]);
});

test('permission bridge failure releases the pending request so a retry can succeed', async () => {
    let fail = true;
    const runtime = createAutomotiveLocationPermissions({
        location: {
            getForegroundPermissionsAsync: async () => {
                if (fail) throw new Error('host unavailable');
                return { status: 'granted' };
            },
            hasServicesEnabledAsync: async () => true,
        },
        requestPermissions: async () => {},
    });
    await assert.rejects(runtime.ensure(), /host unavailable/);
    fail = false;
    assert.equal((await runtime.ensure()).ready, true);
});

test('Automotive portrait, landscape, and ultrawide surfaces use logical car dimensions', () => {
    for (const [pixelsWide, pixelsHigh, scale] of [
        [800, 1280, 1],
        [1024, 786, 1.5],
        [2560, 720, 2],
    ]) {
        const width = pixelsWide / scale;
        const height = pixelsHigh / scale;
        const viewport = getAutoPlayViewportMetrics({
            windowInfo: { width, height, scale },
            layoutSize: { width: 390, height: 844 },
            safeAreaInsets: { top: 20, left: 100, right: 24, bottom: 40 },
            ornamentSafeAreaLeftScale: 1,
        });
        assert.equal(viewport.width, width);
        assert.equal(viewport.height, height);
        assert.equal(viewport.cameraPadding.paddingLeft, 100);
        assert.equal(viewport.safeAreaInsets.left, 100);
        assert.equal(viewport.center.x, (100 + width - 24) / 2);
        assert.ok(viewport.visibleHeight > 0 && viewport.visibleWidth > 0);
    }
});
