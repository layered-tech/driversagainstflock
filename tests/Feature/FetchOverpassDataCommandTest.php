<?php

use App\Console\Commands\FetchOverpassDataCommand;
use App\Jobs\ProcessOverpassNodesChunk;
use App\Models\OsmNode;
use App\Services\Overpass\OverpassChunkStore;
use Illuminate\Bus\PendingBatch;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use MatanYadaev\EloquentSpatial\Objects\Point;

const TEST_NODE_ONE = 999000000001;
const TEST_NODE_TWO = 999000000002;
const TEST_NODE_CREATE = 999000000003;
const TEST_NODE_RESTORE = 999000000004;
const TEST_NODE_DELETE = 999000000005;

function xmlAttribute(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_XML1);
}

function overpassFullXmlResponse(array $elements, string $osmBase = '2026-06-10T12:30:00Z'): string
{
    $nodes = '';

    foreach ($elements as $element) {
        $attributes = [
            'id' => $element['id'],
            'lat' => $element['lat'],
            'lon' => $element['lon'],
        ];

        foreach (['version', 'changeset', 'timestamp', 'user', 'uid'] as $attribute) {
            if (array_key_exists($attribute, $element)) {
                $attributes[$attribute] = $element[$attribute];
            }
        }

        $serializedAttributes = collect($attributes)
            ->map(fn (mixed $value, string $key): string => $key.'="'.xmlAttribute($value).'"')
            ->implode(' ');

        $nodes .= "    <node {$serializedAttributes}>\n";

        foreach (($element['tags'] ?? []) as $key => $value) {
            $nodes .= '        <tag k="'.xmlAttribute($key).'" v="'.xmlAttribute($value).'"/>'."\n";
        }

        $nodes .= "    </node>\n";
    }

    return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="Overpass API">
    <meta osm_base="{$osmBase}"/>
{$nodes}</osm>
XML;
}

function overpassXmlResponse(string $actions, string $osmBase = '2026-06-10T13:00:00Z'): string
{
    return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="Overpass API">
    <meta osm_base="{$osmBase}"/>
    {$actions}
</osm>
XML;
}

function createOverpassNode(
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

function syncPostgresSequence(string $sequence, string $table): void
{
    if (DB::getDriverName() !== 'pgsql') {
        return;
    }

    DB::select("select setval('{$sequence}', (select greatest(coalesce(max(id), 0), 1) from {$table}), true)");
}

beforeEach(function () {
    app()->detectEnvironment(fn () => 'local');

    Cache::flush();
    Http::preventStrayRequests();
    syncPostgresSequence('nodes_id_seq', 'nodes');

    config([
        'directions.overpass_url' => 'https://overpass.test/api/interpreter',
    ]);
});

it('imports a full snapshot into canonical OSM nodes', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(overpassFullXmlResponse([
            [
                'type' => 'node',
                'id' => TEST_NODE_ONE,
                'lat' => 43.1234567,
                'lon' => -88.7654321,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'direction' => '270',
                ],
                'timestamp' => '2026-06-09T15:20:00Z',
                'version' => 12,
                'changeset' => 987654321,
                'user' => 'mapper-one',
                'uid' => 1234567,
            ],
        ])),
    ]);

    $this->artisan('app:fetch-overpass-data', ['--full' => true, '--no-reconcile' => true])
        ->assertExitCode(Command::SUCCESS);

    $node = OsmNode::query()->where('osm_id', TEST_NODE_ONE)->firstOrFail();

    expect((float) $node->latitude)->toBe(43.1234567)
        ->and((float) $node->longitude)->toBe(-88.7654321)
        ->and((float) $node->location->latitude)->toBe(43.1234567)
        ->and((float) $node->location->longitude)->toBe(-88.7654321)
        ->and($node->tags)->toMatchArray([
            'surveillance:type' => 'ALPR',
            'direction' => '270',
        ])
        ->and($node->surveillance_type)->toBe('ALPR')
        ->and($node->direction)->toBe('270')
        ->and($node->osm_updated_at?->toJSON())->toBe('2026-06-09T15:20:00.000000Z')
        ->and($node->osm_version)->toBe(12)
        ->and($node->osm_changeset_id)->toBe(987654321)
        ->and($node->osm_user)->toBe('mapper-one')
        ->and($node->osm_uid)->toBe(1234567)
        ->and($node->sync_import_id)->toBeString()
        ->and(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBe('2026-06-10T12:30:00Z');

    Http::assertSent(fn ($request) => str_contains($request->url(), 'overpass.test')
        && str_contains($request->data()['data'] ?? '', '[out:xml]')
        && str_contains($request->data()['data'] ?? '', 'out meta geom;')
        && ! str_contains($request->data()['data'] ?? '', '[adiff:'));
});

