<?php

use App\Console\Commands\Osm2pgsqlReplicationUpdateCommand;
use App\Models\OsmNode;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use MatanYadaev\EloquentSpatial\Objects\Point;

const TEST_OSM2PGSQL_NODE_ONE = 998000000001;
const TEST_OSM2PGSQL_NODE_TWO = 998000000002;
const TEST_OSM2PGSQL_STALE_NODE = 998000000003;
const TEST_OSM2PGSQL_BULK_START = 998000100000;

function createOsm2pgsqlImportTable(): void
{
    Schema::dropIfExists('osm2pgsql_alpr_nodes');

    DB::statement(<<<'SQL'
        CREATE TABLE osm2pgsql_alpr_nodes (
            node_id bigint primary key,
            latitude double precision not null,
            longitude double precision not null,
            geom geometry(Point, 4326),
            tags jsonb not null default '{}'::jsonb,
            surveillance_type text,
            direction text,
            camera_direction text,
            osm_updated_at timestamptz,
            osm_version integer,
            osm_changeset_id bigint,
            osm_user text,
            osm_uid bigint
        )
    SQL);
}

/**
 * @param  array<string, string>  $tags
 */
function insertOsm2pgsqlImportNode(
    int $nodeId,
    float $latitude = 43.1234567,
    float $longitude = -88.7654321,
    array $tags = ['surveillance:type' => 'ALPR', 'direction' => '270'],
    string $osmUpdatedAt = '2026-06-01 12:34:56+00',
    int $osmVersion = 7,
    int $osmChangesetId = 123456789,
    string $osmUser = 'probe-user',
    int $osmUid = 98765,
): void {
    DB::statement(
        <<<'SQL'
        INSERT INTO osm2pgsql_alpr_nodes (
            node_id,
            latitude,
            longitude,
            geom,
            tags,
            surveillance_type,
            direction,
            camera_direction,
            osm_updated_at,
            osm_version,
            osm_changeset_id,
            osm_user,
            osm_uid
        ) VALUES (?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?)
        SQL,
        [
            $nodeId,
            $latitude,
            $longitude,
            $longitude,
            $latitude,
            json_encode($tags, JSON_THROW_ON_ERROR),
            $tags['surveillance:type'] ?? null,
            $tags['direction'] ?? null,
            $tags['camera:direction'] ?? null,
            $osmUpdatedAt,
            $osmVersion,
            $osmChangesetId,
            $osmUser,
            $osmUid,
        ],
    );
}

function insertOsm2pgsqlImportNodes(int $count): void
{
    DB::statement(
        <<<'SQL'
        INSERT INTO osm2pgsql_alpr_nodes (
            node_id,
            latitude,
            longitude,
            tags,
            surveillance_type,
            direction,
            camera_direction,
            osm_updated_at,
            osm_version,
            osm_changeset_id,
            osm_user,
            osm_uid
        )
        SELECT
            ?::bigint + series,
            43.0 + (series * 0.000001),
            -88.0 - (series * 0.000001),
            jsonb_build_object('surveillance:type', 'ALPR', 'direction', '270'),
            'ALPR',
            '270',
            null,
            '2026-06-01 12:34:56+00'::timestamptz,
            7,
            123456789,
            'probe-user',
            98765
        FROM generate_series(1, ?) AS series
        SQL,
        [TEST_OSM2PGSQL_BULK_START, $count],
    );
}

/**
 * @param  array<string, string>  $tags
 */
function createOsm2pgsqlSyncedNode(
    int $nodeId,
    float $latitude = 43.0,
    float $longitude = -88.0,
    array $tags = ['surveillance:type' => 'ALPR', 'direction' => '45'],
): OsmNode {
    return OsmNode::query()->create([
        'osm_id' => $nodeId,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'location' => new Point($latitude, $longitude),
        'tags' => $tags,
        'surveillance_type' => $tags['surveillance:type'] ?? null,
        'direction' => $tags['direction'] ?? null,
        'camera_direction' => $tags['camera:direction'] ?? null,
        'sync_import_id' => 'previous-import',
        'last_synced_at' => now(),
    ]);
}

beforeEach(function () {
    Cache::flush();

    config([
        'osm2pgsql.enabled' => true,
        'osm2pgsql.import_table' => 'osm2pgsql_alpr_nodes',
        'osm2pgsql.process_timeout_seconds' => 28800,
        'osm2pgsql.sync_chunk' => 5000,
    ]);

    createOsm2pgsqlImportTable();
});

it('imports osm2pgsql ALPR rows into canonical OSM nodes', function () {
    insertOsm2pgsqlImportNode(TEST_OSM2PGSQL_NODE_ONE, tags: [
        'surveillance:type' => 'ALPR',
        'direction' => '270',
        'operator' => 'Village agency',
    ]);

    $this->artisan('app:osm2pgsql:sync-nodes')
        ->assertExitCode(Command::SUCCESS);

    $node = OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_NODE_ONE)->firstOrFail();

    expect((float) $node->latitude)->toBe(43.1234567)
        ->and((float) $node->longitude)->toBe(-88.7654321)
        ->and((float) $node->location->latitude)->toBe(43.1234567)
        ->and((float) $node->location->longitude)->toBe(-88.7654321)
        ->and($node->tags)->toMatchArray([
            'surveillance:type' => 'ALPR',
            'direction' => '270',
            'operator' => 'Village agency',
        ])
        ->and($node->surveillance_type)->toBe('ALPR')
        ->and($node->direction)->toBe('270')
        ->and($node->osm_updated_at?->toJSON())->toBe('2026-06-01T12:34:56.000000Z')
        ->and($node->osm_version)->toBe(7)
        ->and($node->osm_changeset_id)->toBe(123456789)
        ->and($node->osm_user)->toBe('probe-user')
        ->and($node->osm_uid)->toBe(98765)
        ->and($node->sync_import_id)->toBeString()
        ->and($node->last_synced_at)->not->toBeNull();
});

