import assert from 'node:assert/strict';
import test from 'node:test';
import {
    acceptWeatherObservation,
    classifyNwsWeather,
    createWeatherState,
    reconcileWeatherState,
    WEATHER_DEFAULTS,
} from '../weather-policy.js';
import {
    getIntensityWeatherProfile,
    getWeatherEffectStyle,
    WEATHER_PROFILE_DEFAULTS,
} from '../weather-profiles.js';

const minute = 60_000;
const start = Date.parse('2026-10-01T12:00:00Z');
const location = { latitude: 40, longitude: -100 };
const report = (condition, intensityBucket, time) => ({
    condition,
    intensityBucket,
    observedAt: time,
    stationLocation: location,
    station: 'TEST',
    fresh: true,
});
const accept = (state, bucket, offset, condition = 'Rain') =>
    acceptWeatherObservation(
        state,
        report(condition, bucket, start + offset * minute),
        location,
        start + offset * minute,
    );

test('NWS light/heavy/null intensity maps to buckets without changing precipitation type', () => {
    for (const weather of ['rain', 'drizzle', 'snow']) {
        for (const [intensity, bucket] of [
            ['light', 'Light'],
            ['heavy', 'Heavy'],
            [null, 'Baseline'],
            [undefined, 'Baseline'],
        ]) {
            const result = classifyNwsWeather({
                presentWeather: [{ weather, intensity }],
            });
            assert.equal(result.intensityBucket, bucket);
            assert.equal(
                result.condition,
                weather === 'snow' ? 'Snow' : 'Rain',
            );
        }
    }
    assert.equal(
        classifyNwsWeather({
            presentWeather: [{ weather: 'rain', intensity: 'invalid' }],
        }).intensityBucket,
        'Baseline',
    );
    assert.equal(classifyNwsWeather({}).intensityBucket, null);
    assert.equal(
        classifyNwsWeather({ textDescription: 'Fair' }).intensityBucket,
        null,
    );
});

test('mixed precipitation uses snow intensity and excludes vicinity reports', () => {
    const mixed = classifyNwsWeather({
        presentWeather: [
            { weather: 'rain', intensity: 'heavy' },
            { weather: 'snow', intensity: 'light' },
            { weather: 'snow', intensity: 'heavy', inVicinity: true },
        ],
    });
    assert.deepEqual(mixed, {
        condition: 'Snow',
        mixed: true,
        intensityBucket: 'Light',
    });
    assert.equal(
        classifyNwsWeather({
            presentWeather: [
                { weather: 'rain', intensity: 'light' },
                { weather: 'drizzle', intensity: 'heavy' },
            ],
        }).intensityBucket,
        'Heavy',
    );
    assert.equal(
        classifyNwsWeather({
            presentWeather: [
                { weather: 'snow', intensity: 'light' },
                { weather: 'snow', intensity: null },
            ],
        }).intensityBucket,
        'Baseline',
    );
});

test('only allowlisted current descriptions can establish an intensity bucket', () => {
    for (const [textDescription, bucket] of [
        ['Light Rain', 'Light'],
        ['Heavy Snow', 'Heavy'],
        ['Rain', 'Baseline'],
        ['Light Rain Snow', 'Light'],
        ['Chance Heavy Rain', null],
        ['Heavy Rain Nearby', null],
    ]) {
        assert.equal(
            classifyNwsWeather({ textDescription }).intensityBucket,
            bucket,
        );
    }
    assert.equal(
        classifyNwsWeather({
            textDescription: 'Heavy Rain',
            presentWeather: [{ weather: 'rain', intensity: 'light' }],
        }).intensityBucket,
        'Light',
    );
});

test('first precipitation observation initializes its intensity immediately', () => {
    for (const bucket of ['Light', 'Baseline', 'Heavy']) {
        const state = accept(createWeatherState(), bucket, 0);
        assert.equal(state.intensity.bucket, bucket);
        assert.equal(state.intensity.changedAt, start);
    }
    assert.equal(
        accept(createWeatherState(), null, 0, 'Unknown').intensity.supporting,
        null,
    );
});

test('density changes need distinct observations, 10-minute spacing, and 20-minute dwell', () => {
    let state = accept(createWeatherState(), 'Light', 0);
    state = accept(state, 'Heavy', 1);
    state = acceptWeatherObservation(
        state,
        report('Rain', 'Heavy', start + minute),
        location,
        start + 11 * minute,
    );
    assert.equal(state.intensity.pending.confirmed, false);
    state = accept(state, 'Heavy', 11);
    assert.equal(state.intensity.pending.confirmed, true);
    assert.equal(state.intensity.bucket, 'Light');
    state = reconcileWeatherState(state, location, start + 20 * minute);
    assert.equal(state.intensity.bucket, 'Heavy');
    assert.equal(state.accepted, 'Rain');
    assert.equal(
        state.changedAt,
        start,
        'intensity does not reset the weather condition dwell',
    );
    state = accept(state, 'Baseline', 21);
    state = accept(state, 'Baseline', 31);
    assert.equal(state.intensity.bucket, 'Heavy');
    assert.equal(
        reconcileWeatherState(state, location, start + 40 * minute).intensity
            .bucket,
        'Baseline',
    );
});