it('overrides a local node by osm id without creating a duplicate', function () {
    $existingNode = createOverpassNode(TEST_NODE_TWO);
    $existingNode->forceFill([
        'osm_version' => 99,
        'sync_import_id' => null,
    ])->save();
    $existingNodeId = $existingNode->id;

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(overpassFullXmlResponse([
            [
                'type' => 'node',
                'id' => TEST_NODE_TWO,
                'lat' => 43.2222222,
                'lon' => -88.3333333,
                'tags' => [
                    'surveillance:type' => 'ALPR',
                    'camera:direction' => '135',
                    'operator' => 'Updated agency',
                ],
                'timestamp' => '2026-06-10T12:44:00Z',
                'version' => 13,
                'changeset' => 987654322,
                'user' => 'mapper-two',
                'uid' => 7654321,
            ],
        ], '2026-06-10T12:45:00Z')),
    ]);

    $this->artisan('app:fetch-overpass-data', ['--full' => true, '--no-reconcile' => true])
        ->assertExitCode(Command::SUCCESS);

    $node = OsmNode::query()->where('osm_id', TEST_NODE_TWO)->firstOrFail();

    expect(OsmNode::query()->where('osm_id', TEST_NODE_TWO)->count())->toBe(1)
        ->and($node->id)->toBe($existingNodeId)
        ->and((float) $node->latitude)->toBe(43.2222222)
        ->and((float) $node->longitude)->toBe(-88.3333333)
        ->and((float) $node->location->latitude)->toBe(43.2222222)
        ->and((float) $node->location->longitude)->toBe(-88.3333333)
        ->and($node->tags['operator'])->toBe('Updated agency')
        ->and($node->camera_direction)->toBe('135')
        ->and($node->osm_updated_at?->toJSON())->toBe('2026-06-10T12:44:00.000000Z')
        ->and($node->osm_version)->toBe(13)
        ->and($node->osm_changeset_id)->toBe(987654322)
        ->and($node->osm_user)->toBe('mapper-two')
        ->and($node->osm_uid)->toBe(7654321)
        ->and($node->sync_import_id)->toBeString();
});

it('queues full snapshot nodes in processable chunks', function () {
    Bus::fake();

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(overpassFullXmlResponse([
            [
                'type' => 'node',
                'id' => TEST_NODE_ONE,
                'lat' => 43.1000001,
                'lon' => -88.1000001,
                'tags' => ['surveillance:type' => 'ALPR'],
            ],
            [
                'type' => 'node',
                'id' => TEST_NODE_ONE + 1,
                'lat' => 43.1000002,
                'lon' => -88.1000002,
                'tags' => ['surveillance:type' => 'ALPR'],
            ],
            [
                'type' => 'node',
                'id' => TEST_NODE_ONE + 2,
                'lat' => 43.1000003,
                'lon' => -88.1000003,
                'tags' => ['surveillance:type' => 'ALPR'],
            ],
        ])),
    ]);

    $capturedBatch = null;

    $this->artisan('app:fetch-overpass-data', ['--full' => true, '--no-reconcile' => true, '--chunk' => 2])
        ->assertExitCode(Command::SUCCESS);

    Bus::assertBatched(function (PendingBatch $batch) use (&$capturedBatch) {
        $capturedBatch = $batch;

        return $batch->name === 'Overpass node sync 2026-06-10T12:30:00Z';
    });

    $jobs = $capturedBatch->jobs->values();
    $chunks = app(OverpassChunkStore::class);
    $firstPayload = $chunks->read($jobs[0]->upsertsPath);
    $secondPayload = $chunks->read($jobs[1]->upsertsPath);

    expect($jobs)->toHaveCount(2)
        ->and($jobs[0])->toBeInstanceOf(ProcessOverpassNodesChunk::class)
        ->and($jobs[0]->upserts)->toBe([])
        ->and($jobs[0]->upsertsPath)->toBeString()
        ->and($jobs[0]->syncImportId)->toBeString()
        ->and($firstPayload)->toHaveCount(2)
        ->and($firstPayload[0]['id'])->toBe(TEST_NODE_ONE)
        ->and($jobs[1])->toBeInstanceOf(ProcessOverpassNodesChunk::class)
        ->and($jobs[1]->upserts)->toBe([])
        ->and($jobs[1]->upsertsPath)->toBeString()
        ->and($jobs[1]->syncImportId)->toBe($jobs[0]->syncImportId)
        ->and($secondPayload)->toHaveCount(1)
        ->and($secondPayload[0]['id'])->toBe(TEST_NODE_ONE + 2)
        ->and(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBeNull();

    $chunks->deleteImport(basename(dirname($jobs[0]->upsertsPath)));
});

