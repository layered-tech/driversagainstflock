import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
    autoPlaySearchRequestIsCurrent,
    getAutoPlayVisibleSearchResults,
} from '../../auto-play-template-state.js';
import * as searchLifecycle from '../../auto-play-search-template-lifecycle.js';

const source = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const iosPlatformSource = readFileSync(
    new URL('../../auto-play-platform.ios.js', import.meta.url),
    'utf8',
);
const iosPlatform = vm.runInNewContext(
    `({${iosPlatformSource.slice(
        iosPlatformSource.indexOf('    prepareSearchMap('),
        iosPlatformSource.indexOf('    createErrorTemplate('),
    )}})`,
    { prepareCarPlaySearchMap: searchLifecycle.prepareCarPlaySearchMap },
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
    restoreRoot = () => Promise.resolve(),
    platform = 'android',
} = {}) {
    const requests = [],
        lists = [],
        errors = [],
        logs = [],
        countdowns = [];
    const state = {};
    const context = vm.createContext({
        autoPlayPlatform: platform === 'ios' ? iosPlatform : {},
        rootMapTemplate: { setRootTemplate: restoreRoot },
        rootMapTemplateIsReady: true,
        AbortController,
        searchAbortController: null,
        activeAutoPlayPlaceSearch: null,
        getAutoPlayVisibleSearchResults,
        searchRequestSequence: 0,
        PLACE_SEARCH_MIN_QUERY_LENGTH: 2,
        autoPlaySearchRequestIsCurrent,
        clearAutoPlaySubmittedSearchResults() {},
        setAutoPlayState: (next) => Object.assign(state, next),
        setAutoPlaySubmittedSearchResults: (next) =>
            Object.assign(state, {
                ...next,
                results: getAutoPlayVisibleSearchResults(next.results),
            }),
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
        makeButtonGlyphImage: () => ({}),
        getRootMapButtons: () => [],
        setAutoPlaySearchWorkflowIsActive() {},
        makeSearchRows: (results, query) =>
            results.length ? results : [{ empty: query }],
        makeAutoText: (text) => text,
        logAutoPlayPlatformAction: (...args) => logs.push(args),
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
            extract(
                'function getSearchResultsHeaderActions(',
                '// onBeforePop',
            ),
            'function cancelAutoPlaySearchWork() { abortSearchRequest(); }',
        ].join('\n'),
        context,
    );
    return {
        state,
        requests,
        lists,
        errors,
        logs,
        countdowns,
        run: (query, options) =>
            context.runPlaceTextSearch({}, query, undefined, options),
        cancel: () => context.abortSearchRequest(),
        disconnect: () => {
            context.rootMapTemplateIsReady = false;
            context.abortSearchRequest();
        },
    };
}

const emptyCarPlayStack = () =>
    new Error(
        'Error Domain=CarPlayErrorDomain Code=-1 "No templates were available to be popped." UserInfo={NSLocalizedDescription=No templates were available to be popped.}',
    );

test('CarPlay restores the existing root before searching after an empty-stack rejection', async () => {
    const restored = deferred();
    let restores = 0;
    const h = harness({
        platform: 'ios',
        pop: () => Promise.reject(emptyCarPlayStack()),
        restoreRoot: () => {
            restores++;
            return restored.promise;
        },
    });
    const search = h.run('Coffee shop');
    await flush();
    assert.equal(restores, 1);
    assert.equal(h.requests.length, 0);
    restored.resolve();
    await flush();
    h.requests[0].resolve([{ label: 'Coffee shop' }]);
    await search;
    assert.equal(h.lists.length, 1);
    assert.equal(h.errors.length, 0);
});

test('overlapping CarPlay searches share root recovery and only the latest query runs', async () => {
    const popped = deferred();
    let pops = 0;
    let restores = 0;
    const h = harness({
        platform: 'ios',
        pop: () => {
            pops++;
            return popped.promise;
        },
        restoreRoot: async () => {
            restores++;
        },
    });
    const first = h.run('Old destination');
    const second = h.run('New destination');
    popped.reject(emptyCarPlayStack());
    await flush();
    assert.equal(pops, 1);
    assert.equal(restores, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].textQuery, 'New destination');
    h.requests[0].resolve([]);
    await Promise.all([first, second]);
});

