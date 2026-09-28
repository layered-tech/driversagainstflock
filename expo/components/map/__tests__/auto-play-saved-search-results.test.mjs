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

test('saved Home comes first, followed by distinct favorites and recents', () => {
    const suggestions = getAutoPlaySavedSearchResults({
        favoriteLocations: [
            place('home'),
            place('favorite-1'),
            place('favorite-2'),
            place('favorite-3'),
            place('favorite-4'),
        ],
        primaryLocations: { home: place('home'), work: null },
        recentLocations: [
            place('favorite-2'),
            place('recent-1'),
            place('recent-2'),
            place('recent-3'),
            place('recent-4'),
        ],
    });

    assert.deepEqual(
        suggestions.map(({ category, result }) => [category, result.id]),
        [
            ['Home', 'home'],
            ['Favorite', 'favorite-1'],
            ['Favorite', 'favorite-2'],
            ['Favorite', 'favorite-3'],
            ['Recent', 'recent-1'],
            ['Recent', 'recent-2'],
        ],
    );
});

test('Home and Work stay above both groups when they are set', () => {
    const suggestions = getAutoPlaySavedSearchResults({
        favoriteLocations: [
            place('work'),
            place('favorite-1'),
            place('favorite-2'),
            place('favorite-3'),
        ],
        primaryLocations: { home: place('home'), work: place('work') },
        recentLocations: [
            place('home'),
            place('recent-1'),
            place('recent-2'),
            place('recent-3'),
        ],
    });

    assert.deepEqual(
        suggestions.map(({ category, result }) => [category, result.id]),
        [
            ['Home', 'home'],
            ['Work', 'work'],
            ['Favorite', 'favorite-1'],
            ['Favorite', 'favorite-2'],
            ['Recent', 'recent-1'],
            ['Recent', 'recent-2'],
        ],
    );
});

test('one saved-place group fills unused car search rows', () => {
    const favoriteLocations = Array.from({ length: 7 }, (_, index) =>
        place(`favorite-${index}`),
    );
    const favoriteOnly = getAutoPlaySavedSearchResults({ favoriteLocations });
    assert.equal(favoriteOnly.length, 6);
    assert.deepEqual(
        favoriteOnly.map(({ result }) => result.id),
        favoriteLocations.slice(0, 6).map(({ id }) => id),
    );

    const workAndFavorites = getAutoPlaySavedSearchResults({
        favoriteLocations,
        primaryLocations: { home: null, work: place('work') },
    });
    assert.equal(workAndFavorites[0].category, 'Work');
    assert.deepEqual(
        workAndFavorites.slice(1).map(({ result }) => result.id),
        favoriteLocations.slice(0, 5).map(({ id }) => id),
    );

    const recentOnly = getAutoPlaySavedSearchResults({
        recentLocations: [null, place('recent-1'), place('recent-2')],
    });
    assert.deepEqual(
        recentOnly.map(({ category, result }) => [category, result.id]),
        [
            ['Recent', 'recent-1'],
            ['Recent', 'recent-2'],
        ],
    );
    assert.deepEqual(getAutoPlaySavedSearchResults(), []);
    assert.deepEqual(getAutoPlaySavedSearchResults(null), []);
});

test('initial car rows identify saved places and keep them selectable', () => {
    const appSource = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    const start = appSource.indexOf('function makeInitialSavedSearchRows(');
    const end = appSource.indexOf(
        'function updateSearchTemplateResults(',
        start,
    );
    const makeRows = vm.runInNewContext(`(${appSource.slice(start, end)})`, {
        getAutoPlaySavedSearchResults,
        makeAutoText: (text) => ({ text }),
        makeDisabledSearchRow: (title) => ({ title: { text: title } }),
    });
    const selected = [];
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
    );

    assert.equal(rows[0].title.text, 'Home');
    assert.equal(rows[0].detailedText.text, 'My house - Oak Street');
    assert.equal(rows[1].title.text, 'Work');
    assert.equal(rows[1].detailedText.text, 'Office - Market Street');
    assert.equal(rows[2].title.text, 'Library');
    assert.equal(rows[2].detailedText.text, 'Favorite - Main Street');
    assert.equal(rows[3].detailedText.text, 'Recent');
    rows[0].onPress();
    rows[1].onPress();
    rows[2].onPress();
    rows[3].onPress();
    assert.deepEqual(selected, ['home', 'work', 'favorite', 'recent']);
    assert.equal(
        makeRows({}, () => {})[0].title.text,
        'No favorites or recents',
    );
});
