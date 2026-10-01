const MINUTE = 60_000;

export const WEATHER_DEFAULTS = Object.freeze({
    refreshMs: 10 * MINUTE,
    freshAgeMs: 45 * MINUTE,
    futureToleranceMs: 5 * MINUTE,
    confirmationSpacingMs: 10 * MINUTE,
    dwellMs: 20 * MINUTE,
    retentionMs: 90 * MINUTE,
    candidateExpiryMs: 45 * MINUTE,
    movementKm: 25,
    stationDistanceKm: 50,
    discoveryCacheMs: 24 * 60 * MINUTE,
    observationCacheMs: 10 * MINUTE,
    timeoutMs: 10_000,
    backoffMs: [10 * MINUTE, 20 * MINUTE, 40 * MINUTE],
});

export function weatherLocationIsValid(location) {
    return Boolean(
        location &&
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude) &&
        Math.abs(location.latitude) <= 90 &&
        Math.abs(location.longitude) <= 180,
    );
}

export function weatherDistanceKm(a, b) {
    if (!weatherLocationIsValid(a) || !weatherLocationIsValid(b)) {
        return Infinity;
    }
    const rad = Math.PI / 180;
    const latitude = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2;
    const longitude = Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
    return (
        6371 *
        2 *
        Math.asin(
            Math.min(
                1,
                Math.sqrt(
                    latitude +
                        Math.cos(a.latitude * rad) *
                            Math.cos(b.latitude * rad) *
                            longitude,
                ),
            ),
        )
    );
}

const DESCRIPTION_CONDITIONS = new Map([
    ...[
        'rain',
        'light rain',
        'heavy rain',
        'rain showers',
        'light rain showers',
        'heavy rain showers',
        'drizzle',
        'light drizzle',
        'heavy drizzle',
        'freezing rain',
        'light freezing rain',
        'heavy freezing rain',
        'freezing drizzle',
        'light freezing drizzle',
        'thunderstorm rain',
        'light rain fog/mist',
        'rain fog/mist',
    ].map((value) => [value, 'Rain']),
    ...[
        'snow',
        'light snow',
        'heavy snow',
        'snow showers',
        'light snow showers',
        'heavy snow showers',
        'rain snow',
        'light rain snow',
        'rain and snow',
        'light snow fog/mist',
    ].map((value) => [value, 'Snow']),
    ...[
        'fair',
        'clear',
        'mostly clear',
        'partly cloudy',
        'mostly cloudy',
        'overcast',
        'cloudy',
        'fog',
        'fog/mist',
        'haze',
        'smoke',
        'a few clouds',
    ].map((value) => [value, 'Dry']),
]);

export function classifyNwsWeather(properties = {}) {
    const reports = Array.isArray(properties.presentWeather)
        ? properties.presentWeather
        : [];
    const localReports = reports.filter(
        (report) => report && report.inVicinity !== true,
    );
    const rain = localReports.some((report) =>
        ['rain', 'drizzle'].includes(report.weather),
    );
    const snow = localReports.some((report) => report.weather === 'snow');
    if (rain || snow) {
        return { condition: snow ? 'Snow' : 'Rain', mixed: rain && snow };
    }
    // Non-precipitation structured reports establish dry only when every report
    // has a recognized phenomenon. Empty or incomplete reports prove nothing.
    const dryPhenomena = [
        'fog',
        'fog_mist',
        'haze',
        'smoke',
        'dust',
        'sand',
        'thunderstorms',
        'ice_pellets',
        'hail',
        'ice_crystals',
        'volcanic_ash',
    ];
    if (
        localReports.length &&
        localReports.every((report) => dryPhenomena.includes(report.weather))
    ) {
        return { condition: 'Dry', mixed: false };
    }
    if (reports.length) {
        return { condition: 'Unknown', mixed: false };
    }
    const description =
        typeof properties.textDescription === 'string'
            ? properties.textDescription
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, ' ')
            : '';
    return {
        condition: DESCRIPTION_CONDITIONS.get(description) ?? 'Unknown',
        mixed: ['rain snow', 'light rain snow', 'rain and snow'].includes(
            description,
        ),
    };
}

