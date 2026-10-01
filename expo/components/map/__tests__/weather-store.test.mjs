import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherStore, WEATHER_STORAGE_KEY } from '../weather-store.js';
import { WEATHER_PROFILE_DEFAULTS } from '../weather-profiles.js';

const initialTime = Date.parse('2026-10-01T12:00:00Z');
const location = { latitude: 40, longitude: -100 };
const minute = 60_000;
const settle = async () => {
    for (let index = 0; index < 12; index++) {
        await Promise.resolve();
    }
};

function harness({
    storage = null,
    fetchObservation = null,
    rolloutEnabled = true,
} = {}) {
    let time = initialTime;
    let observationCondition = 'Rain';
    let sequence = 0;
    const calls = [];
    const timers = new Map();
    const store = createWeatherStore({
        now: () => time,
        storage,
        rolloutEnabled,
        client: {
            async getObservation(actual) {
                calls.push(actual);
                return fetchObservation
                    ? fetchObservation(actual, time)
                    : {
                          condition: observationCondition,
                          observedAt: time,
                          fetchedAt: time,
                          stationLocation: { ...actual },
                          fresh: observationCondition !== 'Unknown',
                          reason:
                              observationCondition === 'Unknown'
                                  ? 'unavailable'
                                  : 'available',
                      };
            },
        },
        setTimeoutFn: (callback, ms) => {
            const id = ++sequence;
            timers.set(id, { callback, deadline: time + ms });
            return id;
        },
        clearTimeoutFn: (id) => timers.delete(id),
    });
    return {
        store,
        calls,
        timers,
        condition: (value) => {
            observationCondition = value;
        },
        advance: async (ms) => {
            time += ms;
            store.tick();
            await settle();
        },
        getTime: () => time,
    };
}

test('phone and car surfaces share state and one request lifecycle', async () => {
    const { store, calls, advance, timers } = harness();
    store.setLocation(location);
    const releasePhone = store.retainSurface();
    const releaseCar = store.retainSurface({ car: true });
    const releaseDashboard = store.retainSurface({ car: true });
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(store.getSnapshot().rendered, 'Rain');
    assert.equal(timers.size, 1);
    store.setForeground(false);
    await advance(10 * minute);
    assert.equal(calls.length, 2);
    releaseCar();
    releaseDashboard();
    assert.equal(timers.size, 0);
    await advance(10 * minute);
    assert.equal(calls.length, 2);
    store.setForeground(true);
    await settle();
    assert.equal(calls.length, 3);
    releasePhone();
    assert.equal(timers.size, 0);
});

test('no active map or no location makes no requests', async () => {
    const { store, calls } = harness();
    store.setLocation(location);
    await store.refresh();
    assert.equal(calls.length, 0);
    store.setLocation(null);
    const release = store.retainSurface();
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(store.getSnapshot().rendered, null);
    release();
});

test('failure backoff is 10/20/40 minutes and honors longer retry deadlines', async () => {
    const { store, calls, advance, getTime } = harness({
        fetchObservation: (_, time) => ({
            condition: 'Unknown',
            reason: 'unavailable',
            retryAt: calls.length === 4 ? time + 80 * minute : null,
        }),
    });
    store.setLocation(location);
    const release = store.retainSurface();
    await settle();
    assert.equal(store.getSnapshot().nextRefreshAt, getTime() + 10 * minute);
    await store.refresh();
    assert.equal(calls.length, 1);
    await advance(10 * minute);
    assert.equal(store.getSnapshot().nextRefreshAt, getTime() + 20 * minute);
    await advance(20 * minute);
    assert.equal(store.getSnapshot().nextRefreshAt, getTime() + 40 * minute);
    await advance(40 * minute);
    assert.equal(store.getSnapshot().nextRefreshAt, getTime() + 80 * minute);
    release();
});

test('outages retain accepted effect and expire from observation time', async () => {
    const { store, condition, advance } = harness();
    store.setLocation(location);
    const release = store.retainSurface({ car: true });
    await settle();
    condition('Unknown');
    await advance(89 * minute);
    assert.equal(store.getSnapshot().rendered, 'Rain');
    await advance(minute);
    assert.equal(store.getSnapshot().state.accepted, 'Unknown');
    assert.equal(store.getSnapshot().rendered, null);
    release();
});

test('late response for an old location is ignored and new geography initializes', async () => {
    let resolveOld;
    let oldRequest = true;
    const { store, calls } = harness({
        fetchObservation: (actual) => {
            if (oldRequest) {
                oldRequest = false;
                return new Promise((resolve) => {
                    resolveOld = resolve;
                });
            }
            return {
                condition: 'Snow',
                observedAt: initialTime,
                fetchedAt: initialTime,
                stationLocation: actual,
                fresh: true,
            };
        },
    });
    store.setLocation(location);
    const release = store.retainSurface();
    await settle();
    store.setLocation({ latitude: 41, longitude: -100 });
    resolveOld({
        condition: 'Rain',
        observedAt: initialTime,
        stationLocation: location,
        fresh: true,
    });
    await settle();
    assert.equal(store.getSnapshot().rendered, null);
    store.tick();
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(store.getSnapshot().rendered, 'Snow');
    release();
});

test('gradual movement invalidates retained local evidence and fetches without waiting', async () => {
    const { store, calls, condition } = harness();
    store.setLocation(location);
    const release = store.retainSurface();
    await settle();
    condition('Unknown');
    store.setLocation({ latitude: 40.1, longitude: -100 });
    store.setLocation({ latitude: 40.2, longitude: -100 });
    assert.equal(store.getSnapshot().rendered, 'Rain');
    store.setLocation({ latitude: 40.3, longitude: -100 });
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(store.getSnapshot().rendered, null);
    release();
});

