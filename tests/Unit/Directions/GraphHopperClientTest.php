<?php

use App\Services\Directions\DirectionsException;
use App\Services\Directions\GraphHopperClient;
use App\Services\Directions\OpenRouteServiceClient;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

function graphHopperClientResponse(): array
{
    return [
        'paths' => [[
            'distance' => 1234.5,
            'time' => 321000,
            'points' => [
                'type' => 'LineString',
                'coordinates' => [
                    [-77.0365, 38.8977],
                    [-77.02, 38.892],
                    [-77.0091, 38.8899],
                ],
            ],
            'instructions' => [[
                'text' => 'Continue onto Main Street',
                'street_name' => 'Main Street',
                'distance' => 100.0,
                'time' => 20000,
                'interval' => [0, 1],
                'sign' => 0,
            ], [
                'text' => 'Turn right',
                'street_name' => 'Second Street',
                'distance' => 1134.5,
                'time' => 301000,
                'interval' => [1, 2],
                'sign' => 2,
            ]],
        ]],
    ];
}

function openRouteServiceClientResponse(): array
{
    return [
        'type' => 'FeatureCollection',
        'features' => [[
            'type' => 'Feature',
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => [
                    [-77.0365, 38.8977],
                    [-77.0091, 38.8899],
                ],
            ],
            'properties' => [
                'summary' => ['distance' => 1234.5, 'duration' => 321.0],
                'segments' => [[
                    'steps' => [[
                        'instruction' => 'Head east',
                        'distance' => 1234.5,
                        'duration' => 321.0,
                        'type' => 11,
                        'way_points' => [0, 1],
                    ]],
                ]],
            ],
        ]],
    ];
}

function directionsProviderContract(array $route): array
{
    return [
        'keys' => array_keys($route),
        'coordinates' => collect($route['coordinates'])->every(
            fn (array $coordinate): bool => count($coordinate) >= 2
                && is_float($coordinate[0])
                && is_float($coordinate[1]),
        ),
        'distance' => get_debug_type($route['distance']),
        'duration' => get_debug_type($route['duration']),
        'maneuvers' => get_debug_type($route['maneuvers']),
    ];
}

beforeEach(function () {
    config([
        'services.graphhopper.url' => 'http://graphhopper.test:8080',
        'services.graphhopper.token' => 'test-graphhopper-token',
        'services.graphhopper.profile' => 'car',
        'services.graphhopper.connect_timeout_seconds' => 3,
        'services.graphhopper.timeout_seconds' => 45,
        'services.graphhopper.route_timeout_milliseconds' => 40000,
        'services.openrouteservice.api_key' => 'test-ors-key',
    ]);

    Http::preventStrayRequests();
});

it('normalizes GraphHopper responses to the directions provider contract', function () {
    Http::fake([
        'http://graphhopper.test:8080/route' => Http::response(graphHopperClientResponse()),
    ]);

    $route = app(GraphHopperClient::class)->route([
        ['longitude' => -77.0365, 'latitude' => 38.8977],
        ['longitude' => -77.0091, 'latitude' => 38.8899],
    ], ['type' => 'MultiPolygon', 'coordinates' => []]);

    expect(array_keys($route))->toBe(['coordinates', 'distance', 'duration', 'maneuvers'])
        ->and($route['coordinates'])->toHaveCount(3)
        ->and($route['distance'])->toBe(1234.5)
        ->and($route['duration'])->toBe(321.0)
        ->and(data_get($route, 'maneuvers.0.type'))->toBe(11)
        ->and(data_get($route, 'maneuvers.0.duration'))->toBe(20.0)
        ->and(data_get($route, 'maneuvers.0.way_points'))->toBe([0, 1])
        ->and(data_get($route, 'maneuvers.0.maneuver.location'))->toBe([-77.0365, 38.8977])
        ->and(data_get($route, 'maneuvers.1.type'))->toBe(1);

    Http::assertSent(fn (Request $request): bool => $request->url() === 'http://graphhopper.test:8080/route'
        && $request->hasHeader('Authorization', 'Bearer test-graphhopper-token')
        && $request['points'] === [[-77.0365, 38.8977], [-77.0091, 38.8899]]
        && $request['profile'] === 'car'
        && $request['points_encoded'] === false
        && $request['pass_through'] === true
        && $request['timeout_ms'] === 40000
        && ! isset($request['custom_model']));
});