export function weatherObservationIsFresh(
    observation,
    location,
    now,
    settings = WEATHER_DEFAULTS,
) {
    return Boolean(
        observation &&
        Number.isFinite(observation.observedAt) &&
        now - observation.observedAt <= settings.freshAgeMs &&
        observation.observedAt - now <= settings.futureToleranceMs &&
        weatherDistanceKm(location, observation.stationLocation) <=
            settings.stationDistanceKm,
    );
}

export function createWeatherState() {
    return {
        accepted: 'Unknown',
        supporting: null,
        acceptedLocation: null,
        changedAt: null,
        pending: null,
        newestObservedAt: null,
        reason: 'no-observation',
    };
}

export function reconcileWeatherState(
    state,
    location,
    now,
    settings = WEATHER_DEFAULTS,
) {
    if (
        state.supporting &&
        now >= state.supporting.observedAt + settings.retentionMs
    ) {
        return {
            ...createWeatherState(),
            newestObservedAt: state.newestObservedAt,
            reason: 'retention-expired',
        };
    }
    if (!weatherLocationIsValid(location)) {
        return { ...state, pending: null, reason: 'missing-location' };
    }
    if (
        state.supporting &&
        (weatherDistanceKm(location, state.acceptedLocation) >=
            settings.movementKm ||
            weatherDistanceKm(location, state.supporting.stationLocation) >
                settings.stationDistanceKm)
    ) {
        return { ...createWeatherState(), reason: 'moved' };
    }
    let pending = state.pending;
    if (
        pending &&
        (now >= pending.first.observedAt + settings.candidateExpiryMs ||
            !weatherObservationIsFresh(
                pending.first,
                location,
                now,
                settings,
            ) ||
            !weatherObservationIsFresh(pending.last, location, now, settings))
    ) {
        pending = null;
    }
    if (pending?.confirmed && now >= state.changedAt + settings.dwellMs) {
        return {
            ...state,
            accepted: pending.last.condition,
            supporting: pending.last,
            acceptedLocation: { ...location },
            changedAt: now,
            pending: null,
            reason: 'accepted',
        };
    }
    return pending === state.pending ? state : { ...state, pending };
}

export function acceptWeatherObservation(
    previous,
    observation,
    location,
    now,
    settings = WEATHER_DEFAULTS,
) {
    let state = reconcileWeatherState(previous, location, now, settings);
    if (observation?.reason === 'unsupported-coverage') {
        return { ...createWeatherState(), reason: observation.reason };
    }
    if (
        !weatherLocationIsValid(location) ||
        !weatherObservationIsFresh(observation, location, now, settings) ||
        !['Rain', 'Snow', 'Dry'].includes(observation.condition)
    ) {
        return {
            ...state,
            reason: observation?.reason ?? 'unusable-observation',
        };
    }
    if (
        state.newestObservedAt !== null &&
        observation.observedAt <= state.newestObservedAt
    ) {
        return state;
    }
    state = {
        ...state,
        newestObservedAt: observation.observedAt,
        reason: 'fresh-observation',
    };
    if (
        state.accepted === 'Unknown' ||
        state.accepted === observation.condition
    ) {
        return {
            ...state,
            accepted: observation.condition,
            supporting: observation,
            acceptedLocation: { ...location },
            changedAt: state.accepted === 'Unknown' ? now : state.changedAt,
            pending: null,
        };
    }
    const sameCandidate =
        state.pending?.last.condition === observation.condition;
    const first = sameCandidate ? state.pending.first : observation;
    state.pending = {
        first,
        last: observation,
        confirmed:
            sameCandidate &&
            observation.observedAt - first.observedAt >=
                settings.confirmationSpacingMs,
    };
    return reconcileWeatherState(state, location, now, settings);
}

export function getAutomaticWeatherCondition(
    state,
    location,
    now,
    settings = WEATHER_DEFAULTS,
) {
    return weatherLocationIsValid(location)
        ? reconcileWeatherState(state, location, now, settings).accepted
        : 'Unknown';
}
