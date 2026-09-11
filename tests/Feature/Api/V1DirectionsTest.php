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

function graphHopperDirectionsResponse(array $coordinates): array
{
    return [
        'paths' => [[
            'distance' => 1234.5,
            'time' => 321000,
            'points' => [
                'type' => 'LineString',
                'coordinates' => $coordinates,
            ],
            'instructions' => [[
                'text' => 'Head east',
                'street_name' => 'Main Street',
                'distance' => 1234.5,
                'time' => 321000,
                'interval' => [0, count($coordinates) - 1],
                'sign' => 0,
            ]],
        ]],
    ];
}

/**
 * @return array{south: float, west: float, north: float, east: float}
 */
function overpassBoundsFromQuery(string $query): array
{
    $matched = preg_match(
        '/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\);/',
        $query,
        $matches,
    );

    if ($matched !== 1) {
        throw new RuntimeException('Overpass query did not contain bounds.');
    }

    return [
        'south' => (float) $matches[1],
        'west' => (float) $matches[2],
        'north' => (float) $matches[3],
        'east' => (float) $matches[4],
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
        'directions.provider' => 'openrouteservice',
        'directions.poi_backend' => 'overpass',
        'directions.scorecard_camera_range_meters' => 50,
        'directions.overpass_url' => 'https://overpass.test/api/interpreter',
        'directions.graphhopper.circuit_breaker.store' => 'array',
        'directions.graphhopper.circuit_breaker.failure_threshold' => 3,
        'directions.graphhopper.circuit_breaker.failure_window_seconds' => 60,
        'directions.graphhopper.circuit_breaker.cooldown_seconds' => 60,
        'services.graphhopper.url' => 'http://graphhopper.test:8080',
        'services.graphhopper.token' => 'test-graphhopper-token',
        'services.graphhopper.profile' => 'car',
        'services.graphhopper.connect_timeout_seconds' => 3,
        'services.graphhopper.timeout_seconds' => 45,
        'services.graphhopper.route_timeout_milliseconds' => 40000,
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
                    'name' => 'Main Street reader',
                    'operator' => 'City agency',
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
        ->assertJsonPath('result.routes.direct.scored_node_count', 1)
        ->assertJsonPath('result.routes.direct.camera_coverage_complete', true)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.osm_id', 100)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.direction_known', true)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.directions.0.start', 90)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.route_progress_fraction', fn (mixed $value): bool => is_numeric($value) && $value > 0 && $value < 1)
        ->assertJsonPath('result.routes.direct.monitoring_camera_nodes.0.osm_id', 100)
        ->assertJsonPath('result.routes.direct.monitoring_camera_nodes.0.coordinate', [-122.66, 45.52])
        ->assertJsonPath('result.routes.direct.monitoring_camera_nodes.0.direction_known', true)
        ->assertJsonPath('result.routes.direct.monitoring_camera_nodes.0.directions.0.start', 90)
        ->assertJsonPath('result.routes.direct.monitoring_camera_nodes.0.name', 'Main Street reader')
        ->assertJsonPath('result.routes.direct.monitoring_camera_nodes.0.operator', 'City agency')
        ->assertJsonPath('result.routes.ideal.monitoring_camera_nodes.0.osm_id', 100)
        ->assertJsonPath('result.avoidance_search_complete', true)
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

