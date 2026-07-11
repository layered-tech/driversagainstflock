<?php

use App\Services\Directions\DirectionRange;
use App\Services\Directions\GeometryService;
use App\Services\Directions\PointOfInterest;

test('it builds cone polygons for directed pois and circles for unknown directions', function () {
    $geometry = new GeometryService;
    $directed = new PointOfInterest(1, -88.2, 43.1, [new DirectionRange(90.0, 90.0)]);
    $unknown = new PointOfInterest(2, -88.3, 43.2, [null]);

    $zone = $geometry->exclusionZone([$directed, $unknown], 250, 45, 2);

    expect($zone['type'])->toBe('MultiPolygon')
        ->and($zone['coordinates'])->toHaveCount(2)
        ->and($zone['coordinates'][0][0])->toHaveCount(5)
        ->and($zone['coordinates'][0][0][0])->toBe([-88.2, 43.1])
        ->and($zone['coordinates'][1][0])->toHaveCount(33);
});

test('it detects routes outside search bounds', function () {
    $geometry = new GeometryService;
    $bounds = ['west' => -1.0, 'south' => -1.0, 'east' => 1.0, 'north' => 1.0];

    expect($geometry->routeInsideBounds([[0.0, 0.0], [0.5, 0.5]], $bounds))->toBeTrue()
        ->and($geometry->routeInsideBounds([[0.0, 0.0], [2.0, 0.5]], $bounds))->toBeFalse();
});

test('it builds endpoint buffer polygons around both endpoints', function () {
    $geometry = new GeometryService;

    $zone = $geometry->endpointBufferZone(
        ['longitude' => -88.2, 'latitude' => 43.1],
        ['longitude' => -88.3, 'latitude' => 43.2],
        250
    );

    expect($zone['type'])->toBe('MultiPolygon')
        ->and($zone['coordinates'])->toHaveCount(2)
        ->and($zone['coordinates'][0][0])->toHaveCount(33)
        ->and($zone['coordinates'][1][0])->toHaveCount(33)
        ->and($zone['coordinates'][0][0][0])->toBe($zone['coordinates'][0][0][32])
        ->and($zone['coordinates'][1][0][0])->toBe($zone['coordinates'][1][0][32]);
});

test('it counts unique points of interest near a route', function () {
    $geometry = new GeometryService;
    $route = [[-88.2, 43.1], [-88.21, 43.11], [-88.22, 43.12]];

    $count = $geometry->countPoisAlongRoute([
        new PointOfInterest(1, -88.205, 43.105, []),
        new PointOfInterest(1, -88.2051, 43.1051, []),
        new PointOfInterest(2, -88.5, 43.5, []),
    ], $route, 250);

    expect($count)->toBe(1);
});

test('it clears endpoint-blocking polygons from the exclusion zone', function () {
    $geometry = new GeometryService;
    $zone = [
        'type' => 'MultiPolygon',
        'coordinates' => [[[
            [-0.001, -0.001],
            [0.001, -0.001],
            [0.001, 0.001],
            [-0.001, 0.001],
            [-0.001, -0.001],
        ]]],
    ];

    $cleared = $geometry->clearEndpointBuffers(
        $zone,
        ['longitude' => 0.0, 'latitude' => 0.0],
        ['longitude' => 1.0, 'latitude' => 1.0],
        250
    );

    expect($cleared)->toBe(['type' => 'MultiPolygon', 'coordinates' => []]);
});

test('it clears polygons inside endpoint buffers even when endpoints are outside the polygons', function () {
    $geometry = new GeometryService;
    $zone = [
        'type' => 'MultiPolygon',
        'coordinates' => [[[
            [0.0009, -0.0001],
            [0.0011, -0.0001],
            [0.0011, 0.0001],
            [0.0009, 0.0001],
            [0.0009, -0.0001],
        ]]],
    ];

    $cleared = $geometry->clearEndpointBuffers(
        $zone,
        ['longitude' => 0.0, 'latitude' => 0.0],
        ['longitude' => 1.0, 'latitude' => 1.0],
        250
    );

    expect($cleared)->toBe(['type' => 'MultiPolygon', 'coordinates' => []]);
});
