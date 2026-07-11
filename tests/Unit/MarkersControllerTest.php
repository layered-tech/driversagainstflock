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
                ['id' => 1],
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

    expect($firstResult)->toEqual($secondResult);
});

it('caches marker requests for the same viewport bounds', function () {
    Cache::flush();

    $markerRepository = mock(MapRepository::class);
    $markerRepository
        ->shouldReceive('getPoints')
        ->once()
        ->with(-122.5, 45.5239, -122.4, 45.6241)
        ->andReturn([
            'points' => [
                ['id' => 1],
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
        ->with(-122.5, 45.5239, -122.4, 45.6241)
        ->andReturn([
            'points' => [
                ['id' => 1],
            ],
        ]);
    $markerRepository
        ->shouldReceive('getPoints')
        ->once()
        ->with(-121.0, 44.1, -120.9, 44.2)
        ->andReturn([
            'points' => [
                ['id' => 2],
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
            ['id' => 1],
        ],
    ]);

    expect($secondResult)->toEqual([
        'points' => [
            ['id' => 2],
        ],
    ]);
});
