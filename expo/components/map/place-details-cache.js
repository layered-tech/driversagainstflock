import {
    getPrivateCacheItem,
    removePrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import {
    getNextPlaceDetailsCacheIndex,
    PLACE_DETAILS_CACHE_MAXIMUM_ENTRIES,
} from './place-details-cache-index';
import { normalizePlaceDetails } from './place-formatters';

export const PLACE_DETAILS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PLACE_DETAILS_CACHE_STORAGE_KEY_PREFIX =
    'driversagainstflock.map.placeDetails.v1.';
const PLACE_DETAILS_CACHE_INDEX_STORAGE_KEY =
    'driversagainstflock.map.placeDetails.index.v1';

let placeDetailsCacheIndexWrite = Promise.resolve();

function getSafePlaceId(placeId) {
    return typeof placeId === 'string' ? placeId.trim() : '';
}

function getPlaceDetailsCacheKey(placeId) {
    const safePlaceId = getSafePlaceId(placeId);

    return safePlaceId
        ? `${PLACE_DETAILS_CACHE_STORAGE_KEY_PREFIX}${encodeURIComponent(safePlaceId)}`
        : '';
}

function isFreshCacheItem(cacheItem, now) {
    const expiresAt = Number(cacheItem?.expiresAt);

    return Number.isFinite(expiresAt) && expiresAt > now;
}

function readCacheItem(storedValue, now) {
    if (!storedValue) {
        return null;
    }

    try {
        const cacheItem = JSON.parse(storedValue);

        if (!isFreshCacheItem(cacheItem, now)) {
            return null;
        }

        const place = normalizePlaceDetails(cacheItem?.place);

        return place?.location ? place : null;
    } catch {
        return null;
    }
}

function readCacheIndex(storedValue) {
    try {
        const parsedIndex = JSON.parse(storedValue);

        return Array.isArray(parsedIndex?.placeIds) ? parsedIndex.placeIds : [];
    } catch {
        return [];
    }
}

function queuePlaceDetailsCacheIndexWrite(operation) {
    const nextOperation = placeDetailsCacheIndexWrite
        .catch(() => {})
        .then(operation);

    placeDetailsCacheIndexWrite = nextOperation;

    return nextOperation;
}

function updatePlaceDetailsCacheIndex(placeId) {
    return queuePlaceDetailsCacheIndexWrite(async () => {
        const storedIndex = await getPrivateCacheItem(
            PLACE_DETAILS_CACHE_INDEX_STORAGE_KEY,
        ).catch(() => null);
        const nextIndex = getNextPlaceDetailsCacheIndex({
            maximumEntries: PLACE_DETAILS_CACHE_MAXIMUM_ENTRIES,
            placeId,
            placeIds: readCacheIndex(storedIndex),
        });

        await Promise.all(
            nextIndex.evictedPlaceIds.map((evictedPlaceId) =>
                removePrivateCacheItem(getPlaceDetailsCacheKey(evictedPlaceId)),
            ),
        );
        await setPrivateCacheItem(
            PLACE_DETAILS_CACHE_INDEX_STORAGE_KEY,
            JSON.stringify({ placeIds: nextIndex.placeIds }),
        );
    });
}

export async function getCachedPlaceDetails(placeId) {
    const safePlaceId = getSafePlaceId(placeId);
    const cacheKey = getPlaceDetailsCacheKey(safePlaceId);

    if (!cacheKey) {
        return null;
    }

    const storedValue = await getPrivateCacheItem(cacheKey);
    const place = readCacheItem(storedValue, Date.now());

    if (!place && storedValue) {
        removePrivateCacheItem(cacheKey).catch(() => {});
    }

    if (place) {
        updatePlaceDetailsCacheIndex(safePlaceId).catch(() => {});
    }

    return place;
}

export async function setCachedPlaceDetails(placeId, place) {
    const safePlaceId = getSafePlaceId(placeId);
    const cacheKey = getPlaceDetailsCacheKey(safePlaceId);
    const normalizedPlace = normalizePlaceDetails(place);

    if (!cacheKey || !normalizedPlace?.location) {
        return;
    }

    const cachedAt = Date.now();

    await setPrivateCacheItem(
        cacheKey,
        JSON.stringify({
            cachedAt,
            expiresAt: cachedAt + PLACE_DETAILS_CACHE_TTL_MS,
            place: normalizedPlace,
        }),
    );
    await updatePlaceDetailsCacheIndex(safePlaceId);
}