it('skips fetching when an overpass batch is already active', function () {
    DB::table('job_batches')->insert([
        'id' => 'active-overpass-batch',
        'name' => 'Overpass node sync 2026-06-10T12:30:00Z',
        'total_jobs' => 2,
        'pending_jobs' => 2,
        'failed_jobs' => 0,
        'failed_job_ids' => '[]',
        'options' => serialize([]),
        'cancelled_at' => null,
        'created_at' => now()->timestamp,
        'finished_at' => null,
    ]);

    Cache::forever(FetchOverpassDataCommand::ACTIVE_BATCH_CACHE_KEY, 'active-overpass-batch');

    $this->artisan('app:fetch-overpass-data')
        ->assertExitCode(Command::SUCCESS);
});

it('processes xml adiff create modify and delete actions', function () {
    Cache::forever(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY, '2026-06-10T12:00:00Z');
    $this->travelTo('2026-06-10 12:30:00');

    $updatedNode = createOverpassNode(TEST_NODE_RESTORE, tags: ['surveillance:type' => 'ALPR', 'direction' => '10']);
    createOverpassNode(TEST_NODE_DELETE, tags: ['surveillance:type' => 'ALPR', 'direction' => '20']);

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(overpassXmlResponse(<<<'XML'
<action type="create">
    <node id="999000000003" lat="43.1000000" lon="-88.1000000" version="1" changeset="987654323" timestamp="2026-06-10T12:50:00Z" user="mapper-three" uid="333">
        <tag k="surveillance:type" v="ALPR"/>
        <tag k="direction" v="180"/>
    </node>
</action>
<action type="modify">
    <old>
        <node id="999000000004" lat="43.0000000" lon="-88.0000000"/>
    </old>
    <new>
        <node id="999000000004" lat="43.2000000" lon="-88.2000000" version="2" changeset="987654324" timestamp="2026-06-10T12:55:00Z" user="mapper-four" uid="444">
            <tag k="surveillance:type" v="ALPR"/>
            <tag k="direction" v="315"/>
        </node>
    </new>
</action>
<action type="delete">
    <old>
        <node id="999000000005" lat="43.3000000" lon="-88.3000000">
            <tag k="surveillance:type" v="ALPR"/>
        </node>
    </old>
    <new>
        <node id="999000000005" visible="false"/>
    </new>
</action>
XML, '2026-06-10T13:00:00Z')),
    ]);

    $this->artisan('app:fetch-overpass-data')
        ->assertExitCode(Command::SUCCESS);

    $createdNode = OsmNode::query()->where('osm_id', TEST_NODE_CREATE)->firstOrFail();
    $updatedNode->refresh();

    expect($createdNode->direction)->toBe('180')
        ->and($updatedNode->direction)->toBe('315')
        ->and((float) $updatedNode->latitude)->toBe(43.2)
        ->and((float) $updatedNode->longitude)->toBe(-88.2)
        ->and($createdNode->osm_updated_at?->toJSON())->toBe('2026-06-10T12:50:00.000000Z')
        ->and($createdNode->osm_version)->toBe(1)
        ->and($createdNode->osm_changeset_id)->toBe(987654323)
        ->and($createdNode->osm_user)->toBe('mapper-three')
        ->and($createdNode->osm_uid)->toBe(333)
        ->and($updatedNode->osm_updated_at?->toJSON())->toBe('2026-06-10T12:55:00.000000Z')
        ->and($updatedNode->osm_version)->toBe(2)
        ->and($updatedNode->osm_changeset_id)->toBe(987654324)
        ->and($updatedNode->osm_user)->toBe('mapper-four')
        ->and($updatedNode->osm_uid)->toBe(444)
        ->and(OsmNode::query()->where('osm_id', TEST_NODE_DELETE)->exists())->toBeFalse()
        ->and(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBe('2026-06-10T13:00:00Z');

    Http::assertSent(fn ($request) => str_contains($request->data()['data'] ?? '', '[out:xml]')
        && str_contains($request->data()['data'] ?? '', 'out meta geom;')
        && str_contains($request->data()['data'] ?? '', '[adiff:"2026-06-10T12:00:00Z"]'));
});

