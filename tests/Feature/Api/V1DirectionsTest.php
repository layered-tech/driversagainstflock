<?php

use App\Models\OsmNode;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use MatanYadaev\EloquentSpatial\Objects\Point;

function directionsRequestPayload(array $overrides = []): array
{
    return array_replace_recursive([
        'start' => ['longitude' => -122.676, 'latitude' => 45.523],
        'end' => ['longitude' => -122.658, 'latitude' => 45.512],
        'profile' => [[
            'id' => 'generic-alpr',
            'name' => 'ALPR (any)',
            'tags' => ['surveillance:type' => 'ALPR'],
        ]],
        'avoid_buffer' => 250,
        'allow_alpr_near_start_destination' => true,
        'continue_straight' => true,
        'show_zone' => false,
    ], $overrides);
}

function orsDirectionsResponse(array $coordinates): array
{
    return [
        'type' => 'FeatureCollection',
        'features' => [[
            'type' => 'Feature',
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => $coordinates,
            ],
            'properties' => [
                'summary' => [
                    'distance' => 1234.5,
                    'duration' => 321.0,
                ],
                'segments' => [[
                    'steps' => [[
                        'instruction' => 'Head east',
                        'distance' => 100.0,
                        'duration' => 20.0,
                        'type' => 11,
                        'way_points' => [0, 1],
                        'name' => 'Main Street',
                        'maneuver' => [
                            'location' => [-122.676, 45.523],
                            'bearing_before' => 0,
                            'bearing_after' => 90,
                        ],
                    ]],
                ]],
            ],
        ]],
    ];
}

function createDirectionsOsmNode(
    int $osmId,
    float $latitude,
    float $longitude,
    array $tags = ['surveillance:type' => 'ALPR', 'camera:direction' => 'E'],
    ?Point $storedLocation = null,
): OsmNode {
    return OsmNode::query()->create([
        'osm_id' => $osmId,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'location' => $storedLocation ?? new Point($latitude, $longitude),
        'tags' => $tags,
        'surveillance_type' => $tags['surveillance:type'] ?? null,
        'direction' => $tags['direction'] ?? null,
        'camera_direction' => $tags['camera:direction'] ?? null,
        'last_synced_at' => now(),
    ]);
}

beforeEach(function () {
    $this->withoutMiddleware();

    config([
        'directions.avoid_buffer_meters' => 50,
        'directions.poi_backend' => 'overpass',
        'directions.overpass_url' => 'https://overpass.test/api/interpreter',
        'services.openrouteservice.api_key' => 'test-ors-key',
    ]);
});

it('returns normalized directions with maneuvers and optional exclusion zone', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'id' => 100,
                'lat' => 45.52,
                'lon' => -122.66,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'camera:direction' => 'E',
                ],
            ]],
        ]),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.66, 45.52],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'show_zone' => true,
    ]))
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('result.route.distance', 1234.5)
        ->assertJsonPath('result.route.duration', 321)
        ->assertJsonPath('result.routes.direct.distance', 1234.5)
        ->assertJsonPath('result.routes.direct.fastest_route_node_count', 1)
        ->assertJsonPath('result.routes.direct.node_count', 1)
        ->assertJsonPath('result.routes.ideal.distance', 1234.5)
        ->assertJsonPath('result.fastest_route_node_count', 1)
        ->assertJsonPath('result.route.maneuvers.0.instruction', 'Head east')
        ->assertJsonPath('result.route.maneuvers.0.maneuver.location.0', -122.676)
        ->assertJsonPath('result.exclusion_zone.type', 'Feature')
        ->assertJsonPath('result.exclusion_zone.geometry.type', 'MultiPolygon')
        ->assertJsonPath('result.debug_geometry.type', 'FeatureCollection')
        ->assertJsonPath('result.debug_geometry.features.0.properties.debugRole', 'destination_line')
        ->assertJsonPath('result.debug_geometry.features.0.geometry.type', 'LineString')
        ->assertJsonPath('result.debug_geometry.features.1.properties.debugRole', 'search_zone')
        ->assertJsonPath('result.debug_geometry.features.1.geometry.type', 'Polygon')
        ->assertJsonPath('result.debug_geometry.features.2.properties.debugRole', 'endpoint_buffers')
        ->assertJsonPath('result.debug_geometry.features.2.geometry.type', 'MultiPolygon')
        ->assertJsonPath('result.debug_geometry.features.2.properties.allowAlprNearStartDestination', true)
        ->assertJsonPath('result.debug_geometry.features.2.properties.avoidBufferMeters', 250)
        ->assertJsonPath('result.debug_geometry.features.2.properties.endpointBufferMeters', 500)
        ->assertJsonPath('result.debug_geometry.features.2.properties.polygonCount', 2)
        ->assertJsonPath('result.debug_geometry.features.3.properties.debugRole', 'avoid_polygons')
        ->assertJsonPath('result.debug_geometry.features.3.geometry.type', 'MultiPolygon');

    Http::assertSent(fn ($request) => str_contains($request->url(), 'openrouteservice')
        && str_contains($request->header('Accept')[0] ?? '', 'application/geo+json')
        && data_get($request->data(), 'continue_straight') === true
        && data_get($request->data(), 'options.avoid_polygons.type') === 'MultiPolygon'
        && data_get($request->data(), 'instructions') === true
        && data_get($request->data(), 'maneuvers') === true);

    $orsRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'openrouteservice'))
        ->values();

    expect(data_get($orsRequests[0][0]->data(), 'continue_straight'))->toBeTrue()
        ->and(data_get($orsRequests[0][0]->data(), 'options.avoid_polygons'))->toBeNull()
        ->and(data_get($orsRequests[1][0]->data(), 'continue_straight'))->toBeTrue()
        ->and(data_get($orsRequests[1][0]->data(), 'options.avoid_polygons.type'))->toBe('MultiPolygon');
});

