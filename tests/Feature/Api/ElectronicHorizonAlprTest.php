<?php

use App\Models\OsmNode;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use MatanYadaev\EloquentSpatial\Objects\Point;

function createElectronicHorizonAlprNode(
    int $osmId,
    float $latitude,
    float $longitude,
    array $tags = ['surveillance:type' => 'ALPR'],
): OsmNode {
    return OsmNode::query()->create([
        'osm_id' => $osmId,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'location' => new Point($latitude, $longitude),
        'tags' => $tags,
        'surveillance_type' => $tags['surveillance:type'] ?? null,
        'direction' => $tags['direction'] ?? null,
        'camera_direction' => $tags['camera:direction'] ?? null,
        'last_synced_at' => now(),
    ]);
}

beforeEach(function () {
    $this->withoutMiddleware();

    Cache::flush();

    config([
        'electronic-horizon.alpr_cache_seconds' => 30,
        'electronic-horizon.alpr_path_buffer_meters' => 65,
        'electronic-horizon.maximum_path_length_meters' => 12_000,
    ]);
});

it('returns alpr nodes along the submitted most probable path', function () {
    $alprNode = createElectronicHorizonAlprNode(
        700,
        30.2672,
        -97.738,
        [
            'camera:direction' => 'E',
            'name' => 'Congress reader',
            'surveillance:type' => 'ALPR',
        ],
    );
    createElectronicHorizonAlprNode(701, 30.27, -97.738);
    createElectronicHorizonAlprNode(
        702,
        30.2672,
        -97.7381,
        ['surveillance:type' => 'CCTV'],
    );

    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [
            [-97.7431, 30.2672],
            [-97.7331, 30.2672],
        ],
    ])
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('result.coverage_complete', true)
        ->assertJsonCount(1, 'result.nodes')
        ->assertJsonPath('result.nodes.0.id', 'osm-node-'.$alprNode->id)
        ->assertJsonPath('result.nodes.0.osm_id', 700)
        ->assertJsonPath('result.nodes.0.coordinate', [-97.738, 30.2672])
        ->assertJsonPath('result.nodes.0.camera_direction', 'E')
        ->assertJsonPath('result.nodes.0.tags.name', 'Congress reader');
});

it('returns every ALPR node along the submitted path', function () {
    createElectronicHorizonAlprNode(710, 30.2672, -97.738);
    createElectronicHorizonAlprNode(711, 30.2672, -97.7379);

    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [
            [-97.7431, 30.2672],
            [-97.7331, 30.2672],
        ],
    ])
        ->assertOk()
        ->assertJsonPath('result.coverage_complete', true)
        ->assertJsonCount(2, 'result.nodes');
});

it('rejects malformed electronic horizon coordinates', function () {
    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [[-97.7431, 30.2672]],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['coordinates']);

    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [
            [-97.7431, 30.2672],
            [-97.7331, 91],
        ],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['coordinates.1.1']);
});

it('accepts dense most-probable path geometry', function () {
    $coordinates = array_map(
        fn (int $index): array => [-97.7431 + ($index * 0.00001), 30.2672],
        range(0, 250),
    );

    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => $coordinates,
    ])
        ->assertOk()
        ->assertJsonPath('ok', true);
});

it('rejects an electronic horizon path beyond the configured maximum', function () {
    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [
            [-97.7431, 30.2672],
            [-97.5, 30.5],
        ],
    ])
        ->assertBadRequest()
        ->assertJsonPath('ok', false)
        ->assertJsonPath('error', 'The electronic horizon path is too long.');
});

it('uses separate wider complete coverage for presence without changing warning coverage', function () {
    createElectronicHorizonAlprNode(990, 30.2685, -97.738);
    createElectronicHorizonAlprNode(991, 30.2698, -97.738);
    createElectronicHorizonAlprNode(992, 30.2726, -97.738);
    createElectronicHorizonAlprNode(993, 30.2753, -97.738);
    $coordinates = [[-97.738, 30.2672], [-97.73799, 30.2672]];
    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))->assertOk()->assertJsonCount(0, 'result.nodes');
    $this->postJson('/api/v1/electronic-horizon/alpr', ['coordinates' => $coordinates, 'presence' => true])
        ->assertOk()->assertJsonPath('result.coverage_complete', true)->assertJsonPath('result.coverage_radius_meters', 750)->assertJsonCount(3, 'result.nodes');
    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))->assertOk()->assertJsonCount(0, 'result.nodes');
});

it('reuses empty regional inventories when the path moves', function () {
    $connection = DB::connection((string) config('osm.reader.connection'));
    $connection->enableQueryLog();

    foreach ([30.2672, 30.2682] as $latitude) {
        $this->postJson('/api/v1/electronic-horizon/alpr', [
            'coordinates' => [[-97.738, $latitude], [-97.734, $latitude]],
        ])->assertOk()->assertJsonPath('result.coverage_complete', true)->assertJsonCount(0, 'result.nodes');
    }

    $queries = collect($connection->getQueryLog())->filter(
        fn (array $query): bool => str_contains($query['query'], 'select') && str_contains($query['query'], 'testing_osm_nodes'),
    );
    $connection->disableQueryLog();

    expect($queries)->toHaveCount(1);
});

