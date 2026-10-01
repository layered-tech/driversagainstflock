import assert from 'node:assert/strict';
import test from 'node:test';
import { createNwsWeatherClient } from '../weather-nws-client.js';
import { WEATHER_DEFAULTS } from '../weather-policy.js';

const initialTime = Date.parse('2026-10-01T12:00:00Z');
const location = { latitude: 40, longitude: -100 };
const origin = 'https://api.weather.gov';
const station = (name, latitude = 40, longitude = -100) => ({
    id: `${origin}/stations/${name}`,
    geometry: { coordinates: [longitude, latitude] },
});
const report = (weather = 'rain', observedAt = initialTime) => ({
    properties: {
        timestamp: new Date(observedAt).toISOString(),
        presentWeather: [{ weather }],
        textDescription: 'Fair',
    },
});
const response = (data, status = 200, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    json: async () => data,
});

function harness({
    stations = [
        station('NEAR'),
        station('SECOND', 40.1),
        station('THIRD', 40.2),
        station('FOURTH', 40.3),
    ],
    reports = {},
    intercept = null,
    settings = WEATHER_DEFAULTS,
} = {}) {
    let time = initialTime;
    const calls = [];
    const fetchFn = async (url, options) => {
        calls.push({ url, options });
        const intercepted = await intercept?.(url, options);
        if (intercepted) {
            return intercepted;
        }
        if (url.includes('/points/')) {
            return response({
                properties: {
                    observationStations: `${origin}/gridpoints/TEST/stations`,
                },
            });
        }
        if (url.endsWith('/TEST/stations')) {
            return response({ features: stations });
        }
        const name = url.split('/').at(-3);
        const value = reports[name];
        return value instanceof Error
            ? Promise.reject(value)
            : (value ?? response(report('rain', time)));
    };
    const client = createNwsWeatherClient({
        fetchFn,
        now: () => time,
        settings,
    });
    return {
        client,
        calls,
        reports,
        advance: (ms) => {
            time += ms;
        },
    };
}

test('discovers points/stations, sorts nearest, and identifies the application', async () => {
    const { client, calls } = harness({
        stations: [
            station('FAR', 41),
            station('SECOND', 40.1),
            station('NEAR'),
        ],
    });
    const result = await client.getObservation(location);
    assert.equal(result.station, `${origin}/stations/NEAR`);
    assert.equal(result.condition, 'Rain');
    assert.equal(result.distanceKm, 0);
    assert.equal(result.fresh, true);
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/points\/40\.0000,-100\.0000$/);
    for (const call of calls) {
        assert.match(call.options.headers['User-Agent'], /DriversAgainstFlock/);
        assert.ok(call.options.signal instanceof AbortSignal);
    }
});

test('nearby concurrent lookups deduplicate discovery and observations', async () => {
    const { client, calls } = harness();
    const results = await Promise.all([
        client.getObservation(location),
        client.getObservation(location),
        client.getObservation({ ...location, latitude: 40.001 }),
    ]);
    assert.equal(calls.length, 3);
    assert.equal(results[0].station, results[2].station);
    assert.ok(results[2].distanceKm > 0);
});

test('cached observation keeps its original fetch/observation time and becomes stale', async () => {
    const { client, calls, advance, reports } = harness();
    reports.NEAR = response(report('rain', initialTime));
    const first = await client.getObservation(location);
    advance(5 * 60_000);
    const cached = await client.getObservation(location);
    assert.equal(calls.length, 3);
    assert.equal(cached.fetchedAt, first.fetchedAt);
    assert.equal(cached.observedAt, first.observedAt);
    advance(41 * 60_000);
    reports.SECOND = response(report('snow', initialTime));
    reports.THIRD = response(report('snow', initialTime));
    const stale = await client.getObservation(location);
    assert.equal(stale.condition, 'Unknown');
    assert.equal(stale.reason, 'stale-observation');
    assert.equal(
        calls.filter((call) => call.url.includes('/points/')).length,
        1,
    );
});