it('uses a full snapshot when the diff cursor is stale', function () {
    Cache::forever(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY, '2026-06-14T06:23:51Z');
    $this->travelTo('2026-06-20 04:00:00');

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response(overpassFullXmlResponse([], '2026-06-20T04:00:00Z')),
    ]);

    $this->artisan('app:fetch-overpass-data', ['--all' => true, '--no-reconcile' => true])
        ->assertExitCode(Command::SUCCESS);

    expect(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBe('2026-06-20T04:00:00Z');

    Http::assertSent(fn ($request) => str_contains($request->data()['data'] ?? '', '[out:xml]')
        && str_contains($request->data()['data'] ?? '', '[timeout:170]')
        && ! str_contains($request->data()['data'] ?? '', '[adiff:'));
});

it('falls back to a full snapshot when an overpass diff request times out', function () {
    Cache::forever(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY, '2026-06-10T12:00:00Z');
    $this->travelTo('2026-06-10 12:30:00');

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::sequence()
            ->pushFailedConnection('cURL error 28: Operation timed out after 180001 milliseconds with 0 bytes received')
            ->push(overpassFullXmlResponse([], '2026-06-10T12:31:00Z')),
    ]);

    $this->artisan('app:fetch-overpass-data', ['--all' => true, '--no-reconcile' => true])
        ->assertExitCode(Command::SUCCESS);

    $requests = Http::recorded()->map(fn (array $record) => $record[0]->data()['data'] ?? '')->values();

    expect($requests)->toHaveCount(2)
        ->and($requests[0])->toContain('[adiff:"2026-06-10T12:00:00Z"]')
        ->and($requests[1])->not->toContain('[adiff:')
        ->and(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBe('2026-06-10T12:31:00Z');
});

it('does not advance the sync cursor when a full overpass request times out', function () {
    Cache::forever(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY, '2026-06-10T12:00:00Z');

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::failedConnection('cURL error 28: Operation timed out after 180001 milliseconds with 0 bytes received'),
    ]);

    $this->artisan('app:fetch-overpass-data', ['--full' => true])
        ->assertExitCode(Command::FAILURE);

    expect(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBe('2026-06-10T12:00:00Z');
});

it('does not advance the sync cursor when overpass returns invalid xml', function () {
    Cache::forever(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY, '2026-06-10T12:00:00Z');
    $this->travelTo('2026-06-10 12:30:00');

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response('not xml', 200),
    ]);

    $this->artisan('app:fetch-overpass-data')
        ->assertExitCode(Command::FAILURE);

    expect(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBe('2026-06-10T12:00:00Z');
});

it('does not advance the sync cursor when overpass returns an error', function () {
    Cache::forever(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY, '2026-06-10T12:00:00Z');
    $this->travelTo('2026-06-10 12:30:00');

    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response('upstream error', 429),
    ]);

    $this->artisan('app:fetch-overpass-data')
        ->assertExitCode(Command::FAILURE);

    expect(Cache::get(FetchOverpassDataCommand::LAST_SUCCESSFUL_SYNC_CACHE_KEY))->toBe('2026-06-10T12:00:00Z');
});
