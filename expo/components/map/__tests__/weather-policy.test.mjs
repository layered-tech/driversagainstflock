import assert from 'node:assert/strict';
import test from 'node:test';
import {
    acceptWeatherObservation,
    classifyNwsWeather,
    createWeatherState,
    getAutomaticWeatherCondition,
    reconcileWeatherState,
    WEATHER_DEFAULTS,
    weatherDistanceKm,
    weatherObservationIsFresh,
} from '../weather-policy.js';

const minute = 60_000;
const now = Date.parse('2026-10-01T12:00:00Z');
const location = { latitude: 40, longitude: -100 };
const observation = (condition, observedAt = now, changes = {}) => ({
    condition,
    observedAt,
    stationLocation: location,
    station: 'KTEST',
    fetchedAt: now,
    fresh: true,
    reason: 'available',
    ...changes,
});
const accept = (state, condition, time, changes = {}) =>
    acceptWeatherObservation(
        state,
        observation(condition, time, changes),
        location,
        time,
    );

test('NWS schema fog_mist reports establish no rain/snow effect', () => {
    assert.equal(
        classifyNwsWeather({
            presentWeather: [
                {
                    weather: 'fog_mist',
                    intensity: null,
                    modifier: null,
                    rawString: 'BR',
                    inVicinity: false,
                },
            ],
        }).condition,
        'Dry',
    );
});

for (const [description, expected] of [
    ['Light Rain', 'Rain'],
    ['Heavy Snow', 'Snow'],
    ['Rain and Snow', 'Snow'],
    ['Fair', 'Dry'],
    ['Partly Cloudy', 'Dry'],
    ['Chance Rain', 'Unknown'],
    ['Rain Nearby', 'Unknown'],
    ['', 'Unknown'],
]) {
    test(`allowlisted description: ${description || '(empty)'}`, () => {
        assert.equal(
            classifyNwsWeather({ textDescription: description }).condition,
            expected,
        );
    });
}

test('structured current reports take priority, including mixed precipitation', () => {
    const weather = (...reports) =>
        classifyNwsWeather({
            presentWeather: reports,
            textDescription: 'Fair',
        });
    assert.equal(
        weather({ weather: 'rain', modifier: 'freezing' }).condition,
        'Rain',
    );
    assert.equal(weather({ weather: 'drizzle' }).condition, 'Rain');
    assert.equal(
        weather({ weather: 'snow', modifier: 'showers' }).condition,
        'Snow',
    );
    assert.deepEqual(weather({ weather: 'rain' }, { weather: 'snow' }), {
        condition: 'Snow',
        mixed: true,
    });
    assert.equal(
        weather({ weather: 'snow', inVicinity: true }).condition,
        'Unknown',
    );
    for (const phenomenon of ['hail', 'ice_pellets', 'fog', 'thunderstorms']) {
        assert.equal(weather({ weather: phenomenon }).condition, 'Dry');
    }
    assert.equal(weather({}).condition, 'Unknown');
});

test('missing data and unrelated metrics do not prove dry or precipitation', () => {
    for (const properties of [
        {},
        { presentWeather: [] },
        { precipitationLastHour: { value: 3 } },
        { temperature: { value: -10 }, snowDepth: 5 },
        { textDescription: 'Unknown Precipitation' },
    ]) {
        assert.equal(classifyNwsWeather(properties).condition, 'Unknown');
    }
});

test('timestamp and actual station distance enforce freshness boundaries', () => {
    assert.ok(
        weatherObservationIsFresh(
            observation('Rain', now - 45 * minute),
            location,
            now,
        ),
    );
    assert.equal(
        weatherObservationIsFresh(
            observation('Rain', now - 45 * minute - 1),
            location,
            now,
        ),
        false,
    );
    assert.ok(
        weatherObservationIsFresh(
            observation('Rain', now + 5 * minute),
            location,
            now,
        ),
    );
    assert.equal(
        weatherObservationIsFresh(
            observation('Rain', now + 5 * minute + 1),
            location,
            now,
        ),
        false,
    );
    assert.equal(
        weatherObservationIsFresh(observation('Rain', NaN), location, now),
        false,
    );
    assert.equal(
        weatherObservationIsFresh(
            observation('Rain', now, { stationLocation: null }),
            location,
            now,
        ),
        false,
    );
    assert.equal(
        weatherObservationIsFresh(
            observation('Rain'),
            { latitude: 41, longitude: -100 },
            now,
        ),
        false,
    );
    assert.equal(weatherDistanceKm(null, location), Infinity);
});

