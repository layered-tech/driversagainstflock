import {
    classifyNwsWeather,
    WEATHER_DEFAULTS,
    weatherDistanceKm,
    weatherLocationIsValid,
    weatherObservationIsFresh,
} from './weather-policy.js';

const NWS_ORIGIN = 'https://api.weather.gov';
const USER_AGENT = 'DriversAgainstFlock (https://driversagainstflock.com)';

export function createNwsWeatherClient({
    fetchFn = fetch,
    now = Date.now,
    settings = WEATHER_DEFAULTS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
} = {}) {
    const cache = new Map();
    const inFlight = new Map();
    const upstreamInFlight = new Map();
    let selectedStation = null;
    let retryAt = 0;

    async function fetchResponse(url, ttl, signal, cacheKey) {
        if (signal.aborted) {
            throw Object.assign(new Error('NWS timeout'), {
                reason: 'timeout',
            });
        }
        if (typeof url !== 'string' || !url.startsWith(`${NWS_ORIGIN}/`)) {
            throw Object.assign(new Error('Invalid NWS endpoint'), {
                reason: 'invalid-endpoint',
            });
        }
        if (retryAt > now()) {
            throw Object.assign(new Error('NWS retry deadline'), {
                reason: 'rate-limited',
                retryAt,
            });
        }
        const entry = cache.get(cacheKey);
        if (entry && entry.expiresAt > now()) {
            return entry;
        }
        const response = await fetchFn(url, {
            signal,
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'application/geo+json',
            },
        });
        const fetchedAt = now();
        const retry = response.headers?.get('retry-after');
        if (retry) {
            const deadline = /^\d+$/.test(retry)
                ? fetchedAt + Number(retry) * 1000
                : Date.parse(retry);
            if (Number.isFinite(deadline)) {
                retryAt = Math.max(retryAt, deadline);
            }
        }
        if (!response.ok) {
            throw Object.assign(new Error(`NWS ${response.status}`), {
                reason:
                    response.status === 404 && url.includes('/points/')
                        ? 'unsupported-coverage'
                        : response.status === 429
                          ? 'rate-limited'
                          : 'upstream-unavailable',
                retryAt,
            });
        }
        const data = await response.json();
        if (signal.aborted) {
            throw Object.assign(new Error('NWS timeout'), {
                reason: 'timeout',
            });
        }
        const control = response.headers?.get('cache-control') ?? '';
        const maximum = control.match(/(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/i);
        const age = Number(response.headers?.get('age')) || 0;
        const expires = Date.parse(response.headers?.get('expires'));
        const cacheDuration = maximum
            ? Math.max(0, Number(maximum[1]) - age) * 1000
            : Number.isFinite(expires)
              ? Math.max(0, expires - fetchedAt)
              : ttl;
        const result = {
            data,
            fetchedAt,
            expiresAt: fetchedAt + Math.min(ttl, cacheDuration),
        };
        if (!/no-store|no-cache/i.test(control)) {
            cache.set(cacheKey, result);
            // Bound in-memory discovery/observation history on long drives.
            if (cache.size > 128) {
                cache.delete(cache.keys().next().value);
            }
        }
        return result;
    }

    async function request(url, ttl, signal, cacheKey = url) {
        if (signal.aborted) {
            throw Object.assign(new Error('NWS timeout'), {
                reason: 'timeout',
            });
        }
        if (!upstreamInFlight.has(cacheKey)) {
            let onAbort;
            const aborted = new Promise((_, reject) => {
                onAbort = () =>
                    reject(
                        Object.assign(new Error('NWS timeout'), {
                            reason: 'timeout',
                        }),
                    );
                signal.addEventListener('abort', onAbort, { once: true });
            });
            const pending = Promise.race([
                fetchResponse(url, ttl, signal, cacheKey),
                aborted,
            ]).finally(() => {
                signal.removeEventListener('abort', onAbort);
                upstreamInFlight.delete(cacheKey);
            });
            upstreamInFlight.set(cacheKey, pending);
        }
        const result = await upstreamInFlight.get(cacheKey);
        if (signal.aborted) {
            throw Object.assign(new Error('NWS timeout'), {
                reason: 'timeout',
            });
        }
        return result;
    }

    async function lookup(location, timeoutMs = settings.timeoutMs) {
        const controller = new AbortController();
        let timer;
        const operation = async () => {
            if (
                weatherDistanceKm(location, selectedStation?.location) >
                settings.stationDistanceKm
            ) {
                selectedStation = null;
            }
            const readStation = async (station) => {
                const result = await request(
                    `${station.id}/observations/latest`,
                    settings.observationCacheMs,
                    controller.signal,
                );
                const properties = result.data?.properties ?? {};
                const observedAt =
                    typeof properties.timestamp === 'string'
                        ? Date.parse(properties.timestamp)
                        : NaN;
                const classified = classifyNwsWeather(properties);
                const observation = {
                    ...classified,
                    observedAt,
                    fetchedAt: result.fetchedAt,
                    station: station.id,
                    stationLocation: station.location,
                    distanceKm: weatherDistanceKm(location, station.location),
                    description: properties.textDescription ?? null,
                    presentWeather: properties.presentWeather ?? null,
                    rawMessage: properties.rawMessage ?? null,
                };
                const fresh = weatherObservationIsFresh(
                    observation,
                    location,
                    now(),
                    settings,
                );
                return {
                    ...observation,
                    fresh,
                    reason: !fresh
                        ? 'stale-observation'
                        : classified.condition === 'Unknown'
                          ? 'unclassifiable'
                          : 'available',
                };
            };
            let attempts = 0;
            let lastUnknown = null;
            if (selectedStation) {
                attempts++;
                try {
                    const observation = await readStation(selectedStation);
                    // Classification uncertainty never causes station shopping.
                    if (observation.fresh) {
                        return observation;
                    }
                    lastUnknown = observation;
                } catch (error) {
                    if (error.retryAt > now() || controller.signal.aborted) {
                        throw error;
                    }
                }
            }
            const selectedId = selectedStation?.id;
            const latitude = location.latitude.toFixed(4);
            const longitude = location.longitude.toFixed(4);
            const discoveryKey = `points:${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
            const points = await request(
                `${NWS_ORIGIN}/points/${latitude},${longitude}`,
                settings.discoveryCacheMs,
                controller.signal,
                discoveryKey,
            );
            const stations = await request(
                points.data?.properties?.observationStations,
                settings.discoveryCacheMs,
                controller.signal,
            );
            const candidates = (stations.data?.features ?? [])
                .map((feature) => ({
                    id: feature.id,
                    location: {
                        longitude: feature.geometry?.coordinates?.[0],
                        latitude: feature.geometry?.coordinates?.[1],
                    },
                }))
                .filter(
                    (station) =>
                        station.id !== selectedId &&
                        weatherDistanceKm(location, station.location) <=
                            settings.stationDistanceKm,
                )
                .sort(
                    (a, b) =>
                        weatherDistanceKm(location, a.location) -
                        weatherDistanceKm(location, b.location),
                )
                .slice(0, 3 - attempts);
            for (const station of candidates) {
                try {
                    const observation = await readStation(station);
                    if (observation.fresh) {
                        selectedStation = station;
                        return observation;
                    }
                    lastUnknown = observation;
                } catch (error) {
                    if (error.retryAt > now() || controller.signal.aborted) {
                        throw error;
                    }
                }
            }
            return {
                ...lastUnknown,
                condition: 'Unknown',
                reason: lastUnknown?.reason ?? 'no-nearby-usable-station',
            };
        };
        try {
            return await Promise.race([
                operation(),
                new Promise((_, reject) => {
                    timer = setTimeoutFn(() => {
                        controller.abort();
                        reject(
                            Object.assign(new Error('NWS timeout'), {
                                reason: 'timeout',
                            }),
                        );
                    }, timeoutMs);
                }),
            ]);
        } catch (error) {
            return {
                condition: 'Unknown',
                reason: error.reason ?? 'unavailable',
                fetchedAt: now(),
                retryAt: error.retryAt ?? retryAt,
            };
        } finally {
            clearTimeoutFn(timer);
        }
    }

    return {
        getObservation(location) {
            if (!weatherLocationIsValid(location)) {
                return Promise.resolve({
                    condition: 'Unknown',
                    reason: 'missing-location',
                });
            }
            const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
            const startedAt = now();
            if (!inFlight.has(key)) {
                inFlight.set(
                    key,
                    lookup(location).finally(() => inFlight.delete(key)),
                );
            }
            return inFlight.get(key).then(async (observation) => {
                if (
                    observation.stationLocation &&
                    weatherDistanceKm(location, observation.stationLocation) >
                        settings.stationDistanceKm
                ) {
                    const remainingMs =
                        settings.timeoutMs - (now() - startedAt);
                    if (remainingMs <= 0) {
                        return {
                            condition: 'Unknown',
                            fresh: false,
                            reason: 'timeout',
                            fetchedAt: now(),
                        };
                    }
                    observation = await lookup(location, remainingMs);
                }
                return {
                    ...observation,
                    distanceKm: weatherDistanceKm(
                        location,
                        observation.stationLocation,
                    ),
                    fresh: weatherObservationIsFresh(
                        observation,
                        location,
                        now(),
                        settings,
                    ),
                };
            });
        },
    };
}
