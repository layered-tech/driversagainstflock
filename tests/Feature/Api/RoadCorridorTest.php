<?php

use Illuminate\Contracts\Cache\Lock;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * @param  list<array<string, mixed>>  $ways
 * @return list<array<string, mixed>>
 */
function compactOverpassElements(array $ways): array
{
    $nodesById = [];

    foreach ($ways as &$way) {
        $geometry = is_array($way['geometry'] ?? null) ? $way['geometry'] : [];
        $nodeIds = is_array($way['nodes'] ?? null) ? $way['nodes'] : [];

        unset($way['geometry']);

        foreach ($nodeIds as $index => $nodeId) {
            $point = $geometry[$index] ?? null;

            if (
                ! is_array($point)
                || ! is_numeric($nodeId)
                || ! is_numeric($point['lat'] ?? null)
                || ! is_numeric($point['lon'] ?? null)
            ) {
                continue;
            }

            $nodesById[(int) $nodeId] ??= [
                'type' => 'node',
                'id' => (int) $nodeId,
                'lat' => (float) $point['lat'],
                'lon' => (float) $point['lon'],
            ];
        }
    }
    unset($way);

    return [...$ways, ...array_values($nodesById)];
}

beforeEach(function () {
    $this->withoutMiddleware();

    Cache::flush();
    Http::preventStrayRequests();

    config([
        'road-corridor.overpass_url' => 'https://overpass.test/api/interpreter',
        'road-corridor.radius_meters' => 3200,
        'road-corridor.maximum_radius_meters' => 4000,
        'road-corridor.cache_grid_meters' => 500,
        'road-corridor.failure_cache_seconds' => 15,
        'road-corridor.lock_seconds' => 25,
        'road-corridor.lock_wait_seconds' => 20,
        'road-corridor.connect_timeout_seconds' => 4,
        'road-corridor.timeout_seconds' => 18,
        'road-corridor.overpass_timeout_seconds' => 15,
    ]);
});

it('returns normalized drivable ways around the requested location', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => compactOverpassElements([
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
            ]),
        ]),
    ]);

    $uri = '/api/v1/road-corridor?latitude=45.523&longitude=-122.676&radius_meters=750';
    $expectedResponse = [
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
                    'is_roundabout' => false,
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
                    'is_roundabout' => false,
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
    ];

    $this->getJson($uri)
        ->assertOk()
        ->assertExactJson($expectedResponse);

    $this->getJson($uri)
        ->assertOk()
        ->assertExactJson($expectedResponse);

    Http::assertSent(function (Request $request): bool {
        $query = $request->data()['data'] ?? '';

        return $request->url() === 'https://overpass.test/api/interpreter'
            && str_contains($query, 'way(around:1291,')
            && str_contains($query, '["highway"~"^(motorway|')
            && str_contains($query, 'out body qt;>;out skel qt;')
            && ! str_contains($query, 'geom');
    });
    Http::assertSentCount(1);
});

it('reconstructs compact way geometry by OSM node id regardless of element order', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [
                ['type' => 'node', 'id' => 2002, 'lat' => 45.5232, 'lon' => -122.6758],
                [
                    'type' => 'way',
                    'id' => 2100,
                    'nodes' => [2001, 2002],
                    'tags' => ['highway' => 'primary'],
                ],
                ['type' => 'node', 'id' => 2001, 'lat' => 45.5228, 'lon' => -122.6762],
                [
                    'type' => 'way',
                    'id' => 2200,
                    'nodes' => [2002, 2003],
                    'tags' => ['highway' => 'secondary'],
                ],
                ['type' => 'node', 'id' => 2003, 'lat' => 45.524, 'lon' => -122.675],
            ],
        ]),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonPath('result.ways.0.node_ids', [2001, 2002])
        ->assertJsonPath('result.ways.0.coordinates', [
            [-122.6762, 45.5228],
            [-122.6758, 45.5232],
        ])
        ->assertJsonPath('result.ways.1.node_ids', [2002, 2003])
        ->assertJsonPath('result.ways.1.coordinates.0', [-122.6758, 45.5232]);
});

