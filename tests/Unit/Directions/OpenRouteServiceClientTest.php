<?php

use App\Services\Directions\DirectionsException;
use App\Services\Directions\OpenRouteServiceClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

beforeEach(function () {
    Http::preventStrayRequests();
    $this->coordinates = [
        ['longitude' => -104.7, 'latitude' => 39.8],
        ['longitude' => -104.69, 'latitude' => 39.84],
        ['longitude' => -104.6764061, 'latitude' => 39.8563486],
    ];
    $this->zone = ['type' => 'MultiPolygon', 'coordinates' => []];
    $this->routeResponse = ['features' => [[
        'geometry' => ['coordinates' => [[-104.7, 39.8], [-104.68, 39.85]]],
        'properties' => ['summary' => ['distance' => 1000, 'duration' => 120]],
    ]]];
});

it('retries a point not found with a bounded search radius for each coordinate', function () {
    $this->zone['coordinates'] = [[[[-104.8, 39.8], [-104.8, 39.9], [-104.9, 39.8], [-104.8, 39.8]]]];
    Http::fake(['*' => Http::sequence()
        ->push(['error' => ['code' => 2010, 'message' => 'Could not find routable point within a radius of 350.0 meters.']], 400)
        ->push($this->routeResponse)]);

    $route = app(OpenRouteServiceClient::class)->route($this->coordinates, $this->zone, false);
    $requests = Http::recorded()->pluck(0);

    expect($route['coordinates'])->toHaveCount(2)
        ->and($requests)->toHaveCount(2)
        ->and($requests[0]->data())->not->toHaveKey('radiuses')
        ->and($requests[1]->data())->toBe([
            ...$requests[0]->data(),
            'radiuses' => [2000, 2000, 2000],
        ])
        ->and($requests[1]['options']['avoid_polygons'])->toBe($this->zone)
        ->and($requests[1]['continue_straight'])->toBeFalse();
});

it('keeps the default road search radius when routing succeeds', function () {
    Http::fake(['*' => Http::response($this->routeResponse)]);

    app(OpenRouteServiceClient::class)->route($this->coordinates, $this->zone);

    Http::assertSentCount(1);
    expect(Http::recorded()[0][0]->data())->not->toHaveKey('radiuses');
});

it('stops after one expanded radius attempt', function () {
    Http::fake(['*' => Http::response(['error' => ['code' => 2010, 'message' => 'No routable point.']], 400)]);

    expect(fn () => app(OpenRouteServiceClient::class)->route($this->coordinates, $this->zone))
        ->toThrow(DirectionsException::class, 'No routable point.');

    Http::assertSentCount(2);
});

it('does not retry unrelated client errors', function (int $code) {
    Http::fake(['*' => Http::response(['error' => ['code' => $code, 'message' => 'Route unavailable.']], 400)]);

    expect(fn () => app(OpenRouteServiceClient::class)->route($this->coordinates, $this->zone))
        ->toThrow(DirectionsException::class, 'Route unavailable.');

    Http::assertSentCount(1);
})->with([2003, 2009, 2011]);

it('still retries temporary upstream failures', function () {
    Http::fake(['*' => Http::sequence()->push([], 503)->push($this->routeResponse)]);

    app(OpenRouteServiceClient::class)->route($this->coordinates, $this->zone);

    Http::assertSentCount(2);
});