it('uses GraphHopper as primary without changing the public directions payload', function () {
    config(['directions.provider' => 'graphhopper']);

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(['elements' => []]),
        'http://graphhopper.test:8080/route' => Http::response(graphHopperDirectionsResponse([
            [-122.676, 45.523],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('result.route.distance', 1234.5)
        ->assertJsonPath('result.route.duration', 321)
        ->assertJsonPath('result.route.maneuvers.0.instruction', 'Head east')
        ->assertJsonPath('result.route.maneuvers.0.type', 11)
        ->assertJsonPath('result.route.maneuvers.0.way_points', [0, 1])
        ->assertJsonStructure([
            'result' => [
                'route' => ['coordinates', 'distance', 'duration', 'maneuvers'],
                'routes' => [
                    'direct' => ['coordinates', 'distance', 'duration', 'maneuvers'],
                    'ideal' => ['coordinates', 'distance', 'duration', 'maneuvers'],
                ],
            ],
        ]);

    $requests = collect(Http::recorded());

    expect($requests->filter(fn (array $record) => str_contains($record[0]->url(), 'graphhopper.test')))
        ->toHaveCount(1)
        ->and($requests->filter(fn (array $record) => str_contains($record[0]->url(), 'openrouteservice')))
        ->toHaveCount(0)
        ->and($requests->filter(fn (array $record) => str_contains($record[0]->url(), 'overpass.test')))
        ->toHaveCount(1);
});

it('restarts the complete calculation through ORS after a GraphHopper failure', function () {
    config(['directions.provider' => 'graphhopper']);

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'id' => 120,
                'lat' => 45.52,
                'lon' => -122.66,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'camera:direction' => 'E',
                ],
            ]],
        ]),
        'http://graphhopper.test:8080/route' => Http::sequence()
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.66, 45.52],
                [-122.658, 45.512],
            ]))
            ->whenEmpty(Http::response(['message' => 'Unavailable'], 503)),
        'https://api.heigit.org/*' => Http::sequence()
            ->push(orsDirectionsResponse([
                [-122.676, 45.523],
                [-122.66, 45.52],
                [-122.658, 45.512],
            ]))
            ->push(orsDirectionsResponse([
                [-122.676, 45.523],
                [-122.67, 45.515],
                [-122.658, 45.512],
            ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.routes.direct.coordinates.1.0', -122.66)
        ->assertJsonPath('result.route.coordinates.1.0', -122.67);

    $requests = collect(Http::recorded());

    expect($requests->filter(fn (array $record) => str_contains($record[0]->url(), 'graphhopper.test'))->count())
        ->toBeGreaterThan(1)
        ->and($requests->filter(fn (array $record) => str_contains($record[0]->url(), 'openrouteservice')))
        ->toHaveCount(2);
});

it('uses ORS without probing GraphHopper while the circuit breaker is open', function () {
    config([
        'directions.provider' => 'graphhopper',
        'directions.graphhopper.circuit_breaker.failure_threshold' => 1,
    ]);

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(['elements' => []]),
        'http://graphhopper.test:8080/route' => Http::response(['message' => 'Unavailable'], 503),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())->assertOk();
    $this->postJson('/api/v1/directions', directionsRequestPayload())->assertOk();

    $requests = collect(Http::recorded());

    expect($requests->filter(fn (array $record) => str_contains($record[0]->url(), 'graphhopper.test')))
        ->toHaveCount(3)
        ->and($requests->filter(fn (array $record) => str_contains($record[0]->url(), 'openrouteservice')))
        ->toHaveCount(2);
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

it('scores the full fifty meter camera cone independently of the routing buffer', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'id' => 105,
                'lat' => 0,
                'lon' => 0,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'camera:direction' => 'E',
                ],
            ]],
        ]),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [0.00036, -0.001],
            [0.00036, 0.001],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'avoid_buffer' => 35,
        'start' => ['longitude' => 0.00036, 'latitude' => -0.001],
        'end' => ['longitude' => 0.00036, 'latitude' => 0.001],
    ]))
        ->assertOk()
        ->assertJsonPath('result.routes.direct.node_count', 1)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.osm_id', 105);
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

it('accumulates newly encountered database POIs across reroutes', function () {
    config([
        'directions.provider' => 'graphhopper',
        'directions.poi_backend' => 'database',
        'directions.expansion_attempts' => 3,
    ]);

    createDirectionsOsmNode(400, 45.5175, -122.667);
    createDirectionsOsmNode(401, 45.528, -122.667);

    Http::fake([
        'http://graphhopper.test:8080/route' => Http::sequence()
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.5175],
                [-122.658, 45.512],
            ]))
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.528],
                [-122.658, 45.512],
            ]))
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.507],
                [-122.658, 45.512],
            ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.routes.direct.fastest_route_node_count', 1)
        ->assertJsonPath('result.route.coordinates.1.1', 45.507);

    $graphHopperRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'graphhopper.test'))
        ->values();

    expect($graphHopperRequests)->toHaveCount(3)
        ->and(data_get($graphHopperRequests[0][0]->data(), 'custom_model'))->toBeNull()
        ->and(data_get($graphHopperRequests[1][0]->data(), 'custom_model.areas.features'))->toHaveCount(1)
        ->and(data_get($graphHopperRequests[2][0]->data(), 'custom_model.areas.features'))->toHaveCount(2);
});

