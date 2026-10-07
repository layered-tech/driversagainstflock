import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { autoPlaySearchRequestIsCurrent } from '../../auto-play-template-state.js';

const source = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const extract = (start, end) =>
    source.slice(
        source.indexOf(start),
        source.indexOf(end, source.indexOf(start)),
    );
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness({
    pop = () => Promise.resolve(),
    push = () => Promise.resolve(),
} = {}) {
    const requests = [],
        lists = [],
        errors = [],
        countdowns = [];
    const state = {};
    const context = vm.createContext({
        AbortController,
        searchAbortController: null,
        searchRequestSequence: 0,
        PLACE_SEARCH_MIN_QUERY_LENGTH: 2,
        autoPlaySearchRequestIsCurrent,
        clearAutoPlaySingleResultCountdown() {},
        clearAutoPlaySubmittedSearchResults() {},
        setAutoPlayState: (next) => Object.assign(state, next),
        setAutoPlaySubmittedSearchResults: (next) => Object.assign(state, next),
        getAutoPlaySearchLocation: async () => [1, 2],
        searchTextPlaces: (request) => {
            const response = deferred();
            requests.push({ ...request, ...response });
            return response.promise;
        },
        loadAutoPlayModule: () => ({
            HybridAutoPlay: { popToRootTemplate: pop },
            ListTemplate: class {
                constructor(config) {
                    this.config = config;
                    lists.push(this);
                }
                push() {
                    return push();
                }
            },
        }),
        getBackHeaderAction: (dismiss) => ({ dismiss }),
        getRootMapButtons: () => [],
        makeSearchRows: (results, query) =>
            results.length ? results : [{ empty: query }],
        makeAutoText: (text) => text,
        logAutoPlayPlatformAction() {},
        showAutoPlayError: (...args) => errors.push(args),
        updateSearchTemplateResults() {
            throw new Error('Dismissed search template must not be updated');
        },
        scheduleAutoPlaySingleResultAutoAdvance: (value) =>
            countdowns.push(value),
    });
    vm.runInContext(
        [
            extract(
                'function abortSearchRequest()',
                'function abortRouteLoadRequest()',
            ),
            extract('function presentAutoPlaySearchResults(', '// onBeforePop'),
            'function cancelAutoPlaySearchWork() { abortSearchRequest(); }',
        ].join('\n'),
        context,
    );
    return {
        state,
        requests,
        lists,
        errors,
        countdowns,
        run: (query, options) =>
            context.runPlaceTextSearch({}, query, undefined, options),
        cancel: () => context.abortSearchRequest(),
    };
}

test('submission loads on the map, preserves a multiword query, then opens a mapped list', async () => {
    const popped = deferred();
    const h = harness({ pop: () => popped.promise });
    const search = h.run('  New York coffee  ');
    assert.equal(h.state.searchLoading.query, 'New York coffee');
    assert.equal(h.requests.length, 0);
    popped.resolve();
    await flush();
    assert.equal(h.requests[0].textQuery, 'New York coffee');
    assert.equal(h.lists.length, 0);
    h.requests[0].resolve([{ label: 'Coffee shop' }]);
    await search;
    assert.ok(h.lists[0].config.mapConfig);
    assert.equal(h.state.query, 'New York coffee');
    assert.equal(h.state.searchLoading, null);
});

test('late responses cannot replace a newer search or clear its spinner', async () => {
    const h = harness();
    const first = h.run('Old destination');
    await flush();
    const second = h.run('New destination');
    await flush();
    assert.equal(h.requests[0].signal.aborted, true);
    h.requests[0].resolve([{ label: 'Old' }]);
    await first;
    assert.equal(h.lists.length, 0);
    assert.equal(h.state.searchLoading.query, 'New destination');
    h.requests[1].resolve([]);
    await second;
    assert.equal(h.lists.length, 1);
    assert.equal(h.lists[0].config.sections.items[0].empty, 'New destination');
});

test('popping an older result list does not abort the replacement search', async () => {
    const h = harness();
    const first = h.run('Old destination');
    await flush();
    h.requests[0].resolve([]);
    await first;
    const second = h.run('New destination');
    await flush();
    h.lists[0].config.onPopped();
    assert.equal(h.requests[1].signal.aborted, false);
    h.requests[1].resolve([]);
    await second;
});

test('cancellation suppresses late results and clears the spinner', async () => {
    const h = harness();
    const search = h.run('Coffee shop');
    await flush();
    h.cancel();
    h.requests[0].resolve([]);
    await search;
    assert.equal(h.state.searchLoading, null);
    assert.equal(h.lists.length, 0);
    assert.equal(h.errors.length, 0);
});

for (const failure of ['lookup', 'map', 'list']) {
    test(`${failure} failures clear loading and provide visible recovery`, async () => {
        const reject = () => Promise.reject(new Error('Unavailable'));
        const h = harness({
            pop: failure === 'map' ? reject : undefined,
            push: failure === 'list' ? reject : undefined,
        });
        const search = h.run('Coffee shop');
        await flush();
        if (failure === 'lookup') h.requests[0].reject(new Error('Offline'));
        if (failure === 'list') h.requests[0].resolve([]);
        await search;
        assert.equal(h.state.searchLoading, null);
        assert.equal(h.errors.length, 1);
    });
}

test('single-result countdown starts only after the native results list is presented', async () => {
    const pushed = deferred();
    const h = harness({ push: () => pushed.promise });
    const search = h.run('Coffee shop', { autoAdvanceSingleResult: true });
    await flush();
    h.requests[0].resolve([{ label: 'Coffee shop' }]);
    await flush();
    assert.equal(h.countdowns.length, 0);
    assert.ok(h.state.searchLoading);
    pushed.resolve();
    await search;
    assert.equal(h.countdowns.length, 1);
    assert.equal(h.state.searchLoading, null);
});
