<?php

use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Tests\TestCase;

pest()->extend(TestCase::class);

it('allows Pulse dashboard values to be unserialized from cache', function () {
    $payload = [
        collect([
            (object) ['latest' => CarbonImmutable::parse('2026-08-08 12:00:00')],
        ]),
        0.01,
        '2026-08-08 12:00:00',
    ];

    $cachedPayload = unserialize(serialize($payload), [
        'allowed_classes' => config('cache.serializable_classes'),
    ]);

    expect($cachedPayload[0])
        ->toBeInstanceOf(Collection::class)
        ->and($cachedPayload[0]->first())
        ->toBeInstanceOf(stdClass::class)
        ->and($cachedPayload[0]->first()->latest)
        ->toBeInstanceOf(CarbonImmutable::class);
});
