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
    $pois = [
        new PointOfInterest(1, -88.205, 43.105, []),
        new PointOfInterest(1, -88.2051, 43.1051, []),
        new PointOfInterest(2, -88.5, 43.5, []),
    ];

    $routePois = $geometry->poisAlongRoute($pois, $route, 250);

    expect($routePois)->toHaveCount(1)
        ->and($routePois[0]->id)->toBe(1)
        ->and($geometry->countPoisAlongRoute($pois, $route, 250))->toBe(1);
});

test('it returns stable direction aware route camera candidates in route order', function () {
    $geometry = new GeometryService;
    $route = [
        [0.0002, -0.001],
        [0.0002, 0.001],
        [0.002, 0.001],
    ];

    $candidates = $geometry->routeCameraCandidates([
        new PointOfInterest(11, 0.0, 0.0, [new DirectionRange(90.0, 90.0)]),
        new PointOfInterest(12, 0.0015, 0.001, [null]),
        new PointOfInterest(13, -0.0002, 0.0, [new DirectionRange(270.0, 270.0)]),
    ], $route, 50, 45, 8);

    expect($candidates)->toHaveCount(2)
        ->and($candidates[0]['osm_id'])->toBe(11)
        ->and($candidates[0]['direction_known'])->toBeTrue()
        ->and($candidates[0]['directions'][0])->toBe([
            'start' => 90.0,
            'end' => 90.0,
            'is_range' => false,
        ])
        ->and($candidates[0]['route_progress_fraction'])->toBeGreaterThan(0.2)
        ->and($candidates[0]['route_progress_fraction'])->toBeLessThan(0.5)
        ->and($candidates[1]['osm_id'])->toBe(12)
        ->and($candidates[1]['direction_known'])->toBeFalse()
        ->and($candidates[1]['directions'])->toBe([])
        ->and($candidates[1]['route_progress_fraction'])->toBeGreaterThan($candidates[0]['route_progress_fraction']);
});

test('it does not count a route that passes behind a directional camera', function () {
    $geometry = new GeometryService;

    $candidates = $geometry->routeCameraCandidates([
        new PointOfInterest(21, 0.0, 0.0, [new DirectionRange(90.0, 90.0)]),
    ], [
        [-0.0002, -0.001],
        [-0.0002, 0.001],
    ], 50, 45, 8);

    expect($candidates)->toBe([]);
});

test('it returns every nearby camera for local monitoring with structured directions', function () {
    $geometry = new GeometryService;

    $nodes = $geometry->routeMonitoringCameraNodes([
        new PointOfInterest(31, 0.0, 0.0, [new DirectionRange(270.0, 270.0)], [
            'name' => 'Westbound reader',
            'operator' => 'City agency',
            'serial_number' => 'private-detail',
        ]),
        new PointOfInterest(null, -0.0002, 0.0005, [null]),
        new PointOfInterest(32, 0.01, 0.01, [null]),
    ], [
        [0.0002, -0.001],
        [0.0002, 0.001],
    ], 50);

    expect($nodes)->toHaveCount(2)
        ->and($nodes[0])->toBe([
            'osm_id' => 31,
            'coordinate' => [0.0, 0.0],
            'direction_known' => true,
            'directions' => [[
                'start' => 270.0,
                'end' => 270.0,
                'is_range' => false,
            ]],
            'name' => 'Westbound reader',
            'operator' => 'City agency',
        ])
        ->and($nodes[1]['osm_id'])->toBeNull()
        ->and($nodes[1]['direction_known'])->toBeFalse()
        ->and($nodes[1]['directions'])->toBe([]);
});

test('it keeps cameras without stable ids out of scored route candidates', function () {
    $geometry = new GeometryService;
    $route = [
        [0.0002, -0.001],
        [0.0002, 0.001],
    ];
    $pois = [
        new PointOfInterest(null, 0.0, 0.0, [null]),
        new PointOfInterest(41, 0.0001, 0.0005, [null]),
    ];

    $intersections = $geometry->routeCameraIntersections($pois, $route, 50, 45, 8);
    $candidates = $geometry->routeCameraCandidates($pois, $route, 50, 45, 8);

    expect($intersections)->toHaveCount(2)
        ->and($intersections[0]['osm_id'])->toBeNull()
        ->and($candidates)->toHaveCount(1)
        ->and($candidates[0]['osm_id'])->toBe(41);
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