test('Unknown does not confirm/clear intensity candidates; fresh contradictions replace them', () => {
    let state = accept(createWeatherState(), 'Baseline', 0);
    state = accept(state, 'Heavy', 1);
    state = accept(state, null, 5, 'Unknown');
    assert.equal(state.intensity.pending.first.observedAt, start + minute);
    state = accept(state, 'Light', 11);
    assert.equal(state.intensity.pending.last.intensityBucket, 'Light');
    assert.equal(state.intensity.pending.confirmed, false);
    state = accept(state, 'Baseline', 12);
    assert.equal(state.intensity.pending, null);
    assert.equal(state.intensity.supporting.observedAt, start + 12 * minute);
});

test('older observations cannot replace newer intensity evidence', () => {
    let state = accept(createWeatherState(), 'Light', 0);
    state = accept(state, 'Heavy', 11);
    state = acceptWeatherObservation(
        state,
        report('Rain', 'Baseline', start + minute),
        location,
        start + 12 * minute,
    );
    assert.equal(state.intensity.pending.last.intensityBucket, 'Heavy');
    assert.equal(state.intensity.supporting.observedAt, start);
});

test('intensity candidates expire and stale confirmation cannot commit', () => {
    let state = accept(createWeatherState(), 'Light', 0);
    state = accept(state, 'Heavy', 1);
    assert.equal(
        reconcileWeatherState(state, location, start + 46 * minute).intensity
            .pending,
        null,
    );
    const settings = { ...WEATHER_DEFAULTS, intensityDwellMs: 60 * minute };
    state = acceptWeatherObservation(
        state,
        report('Rain', 'Heavy', start + 11 * minute),
        location,
        start + 11 * minute,
        settings,
    );
    state = reconcileWeatherState(
        state,
        location,
        start + 60 * minute,
        settings,
    );
    assert.equal(state.intensity.bucket, 'Light');
    assert.equal(state.intensity.pending, null);
});

test('varying intensity cannot prevent a confirmed rain-to-snow transition', () => {
    let state = accept(createWeatherState(), 'Heavy', 0);
    state = accept(state, 'Light', 1, 'Snow');
    state = accept(state, 'Heavy', 11, 'Snow');
    state = reconcileWeatherState(state, location, start + 20 * minute);
    assert.equal(state.accepted, 'Snow');
    assert.equal(state.intensity.bucket, 'Light');
    assert.equal(state.intensity.pending.last.intensityBucket, 'Heavy');
    state = accept(state, 'Heavy', 22, 'Snow');
    assert.equal(state.intensity.bucket, 'Light');
    state = reconcileWeatherState(state, location, start + 40 * minute);
    assert.equal(state.intensity.bucket, 'Heavy');
});

test('duplicates never extend intensity retention and dry/movement clear intensity', () => {
    let state = accept(createWeatherState(), 'Heavy', 0);
    state = acceptWeatherObservation(
        state,
        report('Rain', 'Heavy', start),
        location,
        start + 30 * minute,
    );
    assert.equal(state.intensity.supporting.observedAt, start);
    const moved = { latitude: 40.3, longitude: -100 };
    assert.equal(
        reconcileWeatherState(state, moved, start + 31 * minute).intensity
            .bucket,
        'Baseline',
    );
    state = accept(state, null, 31, 'Dry');
    state = accept(state, null, 41, 'Dry');
    assert.equal(state.accepted, 'Dry');
    assert.equal(state.intensity.supporting, null);
});

test('expired intensity returns to baseline while newer evidence can retain the precipitation type', () => {
    let state = accept(createWeatherState(), 'Heavy', 0);
    state = accept(state, 'Light', 30);
    state = accept(state, null, 80);
    assert.equal(state.supporting.observedAt, start + 80 * minute);
    assert.equal(state.intensity.supporting.observedAt, start);
    state = reconcileWeatherState(state, location, start + 90 * minute);
    assert.equal(state.accepted, 'Rain');
    assert.equal(state.intensity.bucket, 'Baseline');
    assert.equal(state.intensity.supporting, null);
});

test('buckets scale density smoothly while keeping speed, opacity, and manual profiles intact', () => {
    for (const condition of ['Rain', 'Snow']) {
        const base = WEATHER_PROFILE_DEFAULTS[condition];
        const light = getIntensityWeatherProfile(base, 'Light');
        const heavy = getIntensityWeatherProfile(base, 'Heavy');
        assert.equal(light.density, base.density * 0.5);
        assert.equal(heavy.density, base.density * 1.75);
        assert.equal(heavy.intensity, base.intensity);
        assert.equal(heavy.opacity, base.opacity);
        assert.equal(base.density, WEATHER_PROFILE_DEFAULTS[condition].density);
        assert.deepEqual(getWeatherEffectStyle(heavy).densityTransition, {
            duration: 2000,
            delay: 0,
        });
    }
    assert.equal(
        getIntensityWeatherProfile(
            { ...WEATHER_PROFILE_DEFAULTS.Snow, density: 0.3 },
            'Heavy',
        ).density,
        0.4,
    );
    assert.equal(
        getIntensityWeatherProfile(
            { ...WEATHER_PROFILE_DEFAULTS.Snow, density: 0.8 },
            'Heavy',
        ).density,
        0.8,
    );
    assert.deepEqual(
        getIntensityWeatherProfile(WEATHER_PROFILE_DEFAULTS.Rain, 'Baseline'),
        WEATHER_PROFILE_DEFAULTS.Rain,
    );
});
