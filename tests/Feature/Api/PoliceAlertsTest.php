<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->withoutMiddleware();

    Cache::flush();

    config([
        'police-alerts.url' => 'https://waze.test/alerts-and-jams',
        'police-alerts.radius_miles' => 10,
        'police-alerts.max_alerts' => 50,
        'police-alerts.cache_seconds' => 150,
        'police-alerts.monthly_request_limit' => 9500,
        'services.openwebninja.api_key' => 'test-waze-key',
    ]);
});

it('returns normalized police alerts around the given location', function () {
    Http::fake([
        'https://waze.test/alerts-and-jams*' => Http::response([
            'status' => 'OK',
            'data' => [
                'alerts' => [
                    [
                        'alert_id' => '160673696',
                        'type' => 'POLICE',
                        'subtype' => 'POLICE_HIDING',
                        'publish_datetime_utc' => '2026-07-03T16:20:00.000Z',
                        'city' => 'Austin',
                        'street' => 'N Lamar Blvd',
                        'latitude' => 30.2782,
                        'longitude' => -97.7523,
                        'num_thumbs_up' => 3,
                        'alert_reliability' => 9,
                        'alert_confidence' => 2,
                    ],
                    [
                        'alert_id' => '160673697',
                        'type' => 'HAZARD',
                        'subtype' => 'HAZARD_ON_ROAD_POT_HOLE',
                        'latitude' => 30.28,
                        'longitude' => -97.75,
                    ],
                    [
                        'alert_id' => '160673698',
                        'type' => 'POLICE',
                        'latitude' => 'not-a-number',
                        'longitude' => -97.75,
                    ],
                ],
                'jams' => [],
            ],
        ]),
    ]);

    $this->getJson('/api/v1/police-alerts?latitude=30.2672&longitude=-97.7431')
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonCount(1, 'result.alerts')
        ->assertJsonPath('result.alerts.0.id', '160673696')
        ->assertJsonPath('result.alerts.0.subtype', 'POLICE_HIDING')
        ->assertJsonPath('result.alerts.0.street', 'N Lamar Blvd')
        ->assertJsonPath('result.alerts.0.city', 'Austin')
        ->assertJsonPath('result.alerts.0.latitude', 30.2782)
        ->assertJsonPath('result.alerts.0.longitude', -97.7523)
        ->assertJsonPath('result.alerts.0.num_thumbs_up', 3)
        ->assertJsonPath('result.alerts.0.reliability', 9)
        ->assertJsonPath('result.alerts.0.confidence', 2)
        ->assertJsonPath('result.alerts.0.published_at', '2026-07-03T16:20:00.000Z');

    Http::assertSent(function ($request) {
        return str_contains($request->url(), 'waze.test/alerts-and-jams')
            && $request->hasHeader('x-api-key', 'test-waze-key')
            && $request['alert_types'] === 'POLICE'
            && $request['center'] === '30.267200,-97.743100'
            && $request['radius'] === 10
            && $request['radius_units'] === 'MI'
            && $request['max_jams'] === 0;
    });
});

it('caches upstream responses for nearby coordinates', function () {
    Http::fake([
        'https://waze.test/alerts-and-jams*' => Http::response([
            'data' => ['alerts' => [], 'jams' => []],
        ]),
    ]);

    $this->getJson('/api/v1/police-alerts?latitude=30.2672&longitude=-97.7431')->assertOk();
    $this->getJson('/api/v1/police-alerts?latitude=30.2673&longitude=-97.7432')->assertOk();

    Http::assertSentCount(1);
});

it('validates the coordinates', function () {
    $this->getJson('/api/v1/police-alerts')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['latitude', 'longitude']);

    $this->getJson('/api/v1/police-alerts?latitude=91&longitude=-97.7431')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['latitude']);
});

it('fails when the api key is not configured', function () {
    config(['services.openwebninja.api_key' => null]);

    Http::fake();

    $this->getJson('/api/v1/police-alerts?latitude=30.2672&longitude=-97.7431')
        ->assertStatus(502)
        ->assertJsonPath('ok', false)
        ->assertJsonPath('error', 'Police alerts are not configured.');

    Http::assertNothingSent();
});

it('stops calling upstream once the monthly request budget is spent', function () {
    config(['police-alerts.monthly_request_limit' => 1]);

    Http::fake([
        'https://waze.test/alerts-and-jams*' => Http::response([
            'data' => ['alerts' => [], 'jams' => []],
        ]),
    ]);

    $this->getJson('/api/v1/police-alerts?latitude=30.2672&longitude=-97.7431')->assertOk();

    $this->getJson('/api/v1/police-alerts?latitude=41.8781&longitude=-87.6298')
        ->assertStatus(502)
        ->assertJsonPath('ok', false)
        ->assertJsonPath('error', 'Police alerts are temporarily unavailable.');

    Http::assertSentCount(1);
});

it('serves cached alerts even after the monthly request budget is spent', function () {
    config(['police-alerts.monthly_request_limit' => 1]);

    Http::fake([
        'https://waze.test/alerts-and-jams*' => Http::response([
            'data' => ['alerts' => [], 'jams' => []],
        ]),
    ]);

    $this->getJson('/api/v1/police-alerts?latitude=30.2672&longitude=-97.7431')->assertOk();
    $this->getJson('/api/v1/police-alerts?latitude=30.2672&longitude=-97.7431')->assertOk();

    Http::assertSentCount(1);
});

it('fails when the upstream request errors', function () {
    Http::fake([
        'https://waze.test/alerts-and-jams*' => Http::response(['message' => 'quota exceeded'], 429),
    ]);

    $this->getJson('/api/v1/police-alerts?latitude=30.2672&longitude=-97.7431')
        ->assertStatus(502)
        ->assertJsonPath('ok', false)
        ->assertJsonPath('error', 'Police alerts could not be loaded.');
});
