import assert from 'node:assert/strict';
import test from 'node:test';
import { getWeatherDiagnostics } from '../weather-diagnostics.js';
import {
    acceptWeatherObservation,
    createWeatherState,
} from '../weather-policy.js';

const now = Date.parse('2026-10-01T12:00:00Z');
const minute = 60_000;
const location = { latitude: 40, longitude: -100 };
const observation = (condition, observedAt = now) => ({
    condition,
    observedAt,
    fetchedAt: now,
    station: 'https://api.weather.gov/stations/TEST',
    stationLocation: location,
    description: condition === 'Rain' ? 'Light Rain' : 'Fair',
    intensityBucket: condition === 'Rain' ? 'Light' : null,
    fresh: true,
    reason: 'available',
});
function weather(overrides = {}) {
    const raw = observation('Rain');
    return {
        raw,
        state: acceptWeatherObservation(
            createWeatherState(),
            raw,
            location,
            now,
        ),
        location,
        mode: 'Automatic',
        automatic: 'Rain',
        rendered: 'Rain',
        renderedIntensityBucket: 'Light',
        preferences: { enabled: true },
        rolloutEnabled: true,
        hydrated: true,
        active: true,
        activeSurfaces: 1,
        refreshing: false,
        nextRefreshAt: now + 10 * minute,
        failures: 0,
        renderers: [],
        ...overrides,
    };
}
const rows = (snapshot, at = now) =>
    Object.fromEntries(
        getWeatherDiagnostics(snapshot, at).rows.map(({ label, value }) => [
            label,
            value,
        ]),
    );

test('shows the current NWS report, validity, source, policy and actual renderer separately', () => {
    const data = rows(
        weather({
            renderers: [
                {
                    surface: 'Phone',
                    supported: true,
                    effect: 'Rain',
                    visible: true,
                    density: 0.075,
                },
                {
                    surface: 'Car',
                    supported: false,
                    effect: null,
                    visible: false,
                },
            ],
        }),
    );
    assert.match(data['NWS report'], /Rain.*Light Rain/);
    assert.match(data['NWS station'], /TEST.*0.0 km/);
    assert.match(
        data['NWS observation'],
        /2026-10-01T12:00:00.000Z.*0.0 min old/,
    );
    assert.match(data['NWS validity'], /Fresh/);
    assert.match(data['Automatic weather'], /Rain/);
    assert.match(data['Effect target'], /Rain.*Light/);
    assert.match(data['Phone renderer'], /Rain.*visible/);
    assert.match(data['Car renderer'], /unsupported/);
    assert.match(data['NWS refresh'], /2026-10-01T12:10:00.000Z/);
});

test('distinguishes unclassifiable weather, fetch failures and a retained accepted effect', () => {
    for (const reason of [
        'unclassifiable',
        'timeout',
        'unsupported-coverage',
        'rate-limited',
    ]) {
        const data = rows(
            weather({
                raw: { condition: 'Unknown', reason, fetchedAt: now },
                failures: 1,
            }),
        );
        assert.match(data['NWS report'], /Unknown/);
        assert.equal(data['NWS result'], reason);
        assert.equal(data['NWS station'], 'Unavailable');
        assert.match(data['Automatic weather'], /Rain/);
        assert.match(data['Accepted observation'], /TEST/);
        assert.match(data['NWS refresh'], /1 failure/);
    }
});

test('rechecks age and distance instead of trusting an old fresh flag', () => {
    const data = rows(weather(), now + 46 * minute);
    assert.match(data['NWS validity'], /Stale/);
    assert.match(data['NWS observation'], /46.0 min old/);
    assert.match(data['Automatic weather'], /Rain/);
    const distant = rows(
        weather({ location: { latitude: 41, longitude: -100 } }),
    );
    assert.match(distant['NWS validity'], /Too far/);
});

test('shows pending confirmation and dwell rather than presenting latest rain as accepted', () => {
    let state = acceptWeatherObservation(
        createWeatherState(),
        observation('Dry'),
        location,
        now,
    );
    state = acceptWeatherObservation(
        state,
        observation('Rain', now + minute),
        location,
        now + minute,
    );
    const first = weather({
        state,
        automatic: 'Dry',
        rendered: null,
        raw: observation('Rain', now + minute),
    });
    assert.match(
        rows(first, now + minute)['Pending change'],
        /Rain.*confirmation/,
    );
    state = acceptWeatherObservation(
        state,
        observation('Rain', now + 11 * minute),
        location,
        now + 11 * minute,
    );
    const confirmed = rows({ ...first, state }, now + 11 * minute);
    assert.match(
        confirmed['Pending change'],
        /Rain.*dwell.*2026-10-01T12:20:00.000Z/,
    );
    assert.match(confirmed['Automatic weather'], /Dry/);
    assert.equal(confirmed['Effect target'], 'None');
});

test('explains missing location, initialization, switches, overrides, inactivity and request progress', () => {
    for (const [overrides, message] of [
        [{ location: null }, /physical location/],
        [{ hydrated: false }, /Restoring/],
        [{ rolloutEnabled: false }, /rollout/],
        [{ preferences: { enabled: false } }, /disabled/],
        [{ mode: 'Off' }, /Off/],
        [{ mode: 'Snow' }, /Forced Snow/],
    ]) {
        assert.match(rows(weather(overrides))['Effect policy'], message);
    }
    assert.match(rows(weather({ active: false }))['NWS refresh'], /Paused/);
    assert.match(
        rows(weather({ refreshing: true }))['NWS refresh'],
        /Fetching/,
    );
    const empty = rows(
        weather({
            state: createWeatherState(),
            raw: null,
            location: null,
            rendered: null,
        }),
    );
    assert.equal(empty['NWS report'], 'No response this session');
    assert.equal(empty['NWS validity'], 'Unavailable');
    assert.equal(empty['Map renderers'], 'No renderer attached');
});

test('full diagnostics retain upstream evidence and request timing without changing the snapshot', () => {
    const snapshot = weather({
        lastRefreshStartedAt: now - 1000,
        lastRefreshCompletedAt: now,
    });
    const original = JSON.stringify(snapshot);
    const diagnostics = getWeatherDiagnostics(snapshot, now);
    assert.deepEqual(diagnostics.details.raw, snapshot.raw);
    assert.equal(diagnostics.details.lastRefreshStartedAt, now - 1000);
    assert.equal(diagnostics.details.lastRefreshCompletedAt, now);
    assert.equal(JSON.stringify(snapshot), original);
});