test('sticky station is retained even when closer stations disagree', async () => {
    const { client, calls, advance, reports } = harness({
        stations: [station('NEAR'), station('SECOND', 40.1)],
    });
    reports.NEAR = response(report('rain'));
    reports.SECOND = response(report('snow'));
    await client.getObservation(location);
    advance(11 * 60_000);
    const result = await client.getObservation({
        latitude: 40.09,
        longitude: -100,
    });
    assert.equal(result.station, `${origin}/stations/NEAR`);
    assert.equal(result.condition, 'Rain');
    assert.equal(
        calls.filter((call) => call.url.includes('/SECOND/')).length,
        0,
    );
});

test('unavailable/stale station fails over, with at most three candidate checks', async () => {
    const { client, calls, reports } = harness();
    reports.NEAR = response(report('rain', initialTime - 46 * 60_000));
    reports.SECOND = response({}, 503);
    reports.THIRD = response(report('snow'));
    const result = await client.getObservation(location);
    assert.equal(result.station, `${origin}/stations/THIRD`);
    assert.equal(result.condition, 'Snow');
    assert.equal(
        calls.filter((call) => call.url.includes('/observations/')).length,
        3,
    );
    assert.equal(calls.filter((call) => call.url.includes('FOURTH')).length, 0);
});

test('fresh unclassifiable station stays selected and never borrows conflicting weather', async () => {
    const { client, calls, reports } = harness();
    reports.NEAR = response({
        properties: {
            timestamp: new Date(initialTime).toISOString(),
            presentWeather: [],
        },
    });
    const result = await client.getObservation(location);
    assert.equal(result.condition, 'Unknown');
    assert.equal(result.reason, 'unclassifiable');
    assert.equal(
        calls.filter((call) => call.url.includes('/observations/')).length,
        1,
    );
});

test('missing location, unsupported coverage, and distant stations stay Unknown', async () => {
    const missing = harness();
    assert.equal(
        (await missing.client.getObservation(null)).reason,
        'missing-location',
    );
    assert.equal(missing.calls.length, 0);
    const unsupported = harness({
        intercept: (url) =>
            url.includes('/points/') ? response({}, 404) : null,
    });
    assert.equal(
        (await unsupported.client.getObservation(location)).reason,
        'unsupported-coverage',
    );
    const distant = harness({ stations: [station('DISTANT', 41)] });
    assert.equal(
        (await distant.client.getObservation(location)).reason,
        'no-nearby-usable-station',
    );
    assert.equal(distant.calls.length, 2);
});

test('rate limiting honors Retry-After and prevents additional upstream requests', async () => {
    const { client, calls, advance } = harness({
        intercept: () => response({}, 429, { 'retry-after': '1200' }),
    });
    const first = await client.getObservation(location);
    assert.equal(first.reason, 'rate-limited');
    assert.equal(first.retryAt, initialTime + 1_200_000);
    advance(600_000);
    assert.equal(
        (await client.getObservation(location)).reason,
        'rate-limited',
    );
    assert.equal(calls.length, 1);
    advance(600_001);
    await client.getObservation(location);
    assert.equal(calls.length, 2);
});

test('upstream cache-control and Age shorten cache lifetime', async () => {
    let count = 0;
    const { client, advance } = harness({
        intercept: (url) => {
            if (url.includes('/observations/')) {
                count++;
                return response(report(), 200, {
                    'cache-control': 'max-age=60',
                    age: '50',
                });
            }
        },
    });
    await client.getObservation(location);
    advance(9000);
    await client.getObservation(location);
    assert.equal(count, 1);
    advance(2000);
    await client.getObservation(location);
    assert.equal(count, 2);
});