it('updates existing nodes without duplicates', function () {
    $existingNode = createOsm2pgsqlSyncedNode(TEST_OSM2PGSQL_NODE_TWO);
    $existingNodeId = $existingNode->id;

    insertOsm2pgsqlImportNode(
        TEST_OSM2PGSQL_NODE_TWO,
        latitude: 43.2222222,
        longitude: -88.3333333,
        tags: [
            'surveillance:type' => 'ALPR',
            'camera:direction' => '135',
            'operator' => 'Updated agency',
        ],
    );

    $this->artisan('app:osm2pgsql:sync-nodes')
        ->assertExitCode(Command::SUCCESS);

    $node = OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_NODE_TWO)->firstOrFail();

    expect(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_NODE_TWO)->count())->toBe(1)
        ->and($node->id)->toBe($existingNodeId)
        ->and((float) $node->latitude)->toBe(43.2222222)
        ->and((float) $node->longitude)->toBe(-88.3333333)
        ->and($node->tags['operator'])->toBe('Updated agency')
        ->and($node->camera_direction)->toBe('135');
});

it('splits large upserts below the PostgreSQL parameter limit', function () {
    insertOsm2pgsqlImportNodes(3700);

    $this->artisan('app:osm2pgsql:sync-nodes', ['--chunk' => 3700])
        ->assertExitCode(Command::SUCCESS);

    expect(
        OsmNode::query()
            ->whereBetween('osm_id', [TEST_OSM2PGSQL_BULK_START + 1, TEST_OSM2PGSQL_BULK_START + 3700])
            ->count(),
    )->toBe(3700);
});

it('prints chunk progress by default', function () {
    insertOsm2pgsqlImportNode(TEST_OSM2PGSQL_NODE_ONE);
    insertOsm2pgsqlImportNode(TEST_OSM2PGSQL_NODE_TWO);

    $this->artisan('app:osm2pgsql:sync-nodes --chunk=1')
        ->expectsOutputToContain('Starting osm2pgsql node sync from osm2pgsql_alpr_nodes using 1 row chunks.')
        ->expectsOutputToContain('Processing osm2pgsql import chunk 1: 1 rows, 1 valid elements.')
        ->expectsOutputToContain('Finished osm2pgsql import chunk 1: 1 synced (1 created, 0 updated).')
        ->expectsOutputToContain('Processing osm2pgsql import chunk 2: 1 rows, 1 valid elements.')
        ->expectsOutputToContain('Finished osm2pgsql import chunk 2: 1 synced (1 created, 0 updated).')
        ->expectsOutputToContain('Reconciling stale osm2pgsql nodes.')
        ->assertExitCode(Command::SUCCESS);
});

it('hides chunk progress when quiet', function () {
    insertOsm2pgsqlImportNode(TEST_OSM2PGSQL_NODE_ONE);

    $this->artisan('app:osm2pgsql:sync-nodes -q')
        ->doesntExpectOutputToContain('Processing osm2pgsql import chunk')
        ->assertExitCode(Command::SUCCESS);
});

it('deletes stale nodes after a successful sync', function () {
    createOsm2pgsqlSyncedNode(TEST_OSM2PGSQL_STALE_NODE);
    insertOsm2pgsqlImportNode(TEST_OSM2PGSQL_NODE_ONE);

    $this->artisan('app:osm2pgsql:sync-nodes')
        ->assertExitCode(Command::SUCCESS);

    expect(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_STALE_NODE)->exists())->toBeFalse()
        ->and(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_NODE_ONE)->exists())->toBeTrue();
});

it('refuses to reconcile when the import table is empty', function () {
    createOsm2pgsqlSyncedNode(TEST_OSM2PGSQL_STALE_NODE);

    $this->artisan('app:osm2pgsql:sync-nodes')
        ->assertExitCode(Command::FAILURE);

    expect(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_STALE_NODE)->exists())->toBeTrue();
});

it('allows an empty-table reconcile when explicitly requested', function () {
    createOsm2pgsqlSyncedNode(TEST_OSM2PGSQL_STALE_NODE);

    $this->artisan('app:osm2pgsql:sync-nodes', ['--allow-empty-reconcile' => true])
        ->assertExitCode(Command::SUCCESS);

    expect(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_STALE_NODE)->exists())->toBeFalse();
});

it('skips syncing when another osm2pgsql operation has the lock', function () {
    insertOsm2pgsqlImportNode(TEST_OSM2PGSQL_NODE_ONE);

    $lock = Cache::lock(Osm2pgsqlReplicationUpdateCommand::OPERATION_LOCK_KEY, 60);
    $lock->get();

    try {
        $this->artisan('app:osm2pgsql:sync-nodes')
            ->assertExitCode(Command::SUCCESS);

        expect(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_NODE_ONE)->exists())->toBeFalse();
    } finally {
        $lock->release();
    }
});
