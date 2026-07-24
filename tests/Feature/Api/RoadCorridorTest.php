<?php

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->withoutMiddleware();

    Cache::flush();
    Http::preventStrayRequests();

    config([
        'road-corridor.overpass_url' => 'https://overpass.test/api/interpreter',
        'road-corridor.radius_meters' => 500,
        'road-corridor.maximum_radius_meters' => 2000,
        'road-corridor.cache_seconds' => 60,
        'road-corridor.connect_timeout_seconds' => 1,
        'road-corridor.timeout_seconds' => 2,
        'road-corridor.overpass_timeout_seconds' => 1,
    ]);
});

it('returns normalized drivable ways around the requested location', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [
                [
                    'type' => 'way',
                    'id' => 100,
                    'tags' => [
                        'highway' => 'primary',
                        'name' => 'Southwest Main Street',
                        'ref' => 'US 26',
                        'oneway' => 'yes',
                        'tunnel' => 'yes',
                        'layer' => '-1',
                        'maxspeed' => '35 mph',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [1001, 1002],
                ],
                [
                    'type' => 'way',
                    'id' => 200,
                    'tags' => [
                        'highway' => 'secondary',
                        'oneway' => '-1',
                        'maxspeed' => '80',
                    ],
                    'geometry' => [
                        ['lat' => 45.5232, 'lon' => -122.6758],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                        ['lat' => 45.5240, 'lon' => -122.6750],
                    ],
                    'nodes' => [1002, 1002, 2002],
                ],
                [
                    'type' => 'way',
                    'id' => 300,
                    'tags' => [
                        'highway' => 'footway',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [3001, 3002],
                ],
                [
                    'type' => 'way',
                    'id' => 400,
                    'tags' => [
                        'highway' => 'service',
                        'access' => 'private',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [4001, 4002],
                ],
                [
                    'type' => 'way',
                    'id' => 450,
                    'tags' => [
                        'highway' => 'residential',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [4501],
                ],
            ],
        ]),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676&radius_meters=750')
        ->assertOk()
        ->assertExactJson([
            'ok' => true,
            'result' => [
                'ways' => [
                    [
                        'id' => 'osm-way-100',
                        'osm_way_id' => 100,
                        'coordinates' => [
                            [-122.6762, 45.5228],
                            [-122.6758, 45.5232],
                        ],
                        'node_ids' => [1001, 1002],
                        'direction' => 'forward',
                        'name' => 'Southwest Main Street',
                        'ref' => 'US 26',
                        'road_class' => 'primary',
                        'tunnel' => true,
                        'layer' => -1,
                        'maxspeed' => '35 mph',
                        'speed_limit_mph' => 35,
                        'maxspeed_forward' => '35 mph',
                        'speed_limit_forward_mph' => 35,
                        'maxspeed_backward' => '35 mph',
                        'speed_limit_backward_mph' => 35,
                    ],
                    [
                        'id' => 'osm-way-200',
                        'osm_way_id' => 200,
                        'coordinates' => [
                            [-122.6758, 45.5232],
                            [-122.675, 45.524],
                        ],
                        'node_ids' => [1002, 2002],
                        'direction' => 'backward',
                        'name' => null,
                        'ref' => null,
                        'road_class' => 'secondary',
                        'tunnel' => false,
                        'layer' => 0,
                        'maxspeed' => '80',
                        'speed_limit_mph' => 50,
                        'maxspeed_forward' => '80',
                        'speed_limit_forward_mph' => 50,
                        'maxspeed_backward' => '80',
                        'speed_limit_backward_mph' => 50,
                    ],
                ],
            ],
        ]);

    Http::assertSent(function (Request $request): bool {
        $query = $request->data()['data'] ?? '';

        return $request->url() === 'https://overpass.test/api/interpreter'
            && str_contains($query, 'way(around:750,45.523000,-122.676000)')
            && str_contains($query, '["highway"~"^(motorway|')
            && str_contains($query, 'out body geom;');
    });
});

it('applies implied road direction defaults and caches identical lookups', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [
                [
                    'type' => 'way',
                    'id' => 500,
                    'tags' => [
                        'highway' => 'residential',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [5001, 5002],
                ],
                [
                    'type' => 'way',
                    'id' => 600,
                    'tags' => [
                        'highway' => 'motorway',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [6001, 6002],
                ],
                [
                    'type' => 'way',
                    'id' => 700,
                    'tags' => [
                        'highway' => 'tertiary',
                        'junction' => 'roundabout',
                        'oneway' => 'no',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [7001, 7002],
                ],
            ],
        ]),
    ]);

    $uri = '/api/v1/road-corridor?latitude=45.523&longitude=-122.676';

    $this->getJson($uri)
        ->assertOk()
        ->assertJsonPath('result.ways.0.direction', 'both')
        ->assertJsonPath('result.ways.1.direction', 'forward')
        ->assertJsonPath('result.ways.2.direction', 'both');

    $this->getJson($uri)->assertOk();

    Http::assertSentCount(1);
});

