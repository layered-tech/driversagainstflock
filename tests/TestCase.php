<?php

namespace Tests;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTestingOsmReaderTable();
    }

    private function createTestingOsmReaderTable(): void
    {
        $connection = (string) config('osm.reader.connection');
        $tableName = (string) config('osm.reader.table');
        $schema = Schema::connection($connection);

        if ($schema->hasTable($tableName)) {
            return;
        }

        $schema->create($tableName, function (Blueprint $table): void {
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
            $table->timestamp('osm_updated_at')->nullable();
            $table->unsignedInteger('osm_version')->nullable();
            $table->unsignedBigInteger('osm_changeset_id')->nullable();
            $table->string('osm_user')->nullable();
            $table->unsignedBigInteger('osm_uid')->nullable();
        });
    }
}
