import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
    new URL('../use-map-search-sheet-presentation.js', import.meta.url),
    'utf8',
);

test('does not restart place-sheet presentation retries for detail state changes', () => {
    assert.match(
        source,
        /clearScheduledPlaceSheetPresentation\(\);[\s\S]*?placeSheetPresentationFrameRef\.current = requestAnimationFrame\([\s\S]*?placeSheetPresentationRetryRef\.current = setTimeout\([\s\S]*?schedulePlaceSheetPresentation\(\);[\s\S]*?return clearScheduledPlaceSheetPresentation;/,
    );
    assert.doesNotMatch(source, /selectedPlaceDetails|selectedPlaceIsLoading/);
    assert.match(
        source,
        /const handlePlaceSheetDismiss = useCallback\(\(\) => \{\s+clearScheduledPlaceSheetPresentation\(\);\s+placeSheetIsOpenRef\.current = false;/,
    );
    assert.match(
        source,
        /if \(\s*presentPlaceSheet\(\) &&[\s\S]*?clearTimeout\(placeSheetPresentationRetryRef\.current\)/,
    );
    assert.match(
        source,
        /if \(placeSheetIsOpenRef\.current\) \{\s+placeSheetRef\.current\?\.snapToIndex\(0\);/,
    );
});

test('queues returning to results until the native place sheet finishes dismissing', () => {
    assert.match(
        source,
        /const requestResultsAfterPlaceDismiss = useCallback\(\(\) => \{[\s\S]*?resultsAfterPlaceDismissRef\.current = true;/,
    );
    const dismiss = source.slice(
        source.indexOf('const handlePlaceSheetDismiss'),
        source.indexOf('const handleSubmittedSearchResultsSheetDismiss'),
    );
    assert.match(
        dismiss,
        /if \(resultsAfterPlaceDismissRef\.current\) \{\s+resultsAfterPlaceDismissRef\.current = false;\s+presentSubmittedSearchResultsSheet\(\);/,
    );
});
