<?php

use App\Models\ApiLog;
use Database\Seeders\ApiLogSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

it('logs each API request with its request and response details', function () {
    Route::post('/api/test-api-request-log', function (Request $request) {
        return response()->json([
            'result' => 'created',
            'token' => 'response-token',
            'error' => 'Route could not be found - Unable to find a route between points 1 (-122.8416368 45.3482846) and 2 (-122.8348791 45.3742299).',
        ], 201, [
            'X-Response-Id' => 'response-123',
            'Set-Cookie' => 'session=response-session',
        ]);
    })->middleware('api');

    $this->postJson('/api/test-api-request-log?filter=recent', [
        'name' => 'API logging test',
        'credentials' => [
            'accessToken' => 'request-token',
        ],
    ], [
        'Authorization' => 'Bearer request-token',
        'CF-Connecting-IP' => '50.53.92.156',
        'X-Forwarded-For' => '50.53.92.156',
        'X-Request-Id' => 'request-123',
    ])->assertCreated();

    $apiLog = ApiLog::query()->sole();

    $this->assertModelExists($apiLog);

    expect($apiLog->method)->toBe('POST')
        ->and($apiLog->request_path)->toBe('api/test-api-request-log')
        ->and($apiLog->status)->toBe(201)
        ->and($apiLog->elapsed_ms)->toBeGreaterThanOrEqual(0)
        ->and($apiLog->request_headers['authorization'])->toBe(['[REDACTED]'])
        ->and($apiLog->request_headers['cf-connecting-ip'])->toBe(['[REDACTED]'])
        ->and($apiLog->request_headers['x-forwarded-for'])->toBe(['[REDACTED]'])
        ->and($apiLog->request_headers['x-request-id'])->toBe(['request-123'])
        ->and($apiLog->request_payload['filter'])->toBe('recent')
        ->and($apiLog->request_payload['name'])->toBe('API logging test')
        ->and($apiLog->request_payload['credentials']['accessToken'])->toBe('[REDACTED]')
        ->and($apiLog->response_headers['x-response-id'])->toBe(['response-123'])
        ->and($apiLog->response_headers['set-cookie'])->toBe(['[REDACTED]'])
        ->and($apiLog->response_payload['result'])->toBe('created')
        ->and($apiLog->response_payload['error'])->toBe('Route could not be found - Unable to find a route between points 1 ([REDACTED]) and 2 ([REDACTED]).')
        ->and($apiLog->response_payload['token'])->toBe('[REDACTED]');
});

it('redacts location, search, and routing data from API logs', function () {
    Route::post('/api/test-api-request-log-privacy', function () {
        return response()->json([
            'formattedAddress' => '100 Congress Ave, Austin, TX',
            'route' => [
                'coordinates' => [[-97.7431, 30.2672], [-97.7523, 30.2782]],
            ],
            'result' => 'created',
        ]);
    })->middleware('api');

    $this->postJson('/api/test-api-request-log-privacy?query=Flock%20cameras&ne_lat=36.13723&ne_lng=-83.865941&sw_lat=36.135749&sw_lng=-83.867642', [
        'input' => '100 Congress Ave',
        'locationBias' => [
            'latitude' => 30.2672,
            'longitude' => -97.7431,
        ],
        'currentPosition' => [-97.7431, 30.2672],
        'coordinates' => [[-97.7431, 30.2672]],
        'latitude' => 30.2672,
        'longitude' => -97.7431,
        'resultPosition' => [-97.7523, 30.2782],
        'start' => ['latitude' => 30.2672, 'longitude' => -97.7431],
        'end' => ['latitude' => 30.2782, 'longitude' => -97.7523],
        'waypoints' => [
            ['latitude' => 30.27, 'longitude' => -97.75],
        ],
        'filter' => 'recent',
    ])->assertOk();

    $apiLog = ApiLog::query()->sole();

    expect($apiLog->request_payload)
        ->toMatchArray([
            'query' => '[REDACTED]',
            'ne_lat' => '[REDACTED]',
            'ne_lng' => '[REDACTED]',
            'sw_lat' => '[REDACTED]',
            'sw_lng' => '[REDACTED]',
            'input' => '[REDACTED]',
            'locationBias' => '[REDACTED]',
            'currentPosition' => '[REDACTED]',
            'coordinates' => '[REDACTED]',
            'latitude' => '[REDACTED]',
            'longitude' => '[REDACTED]',
            'resultPosition' => '[REDACTED]',
            'start' => '[REDACTED]',
            'end' => '[REDACTED]',
            'waypoints' => '[REDACTED]',
            'filter' => 'recent',
        ])
        ->and($apiLog->response_payload)
        ->toMatchArray([
            'formattedAddress' => '[REDACTED]',
            'route' => '[REDACTED]',
            'result' => 'created',
        ]);
});

it('seeds API log records', function () {
    $this->seed(ApiLogSeeder::class);

    expect(ApiLog::query()->get())->toHaveCount(10);
});
