<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    $this->createModerationSource();
    Schema::table('testing_changesets', function (Blueprint $table): void {
        $table->integer('num_changes')->nullable();
        $table->geometry('bbox', subtype: 'polygon', srid: 4326)->nullable();
        $table->text('source')->default('test');
        $table->bigInteger('replication_sequence')->nullable();
        $table->timestampTz('ingested_at')->nullable();
        $table->timestampTz('updated_at')->nullable();
    });
    Schema::table('testing_changeset_comments', function (Blueprint $table): void {
        $table->bigInteger('changeset_id')->nullable();
    });

    $this->sourceSql = fn (string $sql): string => str_replace(
        ['osm_history.application_changesets', 'osm_history.alpr_node_versions', 'osm_history.changeset_comments', 'osm_history.changesets'],
        ['testing_application_changesets', 'testing_node_versions', 'testing_changeset_comments', 'testing_changesets'],
        $sql,
    );
    $sql = file_get_contents(base_path('database/osm2pgsql/production/moderation-changesets.sql'));
    DB::unprepared(($this->sourceSql)($sql));
});

test('changeset counts reflect final node versions, late history and discussion parent IDs', function () {
    $this->sourceChangeset(100);
    $this->sourceChangeset(101);
    $this->sourceChangeset(102);
    $this->sourceNode(200, 1);
    $this->sourceNode(200, 2);
    $this->sourceNode(201, 2);
    $this->sourceNode(201, 3);
    $this->sourceNode(202, 1);
    $this->sourceNode(202, 2, ['visible' => false]);
    $this->sourceNode(203, 2, ['visible' => false]);
    $this->sourceNode(203, 3);
    $this->sourceNode(204, 1, ['changeset_id' => 101]);
    $this->sourceNode(204, 2);
    $parentId = DB::table('testing_changesets')->where('osm_changeset_id', 100)->value('id');
    foreach ([true, false] as $ordinal => $visible) {
        DB::table('testing_changeset_comments')->insert([
            'osm_changeset_id' => 100, 'changeset_id' => $parentId,
            'ordinal' => $ordinal, 'visible' => $visible, 'body' => 'Discussion', 'commented_at' => now(),
        ]);
    }

    $row = DB::table('testing_application_changesets')->where('osm_changeset_id', 100)->first();
    expect($row->alpr_nodes_created)->toBe(1)
        ->and($row->alpr_nodes_modified)->toBe(3)
        ->and($row->alpr_nodes_deleted)->toBe(1)
        ->and($row->alpr_nodes_touched)->toBe(5)
        ->and($row->available_discussion_comments)->toBe(2);

    $empty = DB::table('testing_application_changesets')->where('osm_changeset_id', 102)->first();
    expect($empty->alpr_nodes_touched)->toBe(0)->and($empty->available_discussion_comments)->toBe(0);

    $this->sourceNode(201, 1);
    DB::table('testing_node_versions')->where('node_id', 202)->where('osm_version', 2)->update(['visible' => true]);
    DB::table('testing_node_versions')->where('node_id', 203)->delete();
    $row = DB::table('testing_application_changesets')->where('osm_changeset_id', 100)->first();
    expect($row->alpr_nodes_created)->toBe(3)
        ->and($row->alpr_nodes_modified)->toBe(1)
        ->and($row->alpr_nodes_deleted)->toBe(0)
        ->and($row->alpr_nodes_touched)->toBe(4);
});

test('moderation index definitions can be applied repeatedly with the required column ordering', function () {
    $sql = file_get_contents(base_path('database/osm2pgsql/production/moderation-indexes.sql'));
    preg_match_all('/CREATE INDEX CONCURRENTLY.*?;/s', $sql, $statements);
    expect($statements[0])->toHaveCount(4);
    foreach (range(1, 2) as $pass) {
        foreach ($statements[0] as $statement) {
            DB::statement(($this->sourceSql)(str_replace(' CONCURRENTLY', '', $statement)));
        }
    }

    $indexes = DB::table('pg_indexes')->whereIn('tablename', ['testing_node_versions', 'testing_changesets'])->pluck('indexdef', 'indexname');
    expect($indexes['alpr_node_versions_latest_index'])->toContain('(node_id, osm_version DESC)')
        ->and($indexes['alpr_node_versions_changeset_latest_index'])->toContain('(changeset_id, node_id, osm_version DESC) INCLUDE (visible)')
        ->and($indexes['changesets_created_id_index'])->toContain('(created_at DESC, osm_changeset_id DESC)')
        ->and($indexes['changesets_uid_created_id_index'])->toContain('(osm_uid, created_at DESC, osm_changeset_id DESC)');
});
