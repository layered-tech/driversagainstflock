import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const commonJs = require.resolve('@babel/plugin-transform-modules-commonjs');
const source = readFileSync(
    new URL('../../auto-play-saved-search-results.js', import.meta.url),
    'utf8',
);
const { code } = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [commonJs],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(
    (name) => {
        assert.equal(name, './map/saved-locations');
        return {
            createSearchResultFromSavedLocation: (location) =>
                location?.id && location?.name
                    ? {
                          id: location.id,
                          primaryText: location.name,
                          secondaryText: location.address || '',
                      }
                    : null,
            savedLocationsMatch: (first, second) =>
                Boolean(first?.id && first.id === second?.id),
        };
    },
    module,
    module.exports,
);
const { getAutoPlaySavedSearchResults } = module.exports;
const place = (id) => ({ id, name: `Place ${id}` });

test('the saved-place menu shows Recents and Favorites before Home and Work', () => {
    const suggestions = getAutoPlaySavedSearchResults({
        favoriteLocations: [place('favorite-1')],
        primaryLocations: { home: place('home'), work: place('work') },
        recentLocations: [place('recent-1'), place('recent-2')],
    });

    assert.deepEqual(
        suggestions.map(({ category, count, icon, isCategory, result }) => [
            category,
            isCategory,
            count ?? result?.id,
            icon,
        ]),
        [
            ['Recents', true, 2, 'clock'],
            ['Favorites', true, 1, 'star'],
            ['Home', false, 'home', 'house'],
            ['Work', false, 'work', 'briefcase'],
        ],
    );
});

test('Recents and Favorites remain separate even when a place is in both', () => {
    const savedLocations = {
        favoriteLocations: [place('favorite-1'), place('overlap')],
        recentLocations: [place('overlap'), place('recent-1')],
    };

    assert.deepEqual(
        getAutoPlaySavedSearchResults(savedLocations, 'Recents').map(
            ({ result }) => result.id,
        ),
        ['overlap', 'recent-1'],
    );
    assert.deepEqual(
        getAutoPlaySavedSearchResults(savedLocations, 'Favorites').map(
            ({ result }) => result.id,
        ),
        ['favorite-1', 'overlap'],
    );
    assert.deepEqual(
        getAutoPlaySavedSearchResults({
            primaryLocations: { home: place('home') },
        })
            .slice(2)
            .map(({ category }) => category),
        ['Home'],
    );
});

test('nested saved-place pages stay within six host rows and expose both directions', () => {
    const { getAutoPlaySavedSearchPage } = module.exports;
    const entries = Array.from({ length: 10 }, (_, index) => index);
    const firstPage = getAutoPlaySavedSearchPage(entries, 0);
    const secondPage = getAutoPlaySavedSearchPage(entries, 1);
    const lastPage = getAutoPlaySavedSearchPage(entries, 2);

    assert.deepEqual(firstPage, {
        hasNextPage: true,
        hasPreviousPage: false,
        page: 0,
        results: [0, 1, 2, 3],
    });
    assert.deepEqual(secondPage, {
        hasNextPage: true,
        hasPreviousPage: true,
        page: 1,
        results: [4, 5, 6, 7],
    });
    assert.deepEqual(lastPage, {
        hasNextPage: false,
        hasPreviousPage: true,
        page: 2,
        results: [8, 9],
    });
    assert.deepEqual(getAutoPlaySavedSearchPage([], 0).results, []);
});

test('saved-place category rows open nested lists and keep entries selectable', () => {
    const appSource = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    const start = appSource.indexOf('function makeInitialSavedSearchRows(');
    const end = appSource.indexOf(
        'function makeSavedSearchCategoryRows(',
        start,
    );
    const makeRows = vm.runInNewContext(`(${appSource.slice(start, end)})`, {
        getAutoPlaySavedSearchResults,
        makeAutoText: (text) => ({ text }),
        makeGlyphImage: (name) => ({ name }),
        makeDisabledSearchRow: (title) => ({ title: { text: title } }),
    });
    const selected = [];
    const openedCategories = [];
    const rows = makeRows(
        {
            primaryLocations: {
                home: { id: 'home', name: 'My house', address: 'Oak Street' },
                work: { id: 'work', name: 'Office', address: 'Market Street' },
            },
            favoriteLocations: [
                { id: 'favorite', name: 'Library', address: 'Main Street' },
            ],
            recentLocations: [{ id: 'recent', name: 'Museum' }],
        },
        (result) => selected.push(result.id),
        (category) => openedCategories.push(category),
    );

    assert.deepEqual(
        rows.map(({ title, image }) => [title.text, image.name]),
        [
            ['Recents', 'clock'],
            ['Favorites', 'star'],
            ['Home', 'house'],
            ['Work', 'briefcase'],
        ],
    );
    rows[0].onPress();
    rows[1].onPress();
    rows[2].onPress();
    rows[3].onPress();
    assert.deepEqual(openedCategories, ['Recents', 'Favorites']);
    assert.deepEqual(selected, ['home', 'work']);

    const categoryStart = appSource.indexOf(
        'function makeSavedSearchCategoryRows(',
    );
    const categoryEnd = appSource.indexOf(
        'function updateSearchTemplateResults(',
        categoryStart,
    );
    const makeCategoryRows = vm.runInNewContext(
        `(${appSource.slice(categoryStart, categoryEnd)})`,
        {
            getAutoPlaySavedSearchPage:
                module.exports.getAutoPlaySavedSearchPage,
            getAutoPlaySavedSearchResults,
            getSearchResultSubtitle: (result) => result.secondaryText,
            makeAutoText: (text) => ({ text }),
            makeGlyphImage: (name) => ({ name }),
            makeDisabledSearchRow: (title) => ({ title: { text: title } }),
        },
    );
    const pageChanges = [];
    const recentRows = makeCategoryRows(
        { recentLocations: [{ id: 'recent', name: 'Museum' }] },
        'Recents',
        0,
        (result) => selected.push(result.id),
        (page) => pageChanges.push(page),
    );
    assert.equal(recentRows[0].title.text, 'Museum');
    assert.equal(recentRows[0].image.name, 'clock');
    recentRows[0].onPress();
    assert.deepEqual(selected, ['home', 'work', 'recent']);

    const emptyRows = makeCategoryRows(
        {},
        'Favorites',
        0,
        () => {},
        () => {},
    );
    assert.equal(emptyRows[0].title.text, 'No favorite destinations');

    const manyRecentLocations = Array.from({ length: 9 }, (_, index) =>
        place(`recent-${index}`),
    );
    const pagedRows = makeCategoryRows(
        { recentLocations: manyRecentLocations },
        'Recents',
        0,
        () => {},
        (page) => pageChanges.push(page),
    );
    assert.equal(pagedRows.length, 5);
    assert.equal(pagedRows.at(-1).title.text, 'More destinations');
    pagedRows.at(-1).onPress();
    const previousPageRows = makeCategoryRows(
        { recentLocations: manyRecentLocations },
        'Recents',
        1,
        () => {},
        (page) => pageChanges.push(page),
    );
    assert.equal(previousPageRows[0].title.text, 'Previous destinations');
    previousPageRows[0].onPress();

    const appSourceHasNestedBackNavigation =
        /function openSavedSearchCategoryTemplate[\s\S]*?headerActions:\s*getBackHeaderAction[\s\S]*?onPopped/.test(
            appSource,
        );
    assert.equal(appSourceHasNestedBackNavigation, true);
    assert.deepEqual(pageChanges, [1, 0]);
});
