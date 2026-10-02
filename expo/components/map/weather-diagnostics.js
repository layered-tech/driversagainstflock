import {
    reconcileWeatherState,
    WEATHER_DEFAULTS,
    weatherDistanceKm,
    weatherLocationIsValid,
    weatherObservationIsFresh,
} from './weather-policy.js';

function timestamp(value) {
    const date = new Date(value);
    return Number.isFinite(value) && Number.isFinite(date.getTime())
        ? date.toISOString()
        : 'Unavailable';
}

function observationTime(value, now) {
    return Number.isFinite(value)
        ? `${timestamp(value)} (${((now - value) / 60_000).toFixed(1)} min old)`
        : 'Unavailable';
}

function stationDescription(observation, location) {
    if (!observation?.station) {
        return 'Unavailable';
    }
    const distance = weatherDistanceKm(location, observation.stationLocation);
    return `${observation.station.split('/').at(-1)}${Number.isFinite(distance) ? ` (${distance.toFixed(1)} km away)` : ''}`;
}

function effectPolicy(weather, state) {
    if (!weather.rolloutEnabled) {
        return 'Weather rollout disabled';
    }
    if (!weather.preferences.enabled) {
        return 'Weather effects disabled';
    }
    if (weather.mode === 'Off') {
        return 'Override Off';
    }
    if (weather.mode !== 'Automatic') {
        return `Forced ${weather.mode}; NWS does not select the effect`;
    }
    if (!weather.hydrated) {
        return 'Restoring saved weather';
    }
    if (!weatherLocationIsValid(weather.location)) {
        return 'Waiting for physical location';
    }
    return state.accepted === 'Dry'
        ? `Dry; no precipitation effect (${state.reason})`
        : state.accepted === 'Unknown'
          ? `No accepted weather (${state.reason})`
          : `Using accepted ${state.accepted} (${state.reason})`;
}

