import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const selectedPlaceSheetSource = readFileSync(
    new URL('../selected-place-sheet.js', import.meta.url),
    'utf8',
);
const selectedPlaceDetailsSource = readFileSync(
    new URL('../use-selected-place-details.js', import.meta.url),
    'utf8',
);
const enterpriseFieldPattern =
    /currentOpeningHours|internationalPhoneNumber|nationalPhoneNumber|priceLevel|regularOpeningHours|userRatingCount|websiteUri|\brating\b/;
const placeDetailSources = [
    '../api-mocks.js',
    '../place-formatters.js',
    '../saved-locations.js',
    '../selected-place-sheet.js',
    '../use-map-search.js',
    '../use-selected-place-details.js',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('place BottomSheet excludes Enterprise-backed details', () => {
    assert.doesNotMatch(
        selectedPlaceSheetSource,
        /selectedPlaceCurrentHoursSummary|selectedPlaceOpenNowLabel|selectedPlacePhoneNumber|selectedPlaceRatingLabel|websiteUri/,
    );
    assert.doesNotMatch(
        selectedPlaceDetailsSource,
        /getPlaceCurrentHoursSummary|getPlaceOpenNowLabel|getPlacePhoneNumber|getPlaceRatingValue|formatPlaceRating/,
    );

    for (const source of placeDetailSources) {
        assert.doesNotMatch(source, enterpriseFieldPattern);
    }
});