it('rejects a way when any referenced OSM node is missing', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [
                [
                    'type' => 'way',
                    'id' => 2300,
                    'nodes' => [2301, 2399],
                    'tags' => ['highway' => 'primary'],
                ],
                [
                    'type' => 'way',
                    'id' => 2400,
                    'nodes' => [2301, 2402],
                    'tags' => ['highway' => 'secondary'],
                ],
                ['type' => 'node', 'id' => 2301, 'lat' => 45.5228, 'lon' => -122.6762],
                ['type' => 'node', 'id' => 2402, 'lat' => 45.5232, 'lon' => -122.6758],
            ],
        ]),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonCount(1, 'result.ways')
        ->assertJsonPath('result.ways.0.osm_way_id', 2400)
        ->assertJsonPath('result.ways.0.node_ids', [2301, 2402]);
});

it('applies implied road direction defaults and caches identical lookups', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => compactOverpassElements([
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
            ]),
        ]),
    ]);

    $uri = '/api/v1/road-corridor?latitude=45.523&longitude=-122.676';

    $this->getJson($uri)
        ->assertOk()
        ->assertJsonPath('result.ways.0.direction', 'both')
        ->assertJsonPath('result.ways.0.is_roundabout', false)
        ->assertJsonPath('result.ways.1.direction', 'forward')
        ->assertJsonPath('result.ways.1.is_roundabout', false)
        ->assertJsonPath('result.ways.2.direction', 'both')
        ->assertJsonPath('result.ways.2.is_roundabout', true);

    $this->getJson($uri)->assertOk();

    Http::assertSentCount(1);
});

it('serves a persisted corridor without revalidating it through overpass', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => compactOverpassElements([
                [
                    'type' => 'way',
                    'id' => 2500,
                    'nodes' => [2501, 2502],
                    'tags' => ['highway' => 'primary', 'name' => 'Cached Road'],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                ],
            ]),
        ]),
    ]);

    $uri = '/api/v1/road-corridor?latitude=45.523&longitude=-122.676';

    $this->getJson($uri)
        ->assertOk()
        ->assertJsonPath('result.ways.0.osm_way_id', 2500);

    expect(DB::table('road_corridor_caches')->count())->toBe(1)
        ->and(DB::table('road_corridor_caches')->value('fetched_at'))->not->toBeNull();

    $this->getJson($uri)
        ->assertOk()
        ->assertJsonPath('result.ways.0.osm_way_id', 2500);

    Http::assertSentCount(1);
});

it('serves a persisted corridor to nearby requests', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => compactOverpassElements([
                [
                    'type' => 'way',
                    'id' => 2700,
                    'nodes' => [2701, 2702],
                    'tags' => ['highway' => 'primary'],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                ],
            ]),
        ]),
    ]);

    $uri = '/api/v1/road-corridor?latitude=45.523&longitude=-122.676&radius_meters=2000';

    $this->getJson($uri)
        ->assertOk()
        ->assertJsonPath('result.ways.0.osm_way_id', 2700);

    $this->getJson('/api/v1/road-corridor?latitude=45.5231&longitude=-122.6761&radius_meters=2000')
        ->assertOk()
        ->assertJsonPath('result.ways.0.osm_way_id', 2700);

    Http::assertSentCount(1);
});

it('shares a default corridor cache entry across its request radius', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => compactOverpassElements([
                [
                    'type' => 'way',
                    'id' => 2800,
                    'nodes' => [2801, 2802],
                    'tags' => ['highway' => 'primary'],
                    'geometry' => [
                        ['lat' => 43.1048, 'lon' => -88.3142],
                        ['lat' => 43.1052, 'lon' => -88.3020],
                    ],
                ],
            ]),
        ]),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=43.105&longitude=-88.314&radius_meters=3200')
        ->assertOk()
        ->assertJsonPath('result.ways.0.osm_way_id', 2800);

    $this->getJson('/api/v1/road-corridor?latitude=43.105&longitude=-88.302&radius_meters=3200')
        ->assertOk()
        ->assertJsonPath('result.ways.0.osm_way_id', 2800);

    expect(DB::table('road_corridor_caches')->count())->toBe(1);
    Http::assertSentCount(1);
});

it('serves an empty persisted corridor to nearby requests in the same cache cell', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [],
        ]),
    ]);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676&radius_meters=2000')
        ->assertOk();

    $this->getJson('/api/v1/road-corridor?latitude=45.5231&longitude=-122.6761&radius_meters=2000')
        ->assertOk();

    Http::assertSentCount(1);
    Http::assertSent(function (Request $request): bool {
        $query = $request->data()['data'] ?? '';

        return str_contains($query, 'way(around:3443,')
            && ! str_contains($query, '45.523000,-122.676000');
    });
});