test('overall timeout bounds a stalled fetch and aborts it', async () => {
    let abortSignal;
    let timerCallback;
    const client = createNwsWeatherClient({
        fetchFn: (_, { signal }) => {
            abortSignal = signal;
            return new Promise(() => {});
        },
        now: () => initialTime,
        setTimeoutFn: (callback, duration) => {
            assert.equal(duration, 10_000);
            timerCallback = callback;
            return 1;
        },
        clearTimeoutFn: () => {},
    });
    const pending = client.getObservation(location);
    timerCallback();
    assert.equal((await pending).reason, 'timeout');
    assert.equal(abortSignal.aborted, true);
});

test('untrusted discovery URLs cannot fetch another provider', async () => {
    const { client, calls } = harness({
        intercept: (url) =>
            url.includes('/points/')
                ? response({
                      properties: {
                          observationStations: 'https://example.com/forecast',
                      },
                  })
                : null,
    });
    assert.equal(
        (await client.getObservation(location)).reason,
        'invalid-endpoint',
    );
    assert.equal(calls.length, 1);
});

test('a previously selected station fails over only after it becomes unusable', async () => {
    const { client, calls, advance, reports } = harness();
    assert.equal(
        (await client.getObservation(location)).station,
        `${origin}/stations/NEAR`,
    );
    reports.NEAR = response({}, 503);
    reports.SECOND = response(report('snow', initialTime + 11 * 60_000));
    advance(11 * 60_000);
    const changed = await client.getObservation(location);
    assert.equal(changed.station, `${origin}/stations/SECOND`);
    assert.equal(changed.condition, 'Snow');
    assert.equal(
        calls.filter((call) => call.url.includes('/points/')).length,
        1,
    );
});

test('upstream Expires and no-store instructions prevent overlong observation caching', async () => {
    let count = 0;
    const { client, advance } = harness({
        intercept: (url) => {
            if (url.includes('/observations/')) {
                count++;
                return response(
                    report(),
                    200,
                    count < 2
                        ? {
                              expires: new Date(
                                  initialTime + 5000,
                              ).toUTCString(),
                          }
                        : { 'cache-control': 'no-store' },
                );
            }
        },
    });
    await client.getObservation(location);
    advance(5001);
    await client.getObservation(location);
    await client.getObservation(location);
    assert.equal(count, 3);
});

test('shared nearby discovery still enforces the station distance at the actual location', async () => {
    const { client, calls } = harness({ stations: [station('NEAR', 40.45)] });
    const validLocation = { latitude: 40.004, longitude: -100 };
    const outsideLocation = { latitude: 39.996, longitude: -100 };
    const [inside, outside] = await Promise.all([
        client.getObservation(validLocation),
        client.getObservation(outsideLocation),
    ]);
    assert.equal(inside.condition, 'Rain');
    assert.equal(outside.condition, 'Unknown');
    assert.equal(outside.fresh, false);
    assert.equal(
        calls.filter((call) => call.url.includes('/points/')).length,
        1,
    );
});

test('concurrent locations across discovery-cell boundaries share station requests', async () => {
    const { client, calls } = harness();
    await Promise.all([
        client.getObservation({ latitude: 40.004, longitude: -100 }),
        client.getObservation({ latitude: 40.006, longitude: -100 }),
    ]);
    assert.equal(
        calls.filter((call) => call.url.endsWith('/TEST/stations')).length,
        1,
    );
    assert.equal(
        calls.filter((call) => call.url.includes('/observations/')).length,
        1,
    );
});

test('station observations carry structured intensity through to the shared weather policy', async () => {
    const { client, reports } = harness();
    reports.NEAR = response({
        properties: {
            timestamp: new Date(initialTime).toISOString(),
            presentWeather: [{ weather: 'snow', intensity: 'heavy' }],
            textDescription: 'Light Snow',
        },
    });
    const observation = await client.getObservation(location);
    assert.equal(observation.condition, 'Snow');
    assert.equal(observation.intensityBucket, 'Heavy');
});