test('forced/off modes work offline, reset and kill switches apply to all surfaces', async () => {
    const { store, calls } = harness();
    assert.equal(store.setMode('Rain'), true);
    assert.equal(store.getSnapshot().rendered, 'Rain');
    store.setMode('Snow');
    assert.equal(store.getSnapshot().rendered, 'Snow');
    store.setMode('Off');
    assert.equal(store.getSnapshot().rendered, null);
    store.setMode('Rain');
    store.setEnabled(false);
    assert.equal(store.getSnapshot().rendered, null);
    store.setEnabled(true);
    store.setRolloutEnabled(false);
    assert.equal(store.getSnapshot().rendered, null);
    store.setRolloutEnabled(true);
    assert.equal(store.getSnapshot().rendered, 'Rain');
    store.setMode('Automatic');
    assert.equal(store.getSnapshot().rendered, null);
    assert.equal(store.setMode('Hail'), false);
    assert.equal(calls.length, 0);
    assert.equal(store.getSnapshot().state.accepted, 'Unknown');
});

test('return to Automatic applies evidence expiry without modifying real history', async () => {
    const { store, advance, condition } = harness();
    store.setLocation(location);
    const release = store.retainSurface();
    await settle();
    store.setMode('Snow');
    assert.equal(store.getSnapshot().state.accepted, 'Rain');
    condition('Unknown');
    await advance(91 * minute);
    assert.equal(store.getSnapshot().rendered, 'Snow');
    store.setMode('Automatic');
    assert.equal(store.getSnapshot().rendered, null);
    release();
});

test('appearance persists, forced weather resets, restoration needs current physical location', async () => {
    const data = new Map();
    const storage = {
        getItem: async (key) => data.get(key) ?? null,
        setItem: async (key, value) => {
            data.set(key, value);
        },
    };
    const first = harness({ storage });
    first.store.setLocation(location);
    const release = first.store.retainSurface();
    await settle();
    first.store.setProfile('Rain', {
        ...WEATHER_PROFILE_DEFAULTS.Rain,
        density: 0.4,
    });
    first.store.setMode('Snow');
    await settle();
    release();
    const saved = JSON.parse(data.get(WEATHER_STORAGE_KEY));
    assert.equal('mode' in saved, false);
    const restored = harness({ storage });
    await restored.store.hydrate();
    assert.equal(restored.store.getSnapshot().mode, 'Automatic');
    assert.equal(restored.store.getSnapshot().rendered, null);
    assert.equal(
        restored.store.getSnapshot().preferences.profiles.Rain.density,
        0.4,
    );
    restored.store.setLocation(location);
    assert.equal(restored.store.getSnapshot().rendered, 'Rain');
    assert.equal(
        restored.store.getSnapshot().state.supporting.observedAt,
        initialTime,
    );
    await restored.advance(91 * minute);
    assert.equal(restored.store.getSnapshot().rendered, null);
});

test('invalid profile edits preserve previous appearance; reset restores defaults', () => {
    const { store } = harness();
    const original = store.getSnapshot().preferences.profiles.Rain;
    assert.ok(store.setProfile('Rain', { ...original, density: Infinity }));
    assert.equal(store.getSnapshot().preferences.profiles.Rain, original);
    assert.equal(store.setProfile('Rain', { ...original, density: 0.7 }), null);
    assert.equal(store.getSnapshot().preferences.profiles.Rain.density, 0.7);
    store.resetProfiles();
    assert.deepEqual(
        store.getSnapshot().preferences.profiles.Rain,
        WEATHER_PROFILE_DEFAULTS.Rain,
    );
});

test('debug simulations cannot overwrite real evidence or trigger requests', async () => {
    const { store, calls } = harness();
    store.setLocation(location);
    const release = store.retainSurface();
    await settle();
    const automatic = store.getSnapshot().state;
    const result = store.simulate([
        {
            location,
            now: initialTime,
            observation: {
                condition: 'Snow',
                observedAt: initialTime,
                stationLocation: location,
            },
        },
    ]);
    assert.equal(result.accepted, 'Snow');
    assert.equal(store.getSnapshot().state, automatic);
    assert.equal(store.getSnapshot().rendered, 'Rain');
    assert.equal(calls.length, 1);
    release();
});

test('expired evidence is rechecked on reconnect and phone resume', async () => {
    const { store, advance, condition } = harness();
    store.setLocation(location);
    const release = store.retainSurface();
    await settle();
    release();
    condition('Unknown');
    await advance(91 * minute);
    const reconnect = store.retainSurface({ car: true });
    await settle();
    assert.equal(store.getSnapshot().rendered, null);
    reconnect();
});

test('unreadable or malformed persisted evidence starts safely with no effect', async () => {
    for (const getItem of [
        async () => {
            throw new Error('storage unavailable');
        },
        async () => 'invalid-json',
    ]) {
        const { store } = harness({
            storage: { getItem, setItem: async () => {} },
        });
        store.setLocation(location);
        await store.hydrate();
        assert.equal(store.getSnapshot().state.accepted, 'Unknown');
        assert.equal(store.getSnapshot().state.reason, 'restore-unavailable');
        assert.equal(store.getSnapshot().rendered, null);
        assert.equal(store.getSnapshot().mode, 'Automatic');
    }
});
