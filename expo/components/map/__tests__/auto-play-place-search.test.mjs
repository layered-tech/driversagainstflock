import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoPlayPlaceSearch } from '../../auto-play-place-search.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(t) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const requests = [];
    const results = [];
    const errors = [];
    const loading = [];
    let tokens = 0;
    const request = (kind) => (options) =>
        new Promise((resolve, reject) => {
            requests.push({ kind, ...options, resolve, reject });
        });
    const controller = createAutoPlayPlaceSearch({
        createSessionToken: () => `session-${++tokens}`,
        getLocation: async () => [1, 2],
        minQueryLength: 2,
        onError: (error) => errors.push(error),
        onLoading: (query) => loading.push(query),
        onResults: (items, query, submitted) =>
            results.push({ items, query, submitted }),
        searchPlaces: request('autocomplete'),
        searchTextPlaces: request('submitted'),
    });
    return { controller, requests, results, errors, loading };
}

test('autocomplete debounces edits, keeps the session token and ignores stale responses', async (t) => {
    const h = harness(t);
    h.controller.change('Co');
    t.mock.timers.tick(200);
    h.controller.change('Coffee');
    t.mock.timers.tick(249);
    await flush();
    assert.equal(h.requests.length, 0);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(h.requests[0].input, 'Coffee');
    assert.deepEqual(
        h.loading,
        [],
        'CarPlay must receive actual suggestions through its one-shot completion, not a loading row',
    );
    assert.equal(h.requests[0].sessionToken, 'session-1');
    h.controller.change('Coffee shop');
    assert.equal(h.requests[0].signal.aborted, true);
    t.mock.timers.tick(250);
    await flush();
    assert.equal(h.requests[1].sessionToken, 'session-1');
    h.requests[1].resolve([{ id: 'current' }]);
    await flush();
    h.requests[0].resolve([{ id: 'stale' }]);
    await flush();
    assert.deepEqual(h.results, [
        { items: [{ id: 'current' }], query: 'Coffee shop', submitted: false },
    ]);
});

test('submission cancels autocomplete and requests full results immediately', async (t) => {
    const h = harness(t);
    h.controller.change('Coffee');
    const submitted = h.controller.submit('  Coffee shop  ');
    await flush();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].kind, 'submitted');
    assert.equal(h.requests[0].textQuery, 'Coffee shop');
    assert.deepEqual(h.loading, ['Coffee shop']);
    t.mock.timers.tick(250);
    await flush();
    assert.equal(h.requests.length, 1);
    h.requests[0].resolve([{ id: 'result' }]);
    await submitted;
    assert.equal(h.results[0].submitted, true);
});

test('clearing and closing search cancel pending work and reset billing sessions', async (t) => {
    const h = harness(t);
    h.controller.change('Coffee');
    t.mock.timers.tick(250);
    await flush();
    h.controller.change('');
    assert.equal(h.requests[0].signal.aborted, true);
    h.requests[0].reject(new Error('stale failure'));
    await flush();
    assert.equal(h.errors.length, 0);
    h.controller.change('Work');
    t.mock.timers.tick(250);
    await flush();
    assert.equal(h.requests[1].sessionToken, 'session-2');
    h.controller.cancel();
    h.requests[1].resolve([{ id: 'closed' }]);
    await flush();
    assert.deepEqual(h.results, []);
});
