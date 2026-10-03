<?php

use App\Http\Controllers\Api\MarkersController;
use App\Repositories\MapRepository;
use App\Services\MarkerFileCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Tests\TestCase;

uses(TestCase::class);

it('serves the marker file for requests without viewport bounds', function () {
    $path = storage_path('framework/testing/markers.json');
    File::ensureDirectoryExists(dirname($path));
    File::put($path, '{"points":[]}');

    $markerFileCache = mock(MarkerFileCache::class);
    $markerFileCache
        ->shouldReceive('getOrCreatePath')
        ->once()
        ->andReturn($path);

    $this->app->instance(MarkerFileCache::class, $markerFileCache);

    $controller = app(MarkersController::class);
    $request = Request::create('/markers', 'GET');

    $response = $controller($request);

    expect($response)->toBeInstanceOf(BinaryFileResponse::class)
        ->and($response->getStatusCode())->toBe(200)
        ->and($response->headers->get('content-type'))->toContain('application/json');

    File::delete($path);
});

it('rejects marker requests with incomplete viewport bounds', function () {
    $controller = app(MarkersController::class);
    $request = Request::create('/markers', 'GET', [
        'sw_lng' => -88.4,
    ]);

    $response = $controller($request);

    expect($response)->toBeInstanceOf(JsonResponse::class)
        ->and($response->getStatusCode())->toBe(422)
        ->and($response->getData(true)['errors'])->toHaveKeys([
            'sw_lat',
            'ne_lng',
            'ne_lat',
        ]);
});

it('rejects marker requests for overly broad viewport bounds', function () {
    $controller = app(MarkersController::class);
    $request = Request::create('/markers', 'GET', [
        'sw_lng' => -125,
        'sw_lat' => 24,
        'ne_lng' => -66,
        'ne_lat' => 50,
    ]);

    $response = $controller($request);

    expect($response)->toBeInstanceOf(JsonResponse::class)
        ->and($response->getStatusCode())->toBe(422)
        ->and($response->getData(true)['errors'])->toHaveKey('bounds');
});

it('rejects marker requests with inverted latitude bounds', function () {
    $controller = app(MarkersController::class);
    $request = Request::create('/markers', 'GET', [
        'sw_lng' => -88.4,
        'sw_lat' => 43.2,
        'ne_lng' => -88.1,
        'ne_lat' => 43.0,
    ]);

    $response = $controller($request);

    expect($response)->toBeInstanceOf(JsonResponse::class)
        ->and($response->getStatusCode())->toBe(422)
        ->and($response->getData(true)['errors'])->toHaveKey('bounds');
});

it('caches marker requests for viewport bounds', function () {
    Cache::flush();

    $markerRepository = mock(MapRepository::class);
    $markerRepository
        ->shouldReceive('getPoints')
        ->once()
        ->with(-88.2, 43.0, -88.1, 43.1)
        ->andReturn([
            'points' => [
                ['id' => 1, 'location' => [-88.15, 43.05]],
            ],
        ]);

    $this->app->instance(MapRepository::class, $markerRepository);

    $controller = app(MarkersController::class);
    $request = Request::create('/markers', 'GET', [
        'sw_lng' => -88.2,
        'sw_lat' => 43.0,
        'ne_lng' => -88.1,
        'ne_lat' => 43.1,
    ]);

    $firstResult = $controller($request);
    $secondResult = $controller($request);

    expect($firstResult)->toEqual($secondResult)
        ->and(Cache::has('markers:v4:grid:-88.20000,43.00000,-88.10000,43.10000'))->toBeTrue();
});

it('caches marker requests for the same viewport bounds', function () {
    Cache::flush();

    $markerRepository = mock(MapRepository::class);
    $markerRepository
        ->shouldReceive('getPoints')
        ->once()
        ->with(-122.5, 45.52, -122.4, 45.63)
        ->andReturn([
            'points' => [
                ['id' => 1, 'location' => [-122.45, 45.55]],
            ],
        ]);

    $this->app->instance(MapRepository::class, $markerRepository);

    $controller = app(MarkersController::class);
    $request = Request::create('/markers', 'GET', [
        'sw_lng' => -122.5,
        'sw_lat' => 45.5239,
        'ne_lng' => -122.4,
        'ne_lat' => 45.6241,
    ]);

    $firstResult = $controller($request);
    $secondResult = $controller($request);

    expect($firstResult)->toEqual($secondResult);
});

