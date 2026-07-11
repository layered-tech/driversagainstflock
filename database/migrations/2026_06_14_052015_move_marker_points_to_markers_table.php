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
        if (! Schema::hasColumn('markers', 'point')) {
            Schema::table('markers', function (Blueprint $table) {
                $table->geometry('point', subtype: 'point', srid: 4326)->nullable()->after('bearing');
            });
        }

        if (Schema::hasTable('locations')) {
            DB::statement(<<<'SQL'
                UPDATE markers
                SET point = marker_locations.point
                FROM (
                    SELECT DISTINCT ON (marker_id) marker_id, point
                    FROM locations
                    WHERE type = 'marker'
                        AND point IS NOT NULL
                    ORDER BY marker_id, id
                ) AS marker_locations
                WHERE marker_locations.marker_id = markers.id
                    AND markers.point IS NULL
            SQL);

            Schema::dropIfExists('locations');
        }

        DB::statement('CREATE INDEX IF NOT EXISTS markers_point_gist ON markers USING GIST (point) WHERE point IS NOT NULL');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasTable('locations')) {
            Schema::create('locations', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('marker_id')->index();
                $table->string('type');
                $table->geometry('point', subtype: 'point', srid: 4326)->nullable();
                $table->timestamps();
            });

            DB::statement(<<<'SQL'
                INSERT INTO locations (marker_id, type, point, created_at, updated_at)
                SELECT id, 'marker', point, created_at, updated_at
                FROM markers
                WHERE point IS NOT NULL
            SQL);
        }

        DB::statement('DROP INDEX IF EXISTS markers_point_gist');

        if (Schema::hasColumn('markers', 'point')) {
            Schema::table('markers', function (Blueprint $table) {
                $table->dropColumn('point');
            });
        }
    }
};