test('first fresh explicit condition initializes immediately; Unknown remains off', () => {
    for (const condition of ['Rain', 'Snow', 'Dry']) {
        assert.equal(
            accept(createWeatherState(), condition, now).accepted,
            condition,
        );
    }
    assert.equal(
        accept(createWeatherState(), 'Unknown', now).accepted,
        'Unknown',
    );
});

for (const [first, next] of [
    ['Rain', 'Snow'],
    ['Snow', 'Rain'],
    ['Rain', 'Dry'],
    ['Dry', 'Rain'],
]) {
    test(`${first} to ${next} needs distinct observations, spacing, and dwell`, () => {
        let state = accept(createWeatherState(), first, now);
        state = accept(state, next, now + minute);
        state = acceptWeatherObservation(
            state,
            observation(next, now + minute),
            location,
            now + 11 * minute,
        );
        assert.equal(state.pending.confirmed, false);
        state = accept(state, next, now + 11 * minute);
        assert.equal(state.pending.confirmed, true);
        assert.equal(state.accepted, first);
        state = reconcileWeatherState(state, location, now + 20 * minute);
        assert.equal(state.accepted, next);
        assert.equal(state.changedAt, now + 20 * minute);
    });
}

test('Unknown preserves pending evidence; contradictory fresh evidence replaces it', () => {
    let state = accept(createWeatherState(), 'Rain', now);
    state = accept(state, 'Snow', now + minute);
    state = accept(state, 'Unknown', now + 5 * minute);
    assert.equal(state.pending.first.observedAt, now + minute);
    state = accept(state, 'Dry', now + 11 * minute);
    assert.equal(state.pending.last.condition, 'Dry');
    assert.equal(state.pending.confirmed, false);
    state = accept(state, 'Rain', now + 12 * minute);
    assert.equal(state.pending, null);
    assert.equal(state.supporting.observedAt, now + 12 * minute);
});

test('older observations cannot replace newer pending evidence', () => {
    let state = accept(createWeatherState(), 'Rain', now);
    state = accept(state, 'Snow', now + 11 * minute);
    const older = acceptWeatherObservation(
        state,
        observation('Rain', now + minute),
        location,
        now + 12 * minute,
    );
    assert.equal(older.pending.last.condition, 'Snow');
    assert.equal(older.supporting.observedAt, now);
});

test('cached observations and errors never renew retention', () => {
    let state = accept(createWeatherState(), 'Snow', now);
    state = acceptWeatherObservation(
        state,
        observation('Snow', now),
        location,
        now + 30 * minute,
    );
    state = accept(state, 'Unknown', now + 80 * minute);
    assert.equal(state.accepted, 'Snow');
    assert.equal(state.supporting.observedAt, now);
    state = reconcileWeatherState(state, location, now + 90 * minute);
    assert.equal(state.accepted, 'Unknown');
});

test('expired candidates and stale confirming evidence cannot commit', () => {
    let state = accept(createWeatherState(), 'Rain', now);
    state = accept(state, 'Snow', now + minute);
    assert.equal(
        reconcileWeatherState(state, location, now + 46 * minute).pending,
        null,
    );
    const settings = { ...WEATHER_DEFAULTS, dwellMs: 60 * minute };
    state = acceptWeatherObservation(
        state,
        observation('Snow', now + 11 * minute),
        location,
        now + 11 * minute,
        settings,
    );
    assert.equal(
        reconcileWeatherState(state, location, now + 60 * minute, settings)
            .accepted,
        'Rain',
    );
});

test('movement, unsupported coverage, and missing location suppress effects', () => {
    const state = accept(createWeatherState(), 'Rain', now);
    const moved = { latitude: 40.3, longitude: -100 };
    assert.equal(
        getAutomaticWeatherCondition(state, moved, now + minute),
        'Unknown',
    );
    assert.equal(
        getAutomaticWeatherCondition(state, null, now + minute),
        'Unknown',
    );
    assert.equal(
        acceptWeatherObservation(
            state,
            { reason: 'unsupported-coverage' },
            location,
            now + minute,
        ).accepted,
        'Unknown',
    );
    const freshLocal = acceptWeatherObservation(
        state,
        observation('Snow', now + minute, { stationLocation: moved }),
        moved,
        now + minute,
    );
    assert.equal(freshLocal.accepted, 'Snow');
    assert.equal(
        reconcileWeatherState(state, null, now + 91 * minute).supporting,
        null,
    );
});
