<?php

use Laravel\Pulse\Pulse;
use Laravel\Pulse\Recorders\CacheInteractions;
use Laravel\Pulse\Recorders\SlowOutgoingRequests;
use Tests\TestCase;

uses(TestCase::class);

it('groups cache entries by family while keeping versions and unrelated keys distinct', function (string $key, string $expected): void {
    $recorder = new CacheInteractions(mock(Pulse::class));
    $group = Closure::bind(fn (string $value): string => $this->group($value), $recorder, CacheInteractions::class);

    expect($group($key))->toBe($expected);
})->with([
    ['markers:v4:-88.20000,43.00000,-88.10000,43.10000', 'markers:v4:*'],
    ['markers:v4:grid:-88.20,43.00,-88.10,43.10', 'markers:v4:*'],
    ['electronic-horizon:alpr:'.str_repeat('a', 64), 'electronic-horizon:alpr:*'],
    ['electronic-horizon:alpr:v3:'.str_repeat('b', 64), 'electronic-horizon:alpr:v3:*'],
    ['moderation:summary:v2:'.str_repeat('c', 64), 'moderation:summary:v2:*'],
    ['police-alerts:30.27:-97.74', 'police-alerts:*'],
    ['police-alerts:monthly-quota:2026-10', 'police-alerts:monthly-quota:2026-10'],
    ['directions:graphhopper:open', 'directions:graphhopper:open'],
    ['job-exceptions:123', 'job-exceptions:*'],
]);

it('groups outgoing requests by endpoint without retaining query parameters', function (string $uri, string $expected): void {
    $recorder = new SlowOutgoingRequests(mock(Pulse::class));
    $group = Closure::bind(fn (string $value): string => $this->group($value), $recorder, SlowOutgoingRequests::class);

    expect($group($uri))->toBe($expected);
})->with([
    ['https://api.openwebninja.com/waze/alerts-and-jams?center=30.267200%2C-97.743100&radius=10', 'https://api.openwebninja.com/waze/alerts-and-jams'],
    ['http://graphhopper.daf-routing.internal:8080/route?point=30.2672,-97.7431', 'http://graphhopper.daf-routing.internal:8080/route'],
    ['https://overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter'],
    ['https://api.openwebninja.com/another-endpoint?center=31,-98', 'https://api.openwebninja.com/another-endpoint'],
]);