it('shares candidates between nearby paths while checking each exact corridor', function () {
    createElectronicHorizonAlprNode(1100, 30.2672, -97.736);
    createElectronicHorizonAlprNode(1101, 30.2682, -97.736);
    $connection = DB::connection((string) config('osm.reader.connection'));
    $connection->enableQueryLog();

    foreach ([1100 => 30.2672, 1101 => 30.2682] as $osmId => $latitude) {
        $this->postJson('/api/v1/electronic-horizon/alpr', [
            'coordinates' => [[-97.738, $latitude], [-97.734, $latitude]],
        ])->assertOk()->assertJsonCount(1, 'result.nodes')->assertJsonPath('result.nodes.0.osm_id', $osmId);
    }

    $queries = collect($connection->getQueryLog())->filter(
        fn (array $query): bool => str_contains($query['query'], 'select') && str_contains($query['query'], 'testing_osm_nodes'),
    );
    $connection->disableQueryLog();

    expect($queries)->toHaveCount(3);
});

it('loads fresh candidates when the path enters another cache region', function () {
    createElectronicHorizonAlprNode(1105, 30.2712, -97.736);
    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [[-97.738, 30.2672], [-97.734, 30.2672]],
    ])->assertOk()->assertJsonCount(0, 'result.nodes');

    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [[-97.738, 30.2712], [-97.734, 30.2712]],
    ])->assertOk()->assertJsonCount(1, 'result.nodes')->assertJsonPath('result.nodes.0.osm_id', 1105);
});

it('retains exact path response caching inside a populated inventory', function () {
    createElectronicHorizonAlprNode(1106, 30.2672, -97.736);
    $coordinates = [[-97.738, 30.2672], [-97.734, 30.2672]];
    $connection = DB::connection((string) config('osm.reader.connection'));
    $connection->enableQueryLog();

    foreach (range(1, 2) as $attempt) {
        $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))
            ->assertOk()->assertJsonCount(1, 'result.nodes');
    }

    $queries = collect($connection->getQueryLog())->filter(
        fn (array $query): bool => str_contains($query['query'], 'select') && str_contains($query['query'], 'testing_osm_nodes'),
    );
    $connection->disableQueryLog();

    expect($queries)->toHaveCount(2);
});

it('supports disabling inventory and response caching', function () {
    config(['electronic-horizon.alpr_cache_seconds' => 0]);
    $coordinates = [[-97.738, 30.2672], [-97.734, 30.2672]];
    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))
        ->assertOk()->assertJsonCount(0, 'result.nodes');

    createElectronicHorizonAlprNode(1107, 30.2672, -97.736);
    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))
        ->assertOk()->assertJsonCount(1, 'result.nodes')->assertJsonPath('result.nodes.0.osm_id', 1107);
});

it('refreshes regional inventories after their configured lifetime', function () {
    $coordinates = [[-97.738, 30.2672], [-97.734, 30.2672]];
    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))
        ->assertOk()->assertJsonCount(0, 'result.nodes');

    createElectronicHorizonAlprNode(1102, 30.2672, -97.736);
    $this->travel(31)->seconds();

    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))
        ->assertOk()->assertJsonCount(1, 'result.nodes')->assertJsonPath('result.nodes.0.osm_id', 1102);
});

it('does not extend stale inventory coverage when caching a new path', function () {
    $this->postJson('/api/v1/electronic-horizon/alpr', [
        'coordinates' => [[-97.738, 30.2672], [-97.734, 30.2672]],
    ])->assertOk()->assertJsonCount(0, 'result.nodes');

    $this->travel(29)->seconds();
    $coordinates = [[-97.738, 30.2682], [-97.734, 30.2682]];
    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))
        ->assertOk()->assertJsonCount(0, 'result.nodes');

    createElectronicHorizonAlprNode(1103, 30.2682, -97.736);
    $this->travel(2)->seconds();
    $this->postJson('/api/v1/electronic-horizon/alpr', compact('coordinates'))
        ->assertOk()->assertJsonCount(1, 'result.nodes')->assertJsonPath('result.nodes.0.osm_id', 1103);
});

it('can use the stored geometry index for route lookups', function () {
    createElectronicHorizonAlprNode(1104, 30.2672, -97.736);
    $connection = DB::connection((string) config('osm.reader.connection'));
    $connection->statement('CREATE INDEX testing_osm_nodes_route_gist ON testing_osm_nodes USING gist (location)');
    $connection->statement('SET LOCAL enable_seqscan = off');

    $query = OsmNode::query()->nearIndexedRoute([[-97.738, 30.2672], [-97.734, 30.2672]], 65);
    $plan = $connection->select('EXPLAIN (FORMAT JSON) '.$query->toSql(), $query->getBindings());

    expect($plan[0]->{'QUERY PLAN'})
        ->toContain('testing_osm_nodes_route_gist')
        ->toContain('Index Cond');
});
