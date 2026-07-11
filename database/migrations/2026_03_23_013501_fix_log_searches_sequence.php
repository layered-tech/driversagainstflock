<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            try {
                DB::statement('ALTER TABLE migrations DROP CONSTRAINT IF EXISTS migrations_pkey CASCADE;');
            } catch (\Exception $e) {
            }

            try {
                DB::statement('DROP INDEX IF EXISTS migrations_pkey CASCADE;');
            } catch (\Exception $e) {
            }

            try {
                DB::statement("SELECT setval('migrations_id_seq', coalesce(max(id), 1), max(id) IS NOT null) FROM migrations;");
            } catch (\Exception $e) {
            }

            DB::statement("SELECT setval('log_searches_id_seq', coalesce(max(id), 1), max(id) IS NOT null) FROM log_searches;");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
    }
};
