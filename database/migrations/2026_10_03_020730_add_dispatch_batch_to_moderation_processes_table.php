<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('moderation_processes', function (Blueprint $table): void {
            $table->jsonb('dispatch_batch')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('moderation_processes', function (Blueprint $table): void {
            $table->dropColumn('dispatch_batch');
        });
    }
};