it('uses separate caches for separate viewport bounds', function () {
    Cache::flush();

    $markerRepository = mock(MapRepository::class);
    $markerRepository
        ->shouldReceive('getPoints')
        ->once()
        ->with(-122.5, 45.52, -122.4, 45.63)
        ->andReturn([
            'points' => [
                ['id' => 1, 'location' => [-122.45, 45.55]],
            ],
        ]);
    $markerRepository
        ->shouldReceive('getPoints')
        ->once()
        ->with(-121.0, 44.1, -120.9, 44.2)
        ->andReturn([
            'points' => [
                ['id' => 2, 'location' => [-120.95, 44.15]],
            ],
        ]);

    $this->app->instance(MapRepository::class, $markerRepository);

    $controller = app(MarkersController::class);
    $firstRequest = Request::create('/markers', 'GET', [
        'sw_lng' => -122.5,
        'sw_lat' => 45.5239,
        'ne_lng' => -122.4,
        'ne_lat' => 45.6241,
    ]);
    $secondRequest = Request::create('/markers', 'GET', [
        'sw_lng' => -121.0,
        'sw_lat' => 44.1,
        'ne_lng' => -120.9,
        'ne_lat' => 44.2,
    ]);

    $firstResult = $controller($firstRequest);
    $secondResult = $controller($secondRequest);

    expect($firstResult)->toEqual([
        'points' => [
            ['id' => 1, 'location' => [-122.45, 45.55]],
        ],
    ]);

    expect($secondResult)->toEqual([
        'points' => [
            ['id' => 2, 'location' => [-120.95, 44.15]],
        ],
    ]);
});

it('shares marker candidates across nearby viewports and filters their exact edges', function (): void {
    Cache::flush();
    $points = [
        ['id' => 1, 'location' => [-88.199, 43.001]],
        ['id' => 2, 'location' => [-88.101, 43.099]],
        ['id' => 3, 'location' => [-88.1995, 43.001]],
        ['id' => 4, 'location' => [-88.15, 43.101]],
        ['id' => 5, 'location' => [-88.199, 43.0005]],
    ];
    $this->app->instance(MapRepository::class, mock(MapRepository::class)
        ->shouldReceive('getPoints')->once()->with(-88.2, 43.0, -88.1, 43.1)
        ->andReturn(['points' => $points])->getMock());
    $controller = app(MarkersController::class);
    $first = $controller(Request::create('/markers', 'GET', [
        'sw_lng' => -88.199, 'sw_lat' => 43.001, 'ne_lng' => -88.101, 'ne_lat' => 43.099,
    ]));
    $second = $controller(Request::create('/markers', 'GET', [
        'sw_lng' => -88.198, 'sw_lat' => 43.002, 'ne_lng' => -88.1005, 'ne_lat' => 43.0995,
    ]));

    expect(array_column($first['points'], 'id'))->toBe([1, 2])
        ->and(array_column($second['points'], 'id'))->toBe([2])
        ->and(array_keys($second['points']))->toBe([0]);
});

it('preserves marker bounds at geographic edges', function (array $bounds, array $grid, array $locations): void {
    Cache::flush();
    $points = array_map(fn (array $location): array => ['location' => $location], $locations);
    $this->app->instance(MapRepository::class, mock(MapRepository::class)
        ->shouldReceive('getPoints')->once()->with(...$grid)
        ->andReturn(['points' => $points])->getMock());
    $controller = app(MarkersController::class);
    $result = $controller(Request::create('/markers', 'GET', array_combine(
        ['sw_lng', 'sw_lat', 'ne_lng', 'ne_lat'], $bounds,
    )));

    expect($result['points'])->toBe(array_slice($points, 0, 2));
})->with([
    'antimeridian' => [
        [179.901, -0.999, -179.901, 0.999],
        [179.9, -1.0, -179.9, 1.0],
        [[179.901, -0.999], [-179.901, 0.999], [179.9005, 0.0], [0.0, 0.0]],
    ],
    'north pole and western edge' => [
        [-180.0, 89.901, -179.901, 90.0],
        [-180.0, 89.9, -179.9, 90.0],
        [[-180.0, 90.0], [-179.901, 89.901], [-179.9005, 89.95], [-179.95, 89.9005]],
    ],
    'south pole and eastern edge' => [
        [179.901, -90.0, 180.0, -89.901],
        [179.9, -90.0, 180.0, -89.9],
        [[180.0, -90.0], [179.901, -89.901], [179.9005, -89.95], [179.95, -89.9005]],
    ],
]);
