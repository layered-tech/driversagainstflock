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

function harness(path = 'src/templates/SearchTemplate.ts') {
    const calls = [];
    const searches = [];
    const lists = [];
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
    const mocks = {
        'react-native-nitro-modules': {
            NitroModules: { createHybridObject: (name) => native[name] },
        },
        '../utils/NitroAction': {
            NitroActionUtil: { convert: (_template, value) => value },
        },
        '../utils/NitroSection': {
            NitroSectionUtil: {
                convert: (_template, value) => (value ? [value] : undefined),
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
    };
}

for (const path of [
    'src/templates/SearchTemplate.ts',
    'lib/templates/SearchTemplate.js',
    'lib-cjs/templates/SearchTemplate.js',
]) {
    test(`${path} leaves submitted results under native and app control`, async () => {
        const h = harness(path);
        const submitted = [];
        let popped = 0;
        const search = new h.SearchTemplate({
            title: { text: 'Search' },
            onSearchTextChanged() {},
            onSearchTextSubmitted: (query) => submitted.push(query),
            onPopped: () => popped++,
        });

        h.searches[0].onSearchTextSubmitted('Coffee');
        assert.deepEqual(submitted, ['Coffee']);
        assert.equal(h.searches[0].handlesSubmittedResults, undefined);
        assert.deepEqual(h.calls, []);
        assert.deepEqual(h.lists, []);

        const section = {
            type: 'default',
            items: [{ title: { text: 'Coffee shop' } }],
        };
        await search.updateSearchResults(section);
        assert.deepEqual(Array.from(h.calls[0]), [
            'search-update',
            'search',
            section,
        ]);
        h.searches[0].onPopped();
        assert.equal(popped, 1);
    });
}

test('CarPlay keeps its native submitted-results screen', () => {
    const swift = readFileSync(
        resolve(packageRoot, 'ios/templates/SearchTemplate.swift'),
        'utf8',
    );
    assert.doesNotMatch(swift, /handlesSubmittedResults/);
    assert.match(swift, /let listConfig = ListTemplateConfig/);
});

test('search bindings no longer expose the removed map-results extension', () => {
    for (const path of [
        'src/templates/SearchTemplate.ts',
        'nitrogen/generated/android/c++/JSearchTemplateConfig.hpp',
        'nitrogen/generated/android/kotlin/com/margelo/nitro/swe/iternio/reactnativeautoplay/SearchTemplateConfig.kt',
        'nitrogen/generated/ios/swift/SearchTemplateConfig.swift',
        'nitrogen/generated/shared/c++/SearchTemplateConfig.hpp',
    ]) {
        assert.doesNotMatch(
            readFileSync(resolve(packageRoot, path), 'utf8'),
            /handlesSubmittedResults/,
            path,
        );
    }
});
