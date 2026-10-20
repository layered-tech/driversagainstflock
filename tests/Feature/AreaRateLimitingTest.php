<?php

use App\Models\AreaDevice;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;

beforeEach(function (): void {
    $this->app->bind(ThrottleRequestsWithRedis::class, ThrottleRequests::class);
    $this->deviceToken = str_repeat('a', 64);
    AreaDevice::factory()->create(['token_hash' => hash('sha256', $this->deviceToken)]);
});

test('area traffic does not consume the device registration allowance', function (): void {
    for ($request = 0; $request < 10; $request++) {
        $this->withToken($this->deviceToken)->patchJson('/api/v1/areas/device', ['timezone' => 'UTC'])->assertOk();
    }

    $this->postJson('/api/v1/area-devices')->assertCreated();
});

test('area limits apply separately to authenticated phones sharing an IP', function (): void {
    $otherToken = str_repeat('b', 64);
    AreaDevice::factory()->create(['token_hash' => hash('sha256', $otherToken)]);

    for ($request = 0; $request < 60; $request++) {
        $this->withToken($this->deviceToken)->patchJson('/api/v1/areas/device', ['timezone' => 'UTC'])->assertOk();
    }

    $this->patchJson('/api/v1/areas/device', ['timezone' => 'UTC'])->assertTooManyRequests();
    $this->withToken($otherToken)->patchJson('/api/v1/areas/device', ['timezone' => 'UTC'])->assertOk();
});

test('registration remains limited by IP without throttling existing phones', function (): void {
    for ($request = 0; $request < 10; $request++) {
        $this->postJson('/api/v1/area-devices')->assertCreated();
    }

    $this->postJson('/api/v1/area-devices')->assertTooManyRequests();
    $this->withToken($this->deviceToken)->patchJson('/api/v1/areas/device', ['timezone' => 'UTC'])->assertOk();
});

test('area authentication runs before its device-scoped limiter', function (): void {
    $this->withToken('invalid')->patchJson('/api/v1/areas/device', ['timezone' => 'UTC'])->assertUnauthorized();
});
