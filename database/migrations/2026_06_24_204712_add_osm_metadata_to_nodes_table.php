<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropIndex('nodes_hotlist_type_created_at_id_index');
            $table->dropIndex('nodes_hotlist_created_at_id_index');

            $table->timestamp('osm_updated_at')->nullable();
            $table->unsignedInteger('osm_version')->nullable();
            $table->unsignedBigInteger('osm_changeset_id')->nullable();
            $table->string('osm_user')->nullable();
            $table->unsignedBigInteger('osm_uid')->nullable();
        });

        DB::statement('CREATE INDEX nodes_hotlist_osm_updated_at_id_index ON nodes ((coalesce(osm_updated_at, created_at)), id)');
        DB::statement('CREATE INDEX nodes_hotlist_type_osm_updated_at_id_index ON nodes (surveillance_type, (coalesce(osm_updated_at, created_at)), id)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS nodes_hotlist_type_osm_updated_at_id_index');
        DB::statement('DROP INDEX IF EXISTS nodes_hotlist_osm_updated_at_id_index');

        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn([
                'osm_updated_at',
                'osm_version',
                'osm_changeset_id',
                'osm_user',
                'osm_uid',
            ]);

            $table->index(['created_at', 'id'], 'nodes_hotlist_created_at_id_index');
            $table->index(['surveillance_type', 'created_at', 'id'], 'nodes_hotlist_type_created_at_id_index');
        });
    }
};
