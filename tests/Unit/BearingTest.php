<?php

use App\Models\Marker;
use App\Support\Bearing;

test('it normalizes valid compass bearings', function () {
    expect(Bearing::normalize(0))->toBe(0)
        ->and(Bearing::normalize('90'))->toBe(90)
        ->and(Bearing::normalize(-90))->toBe(270)
        ->and(Bearing::normalize(360))->toBe(0);
});

test('it rejects invalid bearings before they reach the database', function () {
    expect(Bearing::normalize(null))->toBeNull()
        ->and(Bearing::normalize(''))->toBeNull()
        ->and(Bearing::normalize('north'))->toBeNull()
        ->and(Bearing::normalize('4555555555'))->toBeNull();
});

test('markers normalize bearing attributes', function () {
    $marker = new Marker([
        'bearing' => '4555555555',
    ]);

    expect($marker->bearing)->toBeNull();
});
