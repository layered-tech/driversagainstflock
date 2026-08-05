import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const mapSearchSource = readFileSync(
    new URL('../use-map-search.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);

test('renders the submitted search results sheet with the map', () => {
    assert.match(mapScreenSource, /<SearchResultsSheet \/>/);
});

test('submitted searches leave full-screen search and present the results sheet', () => {
    assert.match(
        mapSearchSource,
        /submitSubmittedSearchQuery\(query\);\s+setSearchIsFocused\(false\);\s+setSearchPageIsVisible\(false\);\s+presentSubmittedSearchResultsSheet\(\);/,
    );
});

test('back from place details restores the submitted results sheet', () => {
    assert.match(
        mapSearchSource,
        /const handleSelectedPlaceBackToSearchResults = useCallback\(\(\) => \{[\s\S]*?dismissPlaceSheet\(\);[\s\S]*?setSearchIsFocused\(false\);\s+setSearchPageIsVisible\(false\);\s+presentSubmittedSearchResultsSheet\(\);/,
    );
});
