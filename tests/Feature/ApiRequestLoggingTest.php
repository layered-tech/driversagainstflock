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
        'X-Request-Id' => 'request-123',
    ])->assertCreated();

    $apiLog = ApiLog::query()->sole();

    $this->assertModelExists($apiLog);

    expect($apiLog->method)->toBe('POST')
        ->and($apiLog->request_path)->toBe('api/test-api-request-log')
        ->and($apiLog->status)->toBe(201)
        ->and($apiLog->elapsed_ms)->toBeGreaterThanOrEqual(0)
        ->and($apiLog->request_headers['authorization'])->toBe(['[REDACTED]'])
        ->and($apiLog->request_headers['x-request-id'])->toBe(['request-123'])
        ->and($apiLog->request_payload['filter'])->toBe('recent')
        ->and($apiLog->request_payload['name'])->toBe('API logging test')
        ->and($apiLog->request_payload['credentials']['accessToken'])->toBe('[REDACTED]')
        ->and($apiLog->response_headers['x-response-id'])->toBe(['response-123'])
        ->and($apiLog->response_headers['set-cookie'])->toBe(['[REDACTED]'])
        ->and($apiLog->response_payload['result'])->toBe('created')
        ->and($apiLog->response_payload['token'])->toBe('[REDACTED]');
});

it('seeds API log records', function () {
    $this->seed(ApiLogSeeder::class);

    expect(ApiLog::query()->get())->toHaveCount(10);
});
