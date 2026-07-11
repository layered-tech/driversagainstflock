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
        Schema::dropIfExists('osm_nodes');
        Schema::dropIfExists('nodes');

        Schema::create('nodes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('osm_id')->unique();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->geometry('location', subtype: 'point', srid: 4326);
            $table->jsonb('tags')->default(DB::raw("'{}'::jsonb"));
            $table->string('surveillance_type')->nullable()->index();
            $table->string('direction')->nullable();
            $table->string('camera_direction')->nullable();
            $table->string('sync_import_id')->nullable()->index();
            $table->timestamp('last_synced_at')->nullable()->index();
            $table->timestamps();
        });

        DB::statement('CREATE INDEX nodes_location_gist ON nodes USING GIST (location)');
        DB::statement('CREATE INDEX nodes_tags_gin ON nodes USING GIN (tags jsonb_path_ops)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('nodes');

        Schema::create('osm_nodes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('node_id')->unique()->comment('The ID of the node from Overpass API');
            $table->unsignedInteger('marker_id')->index()->comment('Foreign key to the markers table');
            $table->decimal('lat', 10, 7)->comment('Latitude of the node');
            $table->decimal('lon', 10, 7)->comment('Longitude of the node');
            $table->json('tags')->nullable()->comment('Tags associated with the node');
            $table->timestamps();
        });
    }
};
