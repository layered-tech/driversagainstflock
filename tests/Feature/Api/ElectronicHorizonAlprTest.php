<?php

use App\Models\OsmNode;
use Illuminate\Support\Facades\Cache;
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
        'electronic-horizon.alpr_maximum_results' => 50,
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
        ->assertJsonCount(1, 'result.nodes')
        ->assertJsonPath('result.nodes.0.id', 'osm-node-'.$alprNode->id)
        ->assertJsonPath('result.nodes.0.osm_id', 700)
        ->assertJsonPath('result.nodes.0.coordinate', [-97.738, 30.2672])
        ->assertJsonPath('result.nodes.0.camera_direction', 'E')
        ->assertJsonPath('result.nodes.0.tags.name', 'Congress reader');
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
