import {
    getPrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import { buildApiURL } from '../map/config';
import { scorecardSecureStorageIsAvailable } from './scorecard-storage';

const GAS_PRICE_CACHE_FRESH_MS = 6 * 60 * 60 * 1000;
const GAS_PRICE_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const GAS_PRICE_STORAGE_KEY = 'driversagainstflock.scorecardStateGasPrices.v1';
const REQUEST_TIMEOUT_MS = 12 * 1000;

function normalizeGasPriceSnapshot(value) {
    const prices = value?.prices;
    const cachedAt = Number(value?.cachedAt);

    if (
        !prices ||
        typeof prices !== 'object' ||
        Array.isArray(prices) ||
        Object.keys(prices).length !== 51 ||
        !Number.isFinite(cachedAt)
    ) {
        return null;
    }

    const normalizedPrices = Object.fromEntries(
        Object.entries(prices).flatMap(([stateCode, price]) => {
            const numericPrice = Number(price);

            return /^[A-Z]{2}$/.test(stateCode) &&
                Number.isFinite(numericPrice) &&
                numericPrice > 0 &&
                numericPrice < 20
                ? [[stateCode, numericPrice]]
                : [];
        }),
    );

    if (Object.keys(normalizedPrices).length !== 51) {
        return null;
    }

    return {
        cachedAt,
        prices: normalizedPrices,
        retrievedAt:
            typeof value.retrievedAt === 'string' ? value.retrievedAt : null,
        sourceAsOf:
            typeof value.sourceAsOf === 'string' ? value.sourceAsOf : null,
    };
}

async function readCachedGasPrices() {
    try {
        const serializedSnapshot = await getPrivateCacheItem(
            GAS_PRICE_STORAGE_KEY,
        );

        return serializedSnapshot
            ? normalizeGasPriceSnapshot(JSON.parse(serializedSnapshot))
            : null;
    } catch {
        return null;
    }
}

async function fetchGasPrices(now) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(
        () => abortController.abort(),
        REQUEST_TIMEOUT_MS,
    );

    try {
        const response = await fetch(
            buildApiURL('v1/fuel-prices/state-averages'),
            {
                headers: { Accept: 'application/json' },
                signal: abortController.signal,
            },
        );
        const payload = await response.json().catch(() => null);

        if (!response.ok || payload?.ok !== true) {
            return null;
        }

        const snapshot = normalizeGasPriceSnapshot({
            cachedAt: now,
            prices: payload?.data?.prices,
            retrievedAt: payload?.data?.retrieved_at,
            sourceAsOf: payload?.data?.source_as_of,
        });

        if (!snapshot) {
            return null;
        }

        await setPrivateCacheItem(
            GAS_PRICE_STORAGE_KEY,
            JSON.stringify(snapshot),
        ).catch(() => {});

        return snapshot;
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function getRegularGasPriceForState(stateCode, now = Date.now()) {
    if (
        !scorecardSecureStorageIsAvailable() ||
        typeof stateCode !== 'string' ||
        !/^[A-Z]{2}$/.test(stateCode)
    ) {
        return null;
    }

    const cachedSnapshot = await readCachedGasPrices();
    const cacheAge = cachedSnapshot ? now - cachedSnapshot.cachedAt : Infinity;
    const snapshot =
        cacheAge >= 0 && cacheAge <= GAS_PRICE_CACHE_FRESH_MS
            ? cachedSnapshot
            : ((await fetchGasPrices(now)) ??
              (cacheAge >= 0 && cacheAge <= GAS_PRICE_CACHE_STALE_MS
                  ? cachedSnapshot
                  : null));
    const price = snapshot?.prices?.[stateCode];

    return Number.isFinite(price)
        ? {
              price,
              retrievedAt: snapshot.retrievedAt,
              sourceAsOf: snapshot.sourceAsOf,
              stateCode,
          }
        : null;
}
