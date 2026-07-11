import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePlaceDetails } from './place-formatters';

export const PLACE_DETAILS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PLACE_DETAILS_CACHE_STORAGE_KEY_PREFIX =
    'driversagainstflock.map.placeDetails.v1.';

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

export async function getCachedPlaceDetails(placeId) {
    const cacheKey = getPlaceDetailsCacheKey(placeId);

    if (!cacheKey) {
        return null;
    }

    const storedValue = await AsyncStorage.getItem(cacheKey);
    const place = readCacheItem(storedValue, Date.now());

    if (!place && storedValue) {
        AsyncStorage.removeItem(cacheKey).catch(() => {});
    }

    return place;
}

export async function setCachedPlaceDetails(placeId, place) {
    const cacheKey = getPlaceDetailsCacheKey(placeId);
    const normalizedPlace = normalizePlaceDetails(place);

    if (!cacheKey || !normalizedPlace?.location) {
        return;
    }

    const cachedAt = Date.now();

    await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
            cachedAt,
            expiresAt: cachedAt + PLACE_DETAILS_CACHE_TTL_MS,
            place: normalizedPlace,
        }),
    );
}