it('normalizes ORS and GraphHopper to the same payload structure', function () {
    Http::fake([
        'http://graphhopper.test:8080/route' => Http::response(graphHopperClientResponse()),
        'https://api.heigit.org/*' => Http::response(openRouteServiceClientResponse()),
    ]);
    $coordinates = [
        ['longitude' => -77.0365, 'latitude' => 38.8977],
        ['longitude' => -77.0091, 'latitude' => 38.8899],
    ];
    $exclusionZone = ['type' => 'MultiPolygon', 'coordinates' => []];

    $openRouteServiceRoute = app(OpenRouteServiceClient::class)->route($coordinates, $exclusionZone);
    $graphHopperRoute = app(GraphHopperClient::class)->route($coordinates, $exclusionZone);

    expect(directionsProviderContract($graphHopperRoute))
        ->toBe(directionsProviderContract($openRouteServiceRoute))
        ->and(directionsProviderContract($graphHopperRoute))->toBe([
            'keys' => ['coordinates', 'distance', 'duration', 'maneuvers'],
            'coordinates' => true,
            'distance' => 'float',
            'duration' => 'float',
            'maneuvers' => 'array',
        ]);
});

it('converts exclusion polygons to a GraphHopper 11 custom model', function () {
    Http::fake([
        'http://graphhopper.test:8080/route' => Http::response(graphHopperClientResponse()),
    ]);
    $polygon = [[
        [-77.03, 38.89],
        [-77.02, 38.89],
        [-77.02, 38.90],
        [-77.03, 38.90],
        [-77.03, 38.89],
    ]];

    app(GraphHopperClient::class)->route([
        ['longitude' => -77.0365, 'latitude' => 38.8977],
        ['longitude' => -77.0091, 'latitude' => 38.8899],
    ], [
        'type' => 'MultiPolygon',
        'coordinates' => [$polygon, $polygon],
    ], false);

    Http::assertSent(function (Request $request) use ($polygon): bool {
        $requestBody = json_decode($request->body());

        return $request['ch.disable'] === true
            && $request['pass_through'] === false
            && data_get($request, 'custom_model.priority.0.if') === 'in_avoid_area_0 || in_avoid_area_1'
            && data_get($request, 'custom_model.priority.0.multiply_by') === '0'
            && data_get($request, 'custom_model.areas.type') === 'FeatureCollection'
            && data_get($request, 'custom_model.areas.features.0.id') === 'avoid_area_0'
            && data_get($request, 'custom_model.areas.features.0.geometry.type') === 'Polygon'
            && data_get($request, 'custom_model.areas.features.0.geometry.coordinates') === $polygon
            && is_object(data_get($requestBody, 'custom_model.areas.features.0.properties'));
    });
});

it('fails safely without exposing GraphHopper error details', function () {
    Http::fake([
        'http://graphhopper.test:8080/route' => Http::response([
            'message' => 'Cannot find point at sensitive coordinates',
            'hints' => [['message' => 'sensitive coordinates']],
        ], 400),
    ]);

    expect(fn () => app(GraphHopperClient::class)->route([
        ['longitude' => -77.0365, 'latitude' => 38.8977],
        ['longitude' => -77.0091, 'latitude' => 38.8899],
    ], ['type' => 'MultiPolygon', 'coordinates' => []]))
        ->toThrow(DirectionsException::class, 'GraphHopper could not load directions.');
});

it('sends avoidance models without application-side size limits', function () {
    Http::fake([
        'http://graphhopper.test:8080/route' => Http::response(graphHopperClientResponse()),
    ]);
    $polygon = [[
        [-77.03, 38.89],
        [-77.02, 38.89],
        [-77.02, 38.90],
        [-77.03, 38.90],
        [-77.03, 38.89],
    ]];
    $polygons = array_fill(0, 1001, $polygon);

    app(GraphHopperClient::class)->route([
        ['longitude' => -77.0365, 'latitude' => 38.8977],
        ['longitude' => -77.0091, 'latitude' => 38.8899],
    ], [
        'type' => 'MultiPolygon',
        'coordinates' => $polygons,
    ]);

    Http::assertSent(fn (Request $request): bool => count(
        data_get($request, 'custom_model.areas.features', [])
    ) === count($polygons));
});