it('hides the exclusion zone unless requested', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(['elements' => []]),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'show_zone' => null,
    ]))
        ->assertOk()
        ->assertJsonPath('result.exclusion_zone', null)
        ->assertJsonPath('result.debug_geometry', null);
});

it('allows alpr near start and destination by default', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'id' => 110,
                'lat' => 45.523,
                'lon' => -122.676,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'camera:direction' => 'E',
                ],
            ]],
        ]),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.658, 45.512],
        ])),
    ]);

    $payload = directionsRequestPayload([
        'show_zone' => true,
    ]);
    unset($payload['avoid_buffer']);
    unset($payload['allow_alpr_near_start_destination']);

    $this->postJson('/api/v1/directions', $payload)
        ->assertOk()
        ->assertJsonCount(0, 'result.exclusion_zone.geometry.coordinates')
        ->assertJsonPath('result.debug_geometry.features.2.properties.allowAlprNearStartDestination', true)
        ->assertJsonPath('result.debug_geometry.features.2.properties.avoidBufferMeters', 50)
        ->assertJsonPath('result.debug_geometry.features.2.properties.endpointBufferMeters', 100)
        ->assertJsonPath('result.debug_geometry.features.2.properties.polygonCount', 2);

    $orsRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'openrouteservice'))
        ->values();

    expect($orsRequests)->toHaveCount(1)
        ->and(data_get($orsRequests[0][0]->data(), 'options.avoid_polygons'))->toBeNull();
});

it('can keep start and destination alpr inside the exclusion zone', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'id' => 111,
                'lat' => 45.523,
                'lon' => -122.676,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'camera:direction' => 'E',
                ],
            ]],
        ]),
        'https://api.heigit.org/*' => Http::sequence()
            ->push(orsDirectionsResponse([
                [-122.676, 45.523],
                [-122.658, 45.512],
            ]))
            ->push(orsDirectionsResponse([
                [-122.676, 45.523],
                [-122.658, 45.512],
            ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'allow_alpr_near_start_destination' => false,
        'show_zone' => true,
    ]))
        ->assertOk()
        ->assertJsonCount(1, 'result.exclusion_zone.geometry.coordinates')
        ->assertJsonCount(0, 'result.debug_geometry.features.2.geometry.coordinates')
        ->assertJsonPath('result.debug_geometry.features.2.properties.allowAlprNearStartDestination', false)
        ->assertJsonPath('result.debug_geometry.features.2.properties.endpointBufferMeters', 0)
        ->assertJsonPath('result.debug_geometry.features.2.properties.polygonCount', 0);

    $orsRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'openrouteservice'))
        ->values();

    expect($orsRequests)->toHaveCount(2)
        ->and(data_get($orsRequests[0][0]->data(), 'options.avoid_polygons'))->toBeNull()
        ->and(data_get($orsRequests[1][0]->data(), 'options.avoid_polygons.type'))->toBe('MultiPolygon')
        ->and(data_get($orsRequests[1][0]->data(), 'options.avoid_polygons.coordinates'))->toHaveCount(1);
});