export function getWeatherDiagnostics(
    weather,
    now = Date.now(),
    settings = WEATHER_DEFAULTS,
) {
    const state = reconcileWeatherState(
        weather.state,
        weather.location,
        now,
        settings,
    );
    const raw = weather.raw;
    const observedAt = state.supporting?.observedAt;
    const automatic = weatherLocationIsValid(weather.location)
        ? state.accepted
        : 'Unknown';
    const dwellDeadline =
        state.changedAt === null ? null : state.changedAt + settings.dwellMs;
    let validity = 'Unavailable';
    if (raw && Number.isFinite(raw.observedAt)) {
        validity = !weatherLocationIsValid(weather.location)
            ? 'No physical location'
            : !weatherLocationIsValid(raw.stationLocation)
              ? 'Unavailable station location'
              : weatherDistanceKm(weather.location, raw.stationLocation) >
                  settings.stationDistanceKm
                ? 'Too far from current location'
                : weatherObservationIsFresh(
                        raw,
                        weather.location,
                        now,
                        settings,
                    )
                  ? 'Fresh'
                  : raw.observedAt - now > settings.futureToleranceMs
                    ? 'Future observation'
                    : 'Stale observation';
    }
    const failures = `${weather.failures} failure${weather.failures === 1 ? '' : 's'}`;
    const refresh = weather.refreshing
        ? 'Fetching NWS now'
        : !weather.hydrated ||
            !weather.rolloutEnabled ||
            !weather.preferences.enabled
          ? 'Paused by weather settings or initialization'
          : !weather.active
            ? 'Paused; no active map surface'
            : !weatherLocationIsValid(weather.location)
              ? 'Waiting for physical location'
              : `Next ${timestamp(weather.nextRefreshAt)}`;
    const rows = [
        {
            label: 'NWS report',
            value: raw
                ? `${raw.condition ?? 'Unknown'}${raw.intensityBucket ? ` (${raw.intensityBucket})` : ''} — ${raw.description ?? 'No description'}`
                : 'No response this session',
        },
        {
            label: 'NWS result',
            value: raw?.reason ?? 'No response this session',
        },
        { label: 'NWS data fetched', value: timestamp(raw?.fetchedAt) },
        {
            label: 'NWS station',
            value: stationDescription(raw, weather.location),
        },
        {
            label: 'NWS observation',
            value: observationTime(raw?.observedAt, now),
        },
        { label: 'NWS validity', value: validity },
        {
            label: 'Present weather',
            value: Array.isArray(raw?.presentWeather)
                ? JSON.stringify(raw.presentWeather)
                : 'Not provided',
        },
        {
            label: 'Automatic weather',
            value: `${automatic}${['Rain', 'Snow'].includes(automatic) ? ` (${state.intensity.bucket})` : ''}`,
        },
        {
            label: 'Accepted observation',
            value: `${stationDescription(state.supporting, weather.location)}; ${observationTime(observedAt, now)}`,
        },
        {
            label: 'Effect target',
            value: weather.rendered
                ? `${weather.rendered} (${weather.renderedIntensityBucket})`
                : 'None',
        },
        { label: 'Effect policy', value: effectPolicy(weather, state) },
        {
            label: 'Pending change',
            value: state.pending
                ? `${state.pending.last.condition}; ${state.pending.confirmed ? `confirmed, waiting for dwell until ${timestamp(dwellDeadline)}` : 'waiting for confirmation from another observation'}`
                : 'None',
        },
        { label: 'NWS refresh', value: `${refresh}; ${failures}` },
        {
            label: 'Last NWS request',
            value: `Started ${timestamp(weather.lastRefreshStartedAt)}; completed ${timestamp(weather.lastRefreshCompletedAt)}`,
        },
    ];
    if (raw?.rawMessage) {
        rows.push({ label: 'METAR', value: raw.rawMessage });
    }
    for (const renderer of weather.renderers) {
        rows.push({
            label: `${renderer.surface} renderer`,
            value: !renderer.supported
                ? 'Native weather renderer unsupported'
                : `${renderer.effect ?? 'No effect'}; ${renderer.visible ? 'visible' : 'hidden'}; density ${renderer.density ?? 0}`,
        });
    }
    if (!weather.renderers.length) {
        rows.push({ label: 'Map renderers', value: 'No renderer attached' });
    }
    return {
        rows,
        details: {
            raw,
            accepted: weather.state.accepted,
            automatic,
            rendered: weather.rendered,
            rawIntensityBucket: raw?.intensityBucket ?? null,
            acceptedIntensity: state.intensity,
            renderedIntensityBucket: weather.renderedIntensityBucket,
            intensityDwellDeadline:
                state.intensity.changedAt === null
                    ? null
                    : Math.max(state.changedAt, state.intensity.changedAt) +
                      settings.intensityDwellMs,
            intensityRetentionDeadline: state.intensity.supporting
                ? state.intensity.supporting.observedAt +
                  settings.intensityRetentionMs
                : null,
            renderers: weather.renderers,
            override: weather.mode,
            reason: state.reason,
            observationAgeMinutes: Number.isFinite(observedAt)
                ? (now - observedAt) / 60_000
                : null,
            supportingObservation: state.supporting,
            pending: state.pending,
            dwellDeadline,
            retentionDeadline: Number.isFinite(observedAt)
                ? observedAt + settings.retentionMs
                : null,
            nextRefreshAt: weather.nextRefreshAt,
            refreshing: weather.refreshing,
            lastRefreshStartedAt: weather.lastRefreshStartedAt,
            lastRefreshCompletedAt: weather.lastRefreshCompletedAt,
            failures: weather.failures,
            rolloutEnabled: weather.rolloutEnabled,
            enabled: weather.preferences.enabled,
            location: weather.location,
            active: weather.active,
            foreground: weather.foreground,
            hydrated: weather.hydrated,
            activeSurfaces: weather.activeSurfaces,
        },
    };
}
