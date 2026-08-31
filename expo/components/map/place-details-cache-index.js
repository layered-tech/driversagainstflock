export const PLACE_DETAILS_CACHE_MAXIMUM_ENTRIES = 100;

export function getNextPlaceDetailsCacheIndex({
    placeId,
    placeIds,
    maximumEntries = PLACE_DETAILS_CACHE_MAXIMUM_ENTRIES,
}) {
    const safePlaceId = typeof placeId === 'string' ? placeId.trim() : '';
    const safeMaximumEntries = Math.max(1, Math.floor(maximumEntries) || 1);
    const existingPlaceIds = Array.isArray(placeIds)
        ? [
              ...new Set(
                  placeIds
                      .filter((item) => typeof item === 'string' && item.trim())
                      .map((item) => item.trim())
                      .filter((item) => item !== safePlaceId),
              ),
          ]
        : [];
    const nextPlaceIds = safePlaceId
        ? [...existingPlaceIds, safePlaceId]
        : existingPlaceIds;
    const evictionCount = Math.max(0, nextPlaceIds.length - safeMaximumEntries);

    return {
        evictedPlaceIds: nextPlaceIds.slice(0, evictionCount),
        placeIds: nextPlaceIds.slice(evictionCount),
    };
}