it('buffers spatial cache cells across geographic edge cases', function (float $latitude, float $longitude) {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [],
        ]),
    ]);

    $requestedRadiusMeters = 3200;

    $this->getJson('/api/v1/road-corridor?'.http_build_query([
        'latitude' => $latitude,
        'longitude' => $longitude,
        'radius_meters' => $requestedRadiusMeters,
    ]))->assertOk();

    Http::assertSent(function (Request $request) use ($latitude, $longitude, $requestedRadiusMeters): bool {
        $query = $request->data()['data'] ?? '';

        if (! preg_match('/way\(around:(\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/', $query, $matches)) {
            return false;
        }

        $queryRadiusMeters = (int) $matches[1];
        $queryLatitude = (float) $matches[2];
        $queryLongitude = (float) $matches[3];
        $latitudeDelta = deg2rad($queryLatitude - $latitude);
        $longitudeDelta = deg2rad(fmod(($queryLongitude - $longitude) + 540, 360) - 180);
        $firstLatitude = deg2rad($latitude);
        $secondLatitude = deg2rad($queryLatitude);
        $haversine = sin($latitudeDelta / 2) ** 2
            + cos($firstLatitude) * cos($secondLatitude) * sin($longitudeDelta / 2) ** 2;
        $distanceToCellCenterMeters = 6371000 * 2 * atan2(sqrt($haversine), sqrt(1 - $haversine));

        return $distanceToCellCenterMeters + $requestedRadiusMeters <= $queryRadiusMeters + 1;
    });
})->with([
    'cell corner' => [45.52498, -122.67898],
    'east of dateline' => [12.34567, 179.9999],
    'west of dateline' => [-12.34567, -179.9999],
    'high latitude' => [84.12345, 42.98765],
]);

it('applies car-specific access and one-way overrides', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => compactOverpassElements([
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
            ]),
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
            'elements' => compactOverpassElements([
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
            ]),
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
    'radius above maximum' => [['latitude' => 45.523, 'longitude' => -122.676, 'radius_meters' => 4001], 'radius_meters'],
]);

it('returns unavailable while a road corridor import holds the cache lock', function () {
    Http::fake();
    $lock = Mockery::mock(Lock::class);

    $lock->shouldReceive('block')
        ->once()
        ->with(20, Mockery::type(Closure::class))
        ->andThrow(new LockTimeoutException);
    Cache::shouldReceive('lock')->once()->andReturn($lock);

    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertStatus(502)
        ->assertExactJson([
            'ok' => false,
            'error' => 'Road corridor could not be loaded.',
        ]);

    Http::assertNothingSent();
});

it('uses a persisted corridor when the cache lock times out', function () {
    Http::fake();
    $lock = Mockery::mock(Lock::class);
    $lockKey = null;

    $lock->shouldReceive('block')
        ->once()
        ->with(20, Mockery::type(Closure::class))
        ->andReturnUsing(function () use (&$lockKey): void {
            $now = now();
            $cacheKey = substr((string) $lockKey, 0, -strlen(':lock'));

            DB::table('road_corridor_caches')->insert([
                'cache_key' => $cacheKey,
                'ways' => json_encode([], JSON_THROW_ON_ERROR),
                'fetched_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            throw new LockTimeoutException;
        });
    Cache::shouldReceive('lock')
        ->once()
        ->andReturnUsing(function (string $cacheKey, int $seconds) use ($lock, &$lockKey): Lock {
            $lockKey = $cacheKey;

            return $lock;
        });
    $this->getJson('/api/v1/road-corridor?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonPath('result.ways', []);

    Http::assertNothingSent();
});

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

    Http::assertSentCount(1);
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

    Http::assertSentCount(1);
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

it('rejects malformed responses and briefly coalesces repeated failures', function () {
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
        ->assertStatus(502)
        ->assertJsonPath('ok', false);

    Http::assertSentCount(1);

    $this->travel(16)->seconds();

    $this->getJson($uri)
        ->assertOk()
        ->assertJsonPath('result.ways', []);

    Http::assertSentCount(2);
});
