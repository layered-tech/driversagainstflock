import {
    acceptWeatherObservation,
    createWeatherState,
    getAutomaticWeatherCondition,
    reconcileWeatherState,
    WEATHER_DEFAULTS,
    weatherDistanceKm,
    weatherLocationIsValid,
} from './weather-policy.js';
import {
    restoreWeatherSettings,
    validateWeatherProfile,
} from './weather-profiles.js';

export const WEATHER_STORAGE_KEY = 'map-weather-v1';

export function createWeatherStore({
    client,
    now = Date.now,
    settings = WEATHER_DEFAULTS,
    storage = null,
    rolloutEnabled = true,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
} = {}) {
    let location = null;
    let state = createWeatherState();
    let preferences = restoreWeatherSettings();
    let mode = 'Automatic';
    let raw = null;
    let nextRefreshAt = null;
    let failures = 0;
    let request = null;
    let generation = 0;
    let timer = null;
    let hydrating = null;
    let hydrated = !storage;
    let persistence = Promise.resolve();
    let revision = 0;
    let foreground = true;
    let simulation = null;
    const surfaces = new Map();
    const renderers = new Map();
    const listeners = new Set();
    let snapshot;

    function active() {
        return [...surfaces.values()].some((car) => car || foreground);
    }

    function publish() {
        const automatic = getAutomaticWeatherCondition(
            state,
            location,
            now(),
            settings,
        );
        const condition =
            !rolloutEnabled || !preferences.enabled || mode === 'Off'
                ? 'Unknown'
                : mode === 'Automatic'
                  ? automatic
                  : mode;
        snapshot = {
            state,
            raw,
            location,
            mode,
            preferences,
            rolloutEnabled,
            automatic,
            rendered: ['Rain', 'Snow'].includes(condition) ? condition : null,
            nextRefreshAt,
            failures,
            activeSurfaces: surfaces.size,
            simulation,
            hydrated,
            renderers: [...renderers.values()],
        };
        listeners.forEach((listener) => listener());
    }

    function persist() {
        if (!storage || !hydrated) {
            return;
        }
        const serialized = JSON.stringify({ preferences, state });
        persistence = persistence
            .catch(() => {})
            .then(() => storage.setItem(WEATHER_STORAGE_KEY, serialized));
        persistence.catch(() => {});
    }

    function schedule() {
        clearTimeoutFn(timer);
        timer = null;
        if (!active() || !hydrated) {
            return;
        }
        const deadlines = [now() + settings.refreshMs];
        if (
            rolloutEnabled &&
            preferences.enabled &&
            weatherLocationIsValid(location)
        ) {
            deadlines.push(nextRefreshAt ?? now());
        }
        if (state.supporting) {
            deadlines.push(state.supporting.observedAt + settings.retentionMs);
        }
        if (state.pending) {
            deadlines.push(
                state.pending.first.observedAt + settings.candidateExpiryMs,
            );
            if (state.pending.confirmed) {
                deadlines.push(state.changedAt + settings.dwellMs);
            }
        }
        timer = setTimeoutFn(tick, Math.max(1, Math.min(...deadlines) - now()));
    }

    function tick() {
        const previous = state;
        state = reconcileWeatherState(state, location, now(), settings);
        if (state.reason === 'moved' && previous.supporting) {
            generation++;
            nextRefreshAt = null;
            failures = 0;
        }
        if (previous !== state) {
            persist();
        }
        publish();
        if (
            active() &&
            rolloutEnabled &&
            preferences.enabled &&
            hydrated &&
            location &&
            (nextRefreshAt === null || now() >= nextRefreshAt)
        ) {
            refresh();
        } else {
            schedule();
        }
    }

    async function refresh() {
        if (
            !hydrated ||
            !rolloutEnabled ||
            !preferences.enabled ||
            !location ||
            !active()
        ) {
            return;
        }
        if (request) {
            return request;
        }
        if (nextRefreshAt !== null && failures > 0 && now() < nextRefreshAt) {
            return;
        }
        const requestedLocation = { ...location };
        const requestedGeneration = generation;
        request = (async () => {
            const observation = await client
                .getObservation(requestedLocation)
                .catch(() => ({ condition: 'Unknown', reason: 'unavailable' }));
            if (
                generation !== requestedGeneration ||
                !location ||
                !active() ||
                !rolloutEnabled ||
                !preferences.enabled ||
                weatherDistanceKm(requestedLocation, location) >=
                    settings.movementKm
            ) {
                return;
            }
            raw = observation;
            state = acceptWeatherObservation(
                state,
                observation,
                location,
                now(),
                settings,
            );
            const usable =
                observation.fresh && observation.condition !== 'Unknown';
            failures = usable ? 0 : failures + 1;
            const delay = usable
                ? settings.refreshMs
                : settings.backoffMs[
                      Math.min(failures - 1, settings.backoffMs.length - 1)
                  ];
            nextRefreshAt = Math.max(now() + delay, observation.retryAt ?? 0);
            persist();
        })().finally(() => {
            request = null;
            publish();
            schedule();
        });
        return request;
    }

    async function hydrate() {
        if (hydrating || hydrated) {
            return hydrating;
        }
        const startingRevision = revision;
        hydrating = (async () => {
            try {
                const saved = JSON.parse(
                    await storage.getItem(WEATHER_STORAGE_KEY),
                );
                if (revision === startingRevision) {
                    preferences = restoreWeatherSettings(saved?.preferences);
                }
                const restored = saved?.state;
                if (
                    restored &&
                    ['Rain', 'Snow', 'Dry'].includes(restored.accepted) &&
                    restored.supporting?.condition === restored.accepted &&
                    Number.isFinite(restored.supporting?.observedAt) &&
                    restored.supporting.observedAt <=
                        now() + settings.futureToleranceMs &&
                    Number.isFinite(restored.changedAt) &&
                    weatherLocationIsValid(restored.acceptedLocation) &&
                    weatherLocationIsValid(restored.supporting.stationLocation)
                ) {
                    state = {
                        ...createWeatherState(),
                        ...restored,
                        pending: null,
                    };
                }
            } catch {
                state = {
                    ...createWeatherState(),
                    reason: 'restore-unavailable',
                };
            }
            hydrated = true;
            tick();
        })();
        return hydrating;
    }

    publish();
    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        hydrate,
        refresh,
        tick,
        reportRenderer(token, status) {
            renderers.set(token, status);
            publish();
        },
        removeRenderer(token) {
            renderers.delete(token);
            publish();
        },
        retainSurface({ car = false } = {}) {
            const token = {};
            surfaces.set(token, car);
            hydrate();
            tick();
            return () => {
                surfaces.delete(token);
                if (!active()) {
                    generation++;
                }
                publish();
                schedule();
            };
        },
        setForeground(value) {
            foreground = value;
            tick();
        },
        setLocation(value) {
            const nextLocation = weatherLocationIsValid(value)
                ? { latitude: value.latitude, longitude: value.longitude }
                : null;
            const moved =
                location &&
                nextLocation &&
                weatherDistanceKm(location, nextLocation) >=
                    settings.movementKm;
            if (moved || !nextLocation || !location) {
                generation++;
                nextRefreshAt = null;
                failures = 0;
            }
            location = nextLocation;
            tick();
        },
        setEnabled(enabled) {
            revision++;
            preferences = { ...preferences, enabled: Boolean(enabled) };
            generation++;
            persist();
            tick();
        },
        setRolloutEnabled(enabled) {
            rolloutEnabled = Boolean(enabled);
            generation++;
            tick();
        },
        setMode(value) {
            if (!['Automatic', 'Off', 'Rain', 'Snow'].includes(value)) {
                return false;
            }
            mode = value;
            tick();
            return true;
        },
        setProfile(condition, profile) {
            const error = validateWeatherProfile(condition, profile);
            if (error) {
                return error;
            }
            revision++;
            preferences = {
                ...preferences,
                profiles: {
                    ...preferences.profiles,
                    [condition]: { ...profile },
                },
            };
            persist();
            publish();
            return null;
        },
        resetProfiles() {
            revision++;
            preferences = {
                ...restoreWeatherSettings(),
                enabled: preferences.enabled,
            };
            persist();
            publish();
        },
        simulate(observations) {
            let simulatedState = createWeatherState();
            for (const entry of observations) {
                simulatedState = acceptWeatherObservation(
                    simulatedState,
                    entry.observation,
                    entry.location,
                    entry.now,
                    settings,
                );
            }
            simulation = simulatedState;
            publish();
            return simulation;
        },
    };
}
