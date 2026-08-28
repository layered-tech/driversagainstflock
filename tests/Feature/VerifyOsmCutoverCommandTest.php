<?php

use App\Models\CurrentOsmNode;
use App\Models\OsmNode;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use MatanYadaev\EloquentSpatial\Objects\Point;

const OSM_CUTOVER_NODE_ONE = 991000000001;
const OSM_CUTOVER_NODE_TWO = 991000000002;

function createCutoverNode(int $osmId, string $syncedAt = '2026-08-27 12:00:00+00'): OsmNode
{
    return OsmNode::query()->create([
        'osm_id' => $osmId,
        'latitude' => 43.0389,
        'longitude' => -87.9065,
        'location' => new Point(43.0389, -87.9065),
        'tags' => [
            'manufacturer' => 'Flock Safety',
            'surveillance:type' => 'ALPR',
        ],
        'surveillance_type' => 'ALPR',
        'direction' => '90',
        'osm_updated_at' => '2026-08-27 11:58:00+00',
        'osm_version' => 1,
        'osm_changeset_id' => 170000001,
        'osm_user' => 'cutover-probe',
        'osm_uid' => 12345,
        'last_synced_at' => $syncedAt,
    ]);
}

function snapshotCutoverReader(): void
{
    Schema::dropIfExists('osm_cutover_reader');
    DB::statement(<<<'SQL'
        CREATE TABLE osm_cutover_reader AS
        SELECT nodes.*, last_synced_at AS source_timestamp
        FROM nodes
        SQL);
}

beforeEach(function () {
    Schema::dropIfExists('osm_cutover_reader');

    config([
        'osm.reader.connection' => config('database.default'),
        'osm.reader.enabled' => false,
        'osm.reader.maximum_source_age_minutes' => 10,
        'osm.reader.table' => 'osm_cutover_reader',
    ]);
});

afterEach(function () {
    Schema::dropIfExists('osm_cutover_reader');
});

it('passes count freshness and representative row gates without exposing row contents', function () {
    $this->travelTo('2026-08-27 12:05:00');
    createCutoverNode(OSM_CUTOVER_NODE_ONE);
    createCutoverNode(OSM_CUTOVER_NODE_TWO);
    snapshotCutoverReader();

    $this->artisan('app:verify-osm-cutover', [
        '--node' => [OSM_CUTOVER_NODE_ONE, OSM_CUTOVER_NODE_TWO],
    ])
        ->expectsOutputToContain('Representative row parity passed for 2 node(s).')
        ->expectsOutputToContain('OSM consumer cutover gates passed.')
        ->doesntExpectOutputToContain('-87.9065')
        ->assertSuccessful();
});

it('fails when the reader count differs beyond the approved limit', function () {
    $this->travelTo('2026-08-27 12:05:00');
    createCutoverNode(OSM_CUTOVER_NODE_ONE);
    createCutoverNode(OSM_CUTOVER_NODE_TWO);
    snapshotCutoverReader();
    DB::table('osm_cutover_reader')->where('osm_id', OSM_CUTOVER_NODE_TWO)->delete();

    $this->artisan('app:verify-osm-cutover', [
        '--node' => [OSM_CUTOVER_NODE_ONE],
    ])
        ->expectsOutputToContain('row-count difference exceeds')
        ->assertExitCode(Command::FAILURE);
});

it('fails when the reader source is stale', function () {
    $this->travelTo('2026-08-27 12:30:00');
    createCutoverNode(OSM_CUTOVER_NODE_ONE);
    snapshotCutoverReader();

    $this->artisan('app:verify-osm-cutover', [
        '--node' => [OSM_CUTOVER_NODE_ONE],
    ])
        ->expectsOutputToContain('source age exceeds')
        ->assertExitCode(Command::FAILURE);
});

it('fails when a representative row differs', function () {
    $this->travelTo('2026-08-27 12:05:00');
    createCutoverNode(OSM_CUTOVER_NODE_ONE);
    snapshotCutoverReader();
    OsmNode::query()->where('osm_id', OSM_CUTOVER_NODE_ONE)->update([
        'osm_version' => 2,
    ]);

    $this->artisan('app:verify-osm-cutover', [
        '--node' => [OSM_CUTOVER_NODE_ONE],
    ])
        ->expectsOutputToContain('differs in field(s): osm_version')
        ->assertExitCode(Command::FAILURE);
});

it('samples rows and can query the reader before the public cutover flag is enabled', function () {
    $this->travelTo('2026-08-27 12:05:00');
    createCutoverNode(OSM_CUTOVER_NODE_ONE);
    snapshotCutoverReader();

    expect(config('osm.reader.enabled'))->toBeFalse()
        ->and(CurrentOsmNode::readerQuery()->count())->toBe(1);

    $this->artisan('app:verify-osm-cutover')
        ->expectsOutputToContain('Representative row parity passed for 1 node(s).')
        ->assertSuccessful();
});

it('serves the existing marker response contract from the reader after cutover', function () {
    createCutoverNode(OSM_CUTOVER_NODE_ONE);
    snapshotCutoverReader();
    createCutoverNode(OSM_CUTOVER_NODE_TWO);
    config(['osm.reader.enabled' => true]);

    $this->withoutMiddleware()
        ->getJson('/api/markers?sw_lng=-88.0&sw_lat=43.0&ne_lng=-87.8&ne_lat=43.1')
        ->assertOk()
        ->assertJsonCount(1, 'points')
        ->assertJsonPath('points.0.properties.osm_id', OSM_CUTOVER_NODE_ONE)
        ->assertJsonPath('points.0.properties.type', 'OpenStreetMap ALPR');
});

it('rejects invalid verification options before querying either source', function () {
    $this->artisan('app:verify-osm-cutover', [
        '--node' => ['0'],
    ])
        ->expectsOutputToContain('Every --node value must be a positive integer.')
        ->assertExitCode(Command::FAILURE);
});
