<?php

use App\Console\Commands\Osm2pgsqlReplicationUpdateCommand;
use App\Models\OsmNode;
use Illuminate\Console\Command;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
use MatanYadaev\EloquentSpatial\Objects\Point;

const TEST_OSM2PGSQL_REPLICATION_NODE_ONE = 998100000001;
const TEST_OSM2PGSQL_REPLICATION_NODE_TWO = 998100000002;
const TEST_OSM2PGSQL_REPLICATION_STALE_NODE = 998100000003;

function createOsm2pgsqlReplicationImportTable(): void
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
function insertOsm2pgsqlReplicationImportNode(
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

/**
 * @param  array<string, string>  $tags
 */
function createOsm2pgsqlReplicationSyncedNode(
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
        'last_synced_at' => now()->subHour(),
    ]);
}

beforeEach(function () {
    Cache::flush();

    config([
        'osm2pgsql.enabled' => true,
        'osm2pgsql.database' => 'driversagainstflock',
        'osm2pgsql.replication_binary' => 'osm2pgsql-replication',
        'osm2pgsql.style' => 'database/osm2pgsql/alpr.lua',
        'osm2pgsql.flat_nodes' => null,
        'osm2pgsql.process_timeout_seconds' => 28800,
        'database.connections.pgsql.host' => '127.0.0.1',
        'database.connections.pgsql.port' => '5432',
        'database.connections.pgsql.username' => 'postgres',
        'database.connections.pgsql.password' => 'secret',
    ]);

    createOsm2pgsqlReplicationImportTable();
});

it('runs osm2pgsql replication update with flex append arguments', function () {
    insertOsm2pgsqlReplicationImportNode(TEST_OSM2PGSQL_REPLICATION_NODE_ONE);

    Process::fake([
        '*' => Process::result(),
    ]);

    $this->artisan('app:osm2pgsql:update')
        ->assertExitCode(Command::SUCCESS);

    Process::assertRan(function (PendingProcess $process, ProcessResult $result) {
        return $process->command === [
            'osm2pgsql-replication',
            'update',
            '--verbose',
            '-d',
            'driversagainstflock',
            '--',
            '--verbose',
            '--append',
            '--slim',
            '--extra-attributes',
            '--output=flex',
            '--style='.base_path('database/osm2pgsql/alpr.lua'),
        ]
            && $process->timeout === 28800
            && $process->environment['PGDATABASE'] === 'driversagainstflock'
            && $process->environment['PGHOST'] === '127.0.0.1'
            && $process->environment['PGPORT'] === '5432'
            && $process->environment['PGUSER'] === 'postgres'
            && $process->environment['PGPASSWORD'] === 'secret'
            && $result->successful();
    });
});

it('streams osm2pgsql process output while the update runs', function () {
    insertOsm2pgsqlReplicationImportNode(TEST_OSM2PGSQL_REPLICATION_NODE_ONE);

    $binary = tempnam(sys_get_temp_dir(), 'osm2pgsql-replication-');

    file_put_contents($binary, <<<'SH'
#!/usr/bin/env sh
printf 'streamed stdout\n'
printf 'streamed stderr\n' >&2
SH);

    chmod($binary, 0755);

    config([
        'osm2pgsql.replication_binary' => $binary,
    ]);

    try {
        $this->artisan('app:osm2pgsql:update')
            ->expectsOutputToContain('streamed stdout')
            ->expectsOutputToContain('streamed stderr')
            ->assertExitCode(Command::SUCCESS);
    } finally {
        @unlink($binary);
    }
});

it('passes configured flat nodes storage to osm2pgsql', function () {
    insertOsm2pgsqlReplicationImportNode(TEST_OSM2PGSQL_REPLICATION_NODE_ONE);

    config([
        'osm2pgsql.flat_nodes' => '/var/lib/osm2pgsql/flat-nodes.bin',
    ]);

    Process::fake([
        '*' => Process::result(),
    ]);

    $this->artisan('app:osm2pgsql:update')
        ->assertExitCode(Command::SUCCESS);

    Process::assertRan(fn (PendingProcess $process): bool => $process->command === [
        'osm2pgsql-replication',
        'update',
        '--verbose',
        '-d',
        'driversagainstflock',
        '--',
        '--verbose',
        '--append',
        '--slim',
        '--extra-attributes',
        '--output=flex',
        '--style='.base_path('database/osm2pgsql/alpr.lua'),
        '--flat-nodes=/var/lib/osm2pgsql/flat-nodes.bin',
    ]);
});