it('loads camera inventory for the final route when avoidance attempts are exhausted', function () {
    config([
        'directions.provider' => 'graphhopper',
        'directions.poi_backend' => 'database',
        'directions.expansion_attempts' => 1,
    ]);

    createDirectionsOsmNode(410, 45.5175, -122.667, ['surveillance:type' => 'ALPR']);
    createDirectionsOsmNode(411, 45.528, -122.667, ['surveillance:type' => 'ALPR']);
    createDirectionsOsmNode(412, 45.507, -122.667, ['surveillance:type' => 'ALPR']);

    Http::fake([
        'http://graphhopper.test:8080/route' => Http::sequence()
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.5175],
                [-122.658, 45.512],
            ]))
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.528],
                [-122.658, 45.512],
            ]))
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.507],
                [-122.658, 45.512],
            ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.avoidance_search_complete', false)
        ->assertJsonPath('result.routes.direct.camera_coverage_complete', true)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.osm_id', 410)
        ->assertJsonPath('result.routes.ideal.camera_coverage_complete', true)
        ->assertJsonPath('result.routes.ideal.camera_candidates.0.osm_id', 412)
        ->assertJsonPath('result.routes.ideal.monitoring_camera_nodes.0.osm_id', 412);
});

it('queries only the unresolved final private geometry after exhausting overpass avoidance attempts', function () {
    config([
        'directions.provider' => 'graphhopper',
        'directions.poi_backend' => 'overpass',
        'directions.expansion_attempts' => 0,
    ]);

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::sequence()
            ->push(['elements' => [[
                'id' => 510,
                'lat' => 45.5175,
                'lon' => -122.667,
                'tags' => ['surveillance:type' => 'ALPR'],
            ]]])
            ->push(['elements' => [[
                'id' => 511,
                'lat' => 45.528,
                'lon' => -122.667,
                'tags' => ['surveillance:type' => 'ALPR'],
            ]]]),
        'http://graphhopper.test:8080/route' => Http::sequence()
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.5175],
                [-122.658, 45.512],
            ]))
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.528],
                [-122.658, 45.512],
            ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.avoidance_search_complete', false)
        ->assertJsonPath('result.routes.direct.camera_coverage_complete', true)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.osm_id', 510)
        ->assertJsonPath('result.routes.ideal.camera_coverage_complete', true)
        ->assertJsonPath('result.routes.ideal.camera_candidates.0.osm_id', 511);

    $overpassRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'overpass.test'))
        ->values();
    $directBounds = overpassBoundsFromQuery($overpassRequests[0][0]->data()['data']);
    $idealBounds = overpassBoundsFromQuery($overpassRequests[1][0]->data()['data']);

    expect($overpassRequests)->toHaveCount(2)
        ->and($idealBounds)->not->toBe($directBounds)
        ->and($idealBounds['south'])->toBeLessThanOrEqual(45.528)
        ->and($idealBounds['north'])->toBeGreaterThanOrEqual(45.528)
        ->and($idealBounds['west'])->toBeLessThanOrEqual(-122.667)
        ->and($idealBounds['east'])->toBeGreaterThanOrEqual(-122.667);
});