test('a disconnected CarPlay search cannot restore the old root', async () => {
    const popped = deferred();
    const h = harness({
        platform: 'ios',
        pop: () => popped.promise,
        restoreRoot: () =>
            assert.fail('must not restore a disconnected template'),
    });
    const search = h.run('Coffee shop');
    await flush();
    h.disconnect();
    popped.reject(emptyCarPlayStack());
    await search;
    assert.equal(h.requests.length, 0);
    assert.equal(h.errors.length, 0);
});

for (const [platform, error] of [
    ['android', emptyCarPlayStack()],
    [
        'ios',
        new Error('Error Domain=CarPlayErrorDomain Code=-1 "Connection lost"'),
    ],
    ['ios', new Error('No templates were available to be popped.')],
]) {
    test(`${platform} does not hide unrelated navigation errors: ${error.message}`, async () => {
        const h = harness({
            platform,
            pop: () => Promise.reject(error),
            restoreRoot: () => assert.fail('must not reset the root'),
        });
        await h.run('Coffee shop');
        assert.equal(h.requests.length, 0);
        assert.equal(h.errors.length, 1);
    });
}

test('CarPlay root restoration failures remain visible', async () => {
    const h = harness({
        platform: 'ios',
        pop: () => Promise.reject(emptyCarPlayStack()),
        restoreRoot: () => Promise.reject(new Error('Root unavailable')),
    });
    await h.run('Coffee shop');
    assert.equal(h.errors[0][1], 'Root unavailable');
    assert.equal(h.requests.length, 0);
});

test('CarPlay retries map preparation after a failed recovery', async () => {
    let pops = 0;
    const h = harness({
        platform: 'ios',
        pop: async () => {
            if (++pops === 1) throw emptyCarPlayStack();
        },
        restoreRoot: () => Promise.reject(new Error('Root unavailable')),
    });
    await h.run('First query');
    const retry = h.run('Second query');
    await flush();
    assert.equal(pops, 2);
    assert.equal(h.requests[0].textQuery, 'Second query');
    h.requests[0].resolve([]);
    await retry;
    assert.equal(h.lists.length, 1);
});

test('voice submission preserves the query and opens a full list before its optional map', async () => {
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
    assert.equal(h.lists[0].config.mapConfig, undefined);
    await h.lists[0].config.headerActions.ios.trailingNavigationBarButtons[0].onPress();
    assert.ok(h.lists[1].config.mapConfig);
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
        if (failure === 'list') {
            assert.equal(h.logs.at(-1)[0], 'search-results-push-failed');
            assert.equal(h.logs.at(-1)[1].message, 'Unavailable');
        }
    });
}

test('a sole result stays in the native list without scheduling automatic selection', async () => {
    const pushed = deferred();
    const h = harness({ push: () => pushed.promise });
    const search = h.run('Coffee shop');
    await flush();
    h.requests[0].resolve([{ label: 'Coffee shop' }]);
    await flush();
    assert.equal(h.countdowns.length, 0);
    assert.ok(h.state.searchLoading);
    pushed.resolve();
    await search;
    assert.equal(h.countdowns.length, 0);
    assert.equal(h.state.searchLoading, null);
});

test('voice offers every result first and Map reuses the top six without another lookup', async () => {
    let h;
    let pops = 0;
    h = harness({
        pop: async () => {
            if (++pops > 1) {
                h.lists[0].config.onPopped();
            }
        },
    });
    const search = h.run('Coffee');
    await flush();
    const results = Array.from({ length: 20 }, (_, id) => ({
        id,
        label: `Place ${id}`,
    }));
    h.requests[0].resolve(results);
    await search;
    assert.equal(h.lists[0].config.sections.items.length, 20);
    await h.lists[0].config.headerActions.ios.trailingNavigationBarButtons[0].onPress();
    assert.equal(h.lists[1].config.sections.items.length, 6);
    assert.equal(h.state.results.length, 6);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].signal.aborted, false);
});