it('passes ordered waypoints through to openrouteservice', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(['elements' => []]),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.67, 45.519],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'waypoints' => [
            ['longitude' => -122.67, 'latitude' => 45.519],
        ],
    ]))
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('result.route.coordinates.1.0', -122.67)
        ->assertJsonPath('result.route.coordinates.1.1', 45.519);

    Http::assertSent(fn ($request) => str_contains($request->url(), 'openrouteservice')
        && data_get($request->data(), 'coordinates') === [
            [-122.676, 45.523],
            [-122.67, 45.519],
            [-122.658, 45.512],
        ]);
});

it('uses canonical database nodes for route intersection counts', function () {
    config(['directions.poi_backend' => 'database']);

    createDirectionsOsmNode(300, 45.52, -122.66);
    createDirectionsOsmNode(301, 45.54, -122.66);

    Http::fake([
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.66, 45.52],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.routes.direct.fastest_route_node_count', 1)
        ->assertJsonPath('result.routes.direct.node_count', 1)
        ->assertJsonPath('result.fastest_route_node_count', 1);

    $overpassRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'overpass'))
        ->values();

    expect($overpassRequests)->toHaveCount(0);
});

it('uses canonical coordinates for route intersections when stored location is stale', function () {
    config(['directions.poi_backend' => 'database']);

    createDirectionsOsmNode(
        302,
        45.52,
        -122.66,
        storedLocation: new Point(0, 0),
    );

    Http::fake([
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.66, 45.52],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.routes.direct.fastest_route_node_count', 1)
        ->assertJsonPath('result.routes.direct.node_count', 1)
        ->assertJsonPath('result.fastest_route_node_count', 1);
});

it('rebuilds exclusions and retries when the returned route leaves the search bounds', function () {
    config(['directions.expansion_attempts' => 1]);

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'id' => 200,
                'lat' => 45.52,
                'lon' => -122.66,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'camera:direction' => 'E',
                ],
            ]],
        ]),
        'https://api.heigit.org/*' => Http::sequence()
            ->push(orsDirectionsResponse([[-122.676, 45.523], [-122.658, 45.512]]))
            ->push(orsDirectionsResponse([[0.0, 0.0], [10.0, 10.0]]))
            ->push(orsDirectionsResponse([[-122.676, 45.523], [-122.658, 45.512]])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.route.coordinates.1.0', -122.658);

    $orsRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'openrouteservice'))
        ->values();

    expect($orsRequests)->toHaveCount(3);
});

it('rejects directions beyond the configured max distance before external calls', function () {
    config(['directions.max_distance_meters' => 100]);

    Http::fake();

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertBadRequest()
        ->assertJsonPath('ok', false);

    Http::assertNothingSent();
});

it('maps ors route errors to client-safe failures', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(['elements' => []]),
        'https://api.heigit.org/*' => Http::response([
            'error' => [
                'code' => 2009,
                'message' => 'Route could not be found.',
            ],
        ], 400),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertBadRequest()
        ->assertJsonPath('ok', false)
        ->assertJsonPath('error', 'Route could not be found.');
});

it('logs when directions returns an upstream failure', function () {
    Log::spy();

    Http::fake([
        'https://api.heigit.org/*' => Http::response([
            'error' => [
                'message' => 'OpenRouteService timed out.',
            ],
        ], 504),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'profile' => [],
    ]))
        ->assertStatus(502)
        ->assertJsonPath('ok', false)
        ->assertJsonPath('error', 'OpenRouteService timed out.');

    Log::shouldHaveReceived('error')
        ->withArgs(fn (string $message, array $context): bool => $message === 'OpenRouteService directions response failed.'
            && $context['status'] === 504
            && $context['error_message'] === 'OpenRouteService timed out.')
        ->once();

    Log::shouldHaveReceived('error')
        ->withArgs(fn (string $message, array $context): bool => $message === 'Directions request returning upstream failure.'
            && $context['status'] === 502
            && $context['error'] === 'OpenRouteService timed out.')
        ->once();
});
