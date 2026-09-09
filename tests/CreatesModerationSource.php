<?php

namespace Tests;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

trait CreatesModerationSource
{
    protected function createModerationSource(): void
    {
        config(['osm.reader.changesets_table' => 'testing_changesets', 'osm.reader.comments_table' => 'testing_changeset_comments', 'osm.reader.versions_table' => 'testing_node_versions']);
        Schema::create('testing_changesets', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('osm_changeset_id')->unique();
            $table->unsignedBigInteger('osm_uid')->nullable();
            $table->string('osm_user')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('closed_at')->nullable();
            $table->boolean('open')->default(false);
            $table->jsonb('tags');
            $table->timestampTz('observed_at');
            foreach (['alpr_nodes_created', 'alpr_nodes_modified', 'alpr_nodes_deleted', 'alpr_nodes_touched', 'osm_num_changes', 'comments_count', 'available_discussion_comments'] as $key) {
                $table->unsignedInteger($key)->default(0);
            }
            foreach (['min_lon', 'min_lat', 'max_lon', 'max_lat'] as $key) {
                $table->double($key)->nullable();
            }
        });
        Schema::create('testing_changeset_comments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('osm_changeset_id');
            $table->unsignedBigInteger('osm_comment_id')->nullable();
            $table->integer('ordinal');
            $table->boolean('visible');
            $table->text('body');
            $table->timestampTz('commented_at');
            $table->string('osm_user')->nullable();
            $table->unsignedBigInteger('osm_uid')->nullable();
        });
        Schema::create('testing_node_versions', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('node_id');
            $table->unsignedInteger('osm_version');
            $table->boolean('visible');
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            $table->geometry('geom', subtype: 'point', srid: 4326)->nullable();
            $table->jsonb('tags');
            $table->timestampTz('osm_updated_at');
            $table->unsignedBigInteger('changeset_id');
            $table->unsignedBigInteger('osm_uid')->nullable();
            $table->string('osm_user')->nullable();
        });
    }

    protected function moderator(): User
    {
        $user = User::factory()->create();
        $user->osm_uid = 123;
        $user->save();
        config(['moderation.approved_osm_ids' => ['123']]);
        $this->actingAs($user)->withSession(['osm_authenticated_uid' => '123']);

        return $user;
    }

    /** @param array<string, mixed> $attributes */
    protected function sourceChangeset(int $id = 100, array $attributes = []): void
    {
        DB::table('testing_changesets')->insert([...[
            'osm_changeset_id' => $id, 'osm_uid' => 123, 'osm_user' => 'mapper', 'created_at' => now()->subHour(), 'observed_at' => now(),
            'tags' => json_encode(['comment' => 'Survey cameras', 'created_by' => 'iD']), 'alpr_nodes_created' => 2, 'alpr_nodes_touched' => 2,
            'min_lon' => -98, 'min_lat' => 30, 'max_lon' => -97, 'max_lat' => 31,
        ], ...$attributes]);
    }

    /** @param array<string, mixed> $attributes */
    protected function sourceNode(int $id = 200, int $version = 1, array $attributes = []): void
    {
        DB::table('testing_node_versions')->insert([...[
            'node_id' => $id, 'osm_version' => $version, 'changeset_id' => 100, 'osm_uid' => 123, 'osm_user' => 'mapper',
            'visible' => true, 'latitude' => 30.5, 'longitude' => -97.5, 'geom' => DB::raw('ST_SetSRID(ST_MakePoint(-97.5,30.5),4326)'),
            'tags' => json_encode(['surveillance:type' => 'ALPR']), 'osm_updated_at' => now()->subMinutes(20),
        ], ...$attributes]);
    }
}
