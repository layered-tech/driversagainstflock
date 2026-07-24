<?php

use App\Services\SpeedLimits\MaxspeedParser;

it('normalizes supported OSM speed units to miles per hour', function (mixed $maxspeed, int $expectedMph) {
    expect((new MaxspeedParser)->toMph($maxspeed))->toBe($expectedMph);
})->with([
    'miles per hour' => ['35 mph', 35],
    'kilometers per hour' => ['80', 50],
    'explicit kilometers per hour' => ['100 km/h', 62],
    'numeric kilometers per hour' => [50, 31],
]);

it('does not invent a speed for non-numeric or ambiguous OSM values', function (mixed $maxspeed) {
    expect((new MaxspeedParser)->toMph($maxspeed))->toBeNull();
})->with([
    'empty' => [''],
    'no posted limit' => ['none'],
    'signals' => ['signals'],
    'variable' => ['variable'],
    'walking pace' => ['walk'],
    'semicolon-separated values' => ['35 mph;50 mph'],
    'pipe-separated values' => ['35 mph|50 mph'],
    'zero' => ['0'],
    'unsupported jurisdiction code' => ['US:urban'],
]);