it('retains known private candidates with incomplete coverage when its final refresh fails', function () {
    config([
        'directions.provider' => 'graphhopper',
        'directions.poi_backend' => 'overpass',
        'directions.expansion_attempts' => 0,
    ]);

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::sequence()
            ->push(['elements' => [
                [
                    'id' => 520,
                    'lat' => 45.5175,
                    'lon' => -122.667,
                    'tags' => ['surveillance:type' => 'ALPR'],
                ],
                [
                    'id' => 521,
                    'lat' => 45.519,
                    'lon' => -122.667,
                    'tags' => ['surveillance:type' => 'ALPR'],
                ],
            ]])
            ->push(['error' => 'Unavailable'], 503),
        'http://graphhopper.test:8080/route' => Http::sequence()
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.5175],
                [-122.658, 45.512],
            ]))
            ->push(graphHopperDirectionsResponse([
                [-122.676, 45.523],
                [-122.667, 45.519],
                [-122.658, 45.512],
            ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.avoidance_search_complete', false)
        ->assertJsonPath('result.routes.direct.camera_coverage_complete', true)
        ->assertJsonPath('result.routes.direct.camera_candidates.0.osm_id', 520)
        ->assertJsonPath('result.routes.ideal.camera_coverage_complete', false)
        ->assertJsonPath('result.routes.ideal.camera_candidates.0.osm_id', 521);

    $overpassRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'overpass.test'));

    expect($overpassRequests)->toHaveCount(2);
});

it('keeps id-less cameras monitoring-only and discloses incomplete scoring coverage', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'lat' => 45.52,
                'lon' => -122.66,
                'tags' => ['surveillance:type' => 'ALPR'],
            ]],
        ]),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.66, 45.52],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload())
        ->assertOk()
        ->assertJsonPath('result.routes.direct.camera_coverage_complete', false)
        ->assertJsonCount(0, 'result.routes.direct.camera_candidates')
        ->assertJsonPath('result.routes.direct.monitoring_camera_nodes.0.osm_id', null)
        ->assertJsonPath('result.routes.direct.node_count', 1)
        ->assertJsonPath('result.routes.direct.scored_node_count', 0);
});

it('returns routes with incomplete coverage when the final inventory refresh fails', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::sequence()
            ->push(['elements' => []])
            ->push(['error' => 'Unavailable'], 503),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'avoid_buffer' => 35,
    ]))
        ->assertOk()
        ->assertJsonPath('result.avoidance_search_complete', true)
        ->assertJsonPath('result.routes.direct.camera_coverage_complete', false)
        ->assertJsonPath('result.routes.ideal.camera_coverage_complete', false)
        ->assertJsonCount(0, 'result.routes.direct.monitoring_camera_nodes');
});

it('does not certify incomplete successful overpass responses', function (mixed $incompleteResponse) {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::sequence()
            ->push(['elements' => []])
            ->push($incompleteResponse),
        'https://api.heigit.org/*' => Http::response(orsDirectionsResponse([
            [-122.676, 45.523],
            [-122.658, 45.512],
        ])),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'avoid_buffer' => 35,
    ]))
        ->assertOk()
        ->assertJsonPath('result.avoidance_search_complete', true)
        ->assertJsonPath('result.routes.direct.camera_coverage_complete', false)
        ->assertJsonPath('result.routes.ideal.camera_coverage_complete', false)
        ->assertJsonCount(0, 'result.routes.direct.camera_candidates');

    $overpassRequests = collect(Http::recorded())
        ->filter(fn (array $record) => str_contains($record[0]->url(), 'overpass.test'));

    expect($overpassRequests)->toHaveCount(2);
})->with([
    'runtime remark' => [[
        'elements' => [],
        'remark' => 'runtime error: query timed out',
    ]],
    'missing elements' => [['version' => 0.6]],
    'malformed json' => ['not-json'],
    'malformed element' => [['elements' => [['id' => 530]]]],
]);

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

it('maps ors connection failures to client-safe upstream failures', function () {
    Http::fake([
        'https://api.heigit.org/*' => Http::failedConnection('Connection timed out.'),
    ]);

    $this->postJson('/api/v1/directions', directionsRequestPayload([
        'profile' => [],
    ]))
        ->assertStatus(502)
        ->assertJsonPath('ok', false)
        ->assertJsonPath('error', 'OpenRouteService could not be reached.');
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