it('mirrors osm2pgsql import rows into canonical nodes after updating', function () {
    $existingNode = createOsm2pgsqlReplicationSyncedNode(TEST_OSM2PGSQL_REPLICATION_NODE_TWO);
    $existingNodeId = $existingNode->id;

    createOsm2pgsqlReplicationSyncedNode(TEST_OSM2PGSQL_REPLICATION_STALE_NODE);
    insertOsm2pgsqlReplicationImportNode(TEST_OSM2PGSQL_REPLICATION_NODE_ONE);
    insertOsm2pgsqlReplicationImportNode(
        TEST_OSM2PGSQL_REPLICATION_NODE_TWO,
        latitude: 43.2222222,
        longitude: -88.3333333,
        tags: [
            'surveillance:type' => 'ALPR',
            'camera:direction' => '135',
            'operator' => 'Updated agency',
        ],
        osmUpdatedAt: '2026-06-02 12:34:56+00',
        osmVersion: 8,
    );

    Process::fake([
        '*' => Process::result(),
    ]);

    $this->artisan('app:osm2pgsql:update')
        ->expectsOutputToContain('Mirrored 2 osm2pgsql nodes into nodes and deleted 1 stale nodes.')
        ->assertExitCode(Command::SUCCESS);

    $createdNode = OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_REPLICATION_NODE_ONE)->firstOrFail();
    $updatedNode = OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_REPLICATION_NODE_TWO)->firstOrFail();

    expect(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_REPLICATION_NODE_TWO)->count())->toBe(1)
        ->and($updatedNode->id)->toBe($existingNodeId)
        ->and((float) $createdNode->latitude)->toBe(43.1234567)
        ->and((float) $createdNode->longitude)->toBe(-88.7654321)
        ->and($createdNode->tags)->toMatchArray([
            'surveillance:type' => 'ALPR',
            'direction' => '270',
        ])
        ->and($createdNode->osm_updated_at?->toJSON())->toBe('2026-06-01T12:34:56.000000Z')
        ->and($createdNode->osm_version)->toBe(7)
        ->and($createdNode->osm_changeset_id)->toBe(123456789)
        ->and($createdNode->osm_user)->toBe('probe-user')
        ->and($createdNode->osm_uid)->toBe(98765)
        ->and($createdNode->sync_import_id)->toBeString()
        ->and($createdNode->last_synced_at)->not->toBeNull()
        ->and($updatedNode->id)->toBe($existingNodeId)
        ->and((float) $updatedNode->latitude)->toBe(43.2222222)
        ->and((float) $updatedNode->longitude)->toBe(-88.3333333)
        ->and($updatedNode->tags['operator'])->toBe('Updated agency')
        ->and($updatedNode->camera_direction)->toBe('135')
        ->and($updatedNode->osm_version)->toBe(8)
        ->and(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_REPLICATION_STALE_NODE)->exists())->toBeFalse();
});

it('refuses to mirror stale deletions when the import table is empty', function () {
    createOsm2pgsqlReplicationSyncedNode(TEST_OSM2PGSQL_REPLICATION_STALE_NODE);

    Process::fake([
        '*' => Process::result(),
    ]);

    $this->artisan('app:osm2pgsql:update')
        ->expectsOutputToContain('The osm2pgsql import table is empty; refusing to mirror stale deletions.')
        ->assertExitCode(Command::FAILURE);

    expect(OsmNode::query()->where('osm_id', TEST_OSM2PGSQL_REPLICATION_STALE_NODE)->exists())->toBeTrue();
});

it('skips when osm2pgsql updates are disabled', function () {
    config([
        'osm2pgsql.enabled' => false,
    ]);

    Process::fake();

    $this->artisan('app:osm2pgsql:update')
        ->assertExitCode(Command::SUCCESS);

    Process::assertNothingRan();
});

it('skips when another osm2pgsql operation has the lock', function () {
    $lock = Cache::lock(Osm2pgsqlReplicationUpdateCommand::OPERATION_LOCK_KEY, 60);
    $lock->get();

    Process::fake();

    try {
        $this->artisan('app:osm2pgsql:update')
            ->assertExitCode(Command::SUCCESS);

        Process::assertNothingRan();
    } finally {
        $lock->release();
    }
});

it('fails and logs output when replication exits non-zero', function () {
    Log::shouldReceive('error')
        ->once()
        ->with('osm2pgsql replication update failed.', Mockery::on(
            fn (array $context): bool => $context['exit_code'] === 2
                && str_contains($context['stdout'], 'partial output')
                && str_contains($context['stderr'], 'replication error'),
        ));

    Process::fake([
        '*' => Process::result(
            output: 'partial output',
            errorOutput: 'replication error',
            exitCode: 2,
        ),
    ]);

    $this->artisan('app:osm2pgsql:update')
        ->assertExitCode(Command::FAILURE);
});
