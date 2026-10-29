import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const packageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : new URL(
          '../../../node_modules/@iternio/react-native-auto-play/',
          import.meta.url,
      ).pathname;
const flush = () => new Promise((done) => setImmediate(done));

function harness(path = 'src/templates/SearchTemplate.ts') {
    const calls = [];
    const searches = [];
    const lists = [];
    let finishPop;
    let rejectPop;
    const native = {
        SearchTemplate: {
            createSearchTemplate: (config) => searches.push(config),
            updateSearchResults: (...args) => {
                calls.push(['search-update', ...args]);
                return Promise.resolve();
            },
        },
        ListTemplate: {
            createListTemplate: (config) => lists.push(config),
            updateListTemplateSections: (...args) => {
                calls.push(['list-update', ...args]);
                return Promise.resolve();
            },
        },
    };
    const hybrid = {
        popToRootTemplate: () => {
            calls.push(['pop-root']);
            return new Promise((yes, no) => {
                finishPop = yes;
                rejectPop = no;
            });
        },
        pushTemplate: (id) => {
            calls.push(['push', id]);
            return Promise.resolve();
        },
        popToTemplate: (id) => {
            calls.push(['pop-to', id]);
            return Promise.resolve();
        },
        setTemplateHeaderActions: (...args) => {
            calls.push(['header', ...args]);
            return Promise.resolve();
        },
    };
    const mocks = {
        'react-native-nitro-modules': {
            NitroModules: { createHybridObject: (name) => native[name] },
        },
        '../hybrid/HybridAutoPlay': { HybridAutoPlay: hybrid },
        '../utils/NitroAction': {
            NitroActionUtil: { convert: (_template, value) => value },
        },
        '../utils/NitroSection': {
            NitroSectionUtil: {
                convert: (_template, value) => (value ? [value] : undefined),
            },
        },
        '../utils/NitroMapConfig': {
            NitroMapConfigUtil: {
                convert: (_template, value) => value,
                convertIos: (_template, value) => value,
            },
        },
        './Template': {
            Template: class {
                id = 'search';
            },
        },
    };
    const { code } = transformSync(
        readFileSync(resolve(packageRoot, path), 'utf8'),
        {
            filename: 'SearchTemplate.ts',
            babelrc: false,
            configFile: false,
            plugins: [
                require.resolve('@babel/plugin-transform-typescript'),
                require.resolve('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    );
    const context = vm.createContext({
        exports: {},
        console: { warn: (...args) => calls.push(['warning', ...args]) },
        require: (name) => {
            assert.ok(name in mocks, `Unexpected dependency ${name}`);
            return mocks[name];
        },
    });
    vm.runInContext(code, context);
    return {
        calls,
        searches,
        lists,
        SearchTemplate: context.exports.SearchTemplate,
        finishPop: () => finishPop(),
        rejectPop: () => rejectPop(new Error('disconnected')),
    };
}

test('map-backed submission starts the query immediately and caches updates during the native transition', async () => {
    const h = harness();
    let popped = 0;
    const submitted = [];
    const mapConfig = { ios: { showCloseButton: true } };
    const search = new h.SearchTemplate({
        title: { text: 'Search' },
        mapConfig,
        onSearchTextChanged() {},
        onSearchTextSubmitted: (query) => submitted.push(query),
        onPopped: () => popped++,
    });
    assert.equal(h.searches[0].handlesSubmittedResults, true);
    h.searches[0].onSearchTextSubmitted('Coffee');
    assert.deepEqual(submitted, ['Coffee']);
    assert.equal(h.lists.length, 0);
    h.searches[0].onPopped();
    assert.equal(
        popped,
        0,
        'removing the keyboard must not cancel the submitted request',
    );
    const section = {
        type: 'default',
        items: [{ title: { text: 'Coffee shop' } }],
    };
    await search.updateSearchResults(section);
    assert.equal(
        h.calls.some(([kind]) => kind.endsWith('update')),
        false,
    );
    h.finishPop();
    await flush();
    assert.strictEqual(h.lists[0].mapConfig, mapConfig);
    assert.strictEqual(h.lists[0].sections[0], section);
    await search.updateSearchResults({ type: 'default', items: [] });
    assert.equal(h.calls.at(-1)[0], 'list-update');
    await search.popTo();
    assert.deepEqual(Array.from(h.calls.at(-1)), ['pop-to', 'search-results']);
    h.lists[0].onPopped();
    assert.equal(popped, 1);
});

test('autocomplete and selection stay on the native SearchTemplate before submission', async () => {
    const h = harness();
    let selected = 0;
    const search = new h.SearchTemplate({
        title: { text: 'Search' },
        mapConfig: {},
        onSearchTextChanged() {},
        onSearchTextSubmitted() {},
    });
    const section = { type: 'default', items: [{ onPress: () => selected++ }] };
    await search.updateSearchResults(section);
    assert.equal(h.calls[0][0], 'search-update');
    section.items[0].onPress();
    assert.equal(selected, 1);
    assert.equal(h.lists.length, 0);
    assert.equal(
        h.calls.some(([kind]) => kind === 'pop-root'),
        false,
    );
});

test('omitting mapConfig preserves the existing native submit flow', () => {
    const h = harness();
    let submitted = 0;
    new h.SearchTemplate({
        title: { text: 'Search' },
        onSearchTextChanged() {},
        onSearchTextSubmitted: () => submitted++,
    });
    h.searches[0].onSearchTextSubmitted('Coffee');
    assert.equal(h.searches[0].handlesSubmittedResults, false);
    assert.equal(submitted, 1);
    assert.equal(h.calls.length, 0);
});

test('failed presentation cancels the search and does not push a late result list', async () => {
    const h = harness();
    let popped = 0;
    new h.SearchTemplate({
        title: { text: 'Search' },
        mapConfig: {},
        onSearchTextChanged() {},
        onSearchTextSubmitted() {},
        onPopped: () => popped++,
    });
    h.searches[0].onSearchTextSubmitted('Coffee');
    h.rejectPop();
    await flush();
    assert.equal(popped, 1);
    assert.equal(h.lists.length, 0);
});

test('CarPlay skips its temporary full-screen list when the wrapper owns submitted map results', () => {
    const swift = readFileSync(
        resolve(packageRoot, 'ios/templates/SearchTemplate.swift'),
        'utf8',
    );
    assert.match(
        swift,
        /if config\.handlesSubmittedResults == true \{\s*config\.onSearchTextSubmitted\(searchText\)\s*return/,
    );
});

for (const path of [
    'lib/templates/SearchTemplate.js',
    'lib-cjs/templates/SearchTemplate.js',
]) {
    test(`${path} ships the same map-backed search behavior`, async () => {
        const h = harness(path);
        const search = new h.SearchTemplate({
            title: { text: 'Search' },
            mapConfig: {},
            onSearchTextChanged() {},
            onSearchTextSubmitted() {},
        });
        h.searches[0].onSearchTextSubmitted('Coffee');
        h.finishPop();
        await flush();
        await search.updateSearchResults({ type: 'default', items: [] });
        assert.equal(h.lists.length, 1);
        assert.equal(h.calls.at(-1)[0], 'list-update');
    });
}
