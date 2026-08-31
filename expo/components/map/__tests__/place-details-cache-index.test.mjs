import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    getNextPlaceDetailsCacheIndex,
    PLACE_DETAILS_CACHE_MAXIMUM_ENTRIES,
} from '../place-details-cache-index.js';

const cacheSource = readFileSync(
    new URL('../place-details-cache.js', import.meta.url),
    'utf8',
);

describe('place details cache index', () => {
    test('normalizes the place id before cache reads and writes', () => {
        const cacheOperations = cacheSource.match(
            /export async function (?:getCachedPlaceDetails|setCachedPlaceDetails)[\s\S]*?(?=\nexport async function|$)/g,
        );

        assert.equal(cacheOperations?.length, 2);

        cacheOperations.forEach((operationSource) => {
            assert.match(
                operationSource,
                /const safePlaceId = getSafePlaceId\(placeId\);/,
            );
            assert.match(
                operationSource,
                /getPlaceDetailsCacheKey\(safePlaceId\)/,
            );
        });
    });

    test('moves a refreshed entry to the most-recent position', () => {
        assert.deepEqual(
            getNextPlaceDetailsCacheIndex({
                placeId: 'second',
                placeIds: ['first', 'second', 'third'],
            }),
            { evictedPlaceIds: [], placeIds: ['first', 'third', 'second'] },
        );
    });

    test('evicts least-recent entries at the configured cardinality bound', () => {
        const placeIds = Array.from(
            { length: PLACE_DETAILS_CACHE_MAXIMUM_ENTRIES },
            (_, index) => `place-${index}`,
        );

        assert.deepEqual(
            getNextPlaceDetailsCacheIndex({ placeId: 'new-place', placeIds }),
            {
                evictedPlaceIds: ['place-0'],
                placeIds: [...placeIds.slice(1), 'new-place'],
            },
        );
    });

    test('recovers from malformed or duplicate index values without evicting the new place', () => {
        assert.deepEqual(
            getNextPlaceDetailsCacheIndex({
                placeId: 'safe-place',
                placeIds: ['safe-place', '', null, 'other-place'],
            }),
            {
                evictedPlaceIds: [],
                placeIds: ['other-place', 'safe-place'],
            },
        );
    });
});