it('applies car-specific access and one-way overrides', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [
                [
                    'type' => 'way',
                    'id' => 800,
                    'tags' => [
                        'highway' => 'service',
                        'access' => 'private',
                        'motorcar' => 'yes',
                        'oneway' => 'yes',
                        'oneway:motor_vehicle' => 'no',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [8001, 8002],
                ],
                [
                    'type' => 'way',
                    'id' => 900,
                    'tags' => [
                        'highway' => 'residential',
                        'access' => 'yes',
                        'vehicle' => 'yes',
                        'motor_vehicle' => 'no',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [9001, 9002],
                ],
                [
                    'type' => 'way',
                    'id' => 1000,
                    'tags' => [
                        'highway' => 'service',
                        'area' => 'yes',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                        ['lat' => 45.5228, 'lon' => -122.6762],
                    ],
                    'nodes' => [10001, 10002, 10001],
                ],
            ],
        ]),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonCount(1, 'result.ways')
        ->assertJsonPath('result.ways.0.osm_way_id', 800)
        ->assertJsonPath('result.ways.0.direction', 'both');
});

it('returns effective directional speed limits for directed graph edges', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [
                [
                    'type' => 'way',
                    'id' => 1100,
                    'tags' => [
                        'highway' => 'primary',
                        'maxspeed' => '50 mph',
                        'maxspeed:forward' => '55 mph',
                        'maxspeed:backward' => '45 mph',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                    'nodes' => [11001, 11002],
                ],
                [
                    'type' => 'way',
                    'id' => 1200,
                    'tags' => [
                        'highway' => 'primary',
                        'oneway' => '-1',
                        'maxspeed:backward' => '30 mph',
                    ],
                    'geometry' => [
                        ['lat' => 45.5232, 'lon' => -122.6758],
                        ['lat' => 45.5240, 'lon' => -122.6750],
                    ],
                    'nodes' => [11002, 12002],
                ],
            ],
        ]),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonPath('result.ways.0.maxspeed', '50 mph')
        ->assertJsonPath('result.ways.0.speed_limit_mph', 50)
        ->assertJsonPath('result.ways.0.maxspeed_forward', '55 mph')
        ->assertJsonPath('result.ways.0.speed_limit_forward_mph', 55)
        ->assertJsonPath('result.ways.0.maxspeed_backward', '45 mph')
        ->assertJsonPath('result.ways.0.speed_limit_backward_mph', 45)
        ->assertJsonPath('result.ways.1.direction', 'backward')
        ->assertJsonPath('result.ways.1.maxspeed', '30 mph')
        ->assertJsonPath('result.ways.1.speed_limit_mph', 30)
        ->assertJsonPath('result.ways.1.maxspeed_forward', null)
        ->assertJsonPath('result.ways.1.speed_limit_forward_mph', null)
        ->assertJsonPath('result.ways.1.maxspeed_backward', '30 mph')
        ->assertJsonPath('result.ways.1.speed_limit_backward_mph', 30);
});

it('validates the road corridor request before contacting overpass', function (array $query, string $field) {
    Http::fake();

    $this->getJson('/api/v1/road-corridor?'.http_build_query($query))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);

    Http::assertNothingSent();
})->with([
    'missing latitude' => [['longitude' => -122.676], 'latitude'],
    'latitude above maximum' => [['latitude' => 91, 'longitude' => -122.676], 'latitude'],
    'longitude below minimum' => [['latitude' => 45.523, 'longitude' => -181], 'longitude'],
    'radius below minimum' => [['latitude' => 45.523, 'longitude' => -122.676, 'radius_meters' => 24], 'radius_meters'],
    'radius above maximum' => [['latitude' => 45.523, 'longitude' => -122.676, 'radius_meters' => 2001], 'radius_meters'],
]);

it('returns a bad gateway response when overpass fails', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(status: 503),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertStatus(502)
        ->assertExactJson([
            'ok' => false,
            'error' => 'Road corridor could not be loaded.',
        ]);

    Http::assertSentCount(2);
});

it('returns a bad gateway response when overpass cannot be reached', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::failedConnection('Connection timed out.'),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertStatus(502)
        ->assertExactJson([
            'ok' => false,
            'error' => 'Road corridor could not be loaded.',
        ]);

    Http::assertSentCount(2);
});

it('does not amplify an overpass rate limit response with an immediate retry', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(status: 429),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertStatus(502)
        ->assertExactJson([
            'ok' => false,
            'error' => 'Road corridor could not be loaded.',
        ]);

    Http::assertSentCount(1);
});

it('rejects and does not cache a malformed successful overpass response', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::sequence()
            ->push('not json', 200, ['Content-Type' => 'text/html'])
            ->push(['elements' => []]),
    ]);

    $uri = '/api/v1/road-corridor?latitude=45.523&longitude=-122.676';

    $this->getJson($uri)
        ->assertStatus(502)
        ->assertJsonPath('ok', false);

    $this->getJson($uri)
        ->assertOk()
        ->assertJsonPath('result.ways', []);

    Http::assertSentCount(2);
});
