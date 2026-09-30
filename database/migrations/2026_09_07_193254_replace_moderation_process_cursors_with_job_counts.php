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
            $table->unsignedBigInteger('run_number')->default(0);
            $table->unsignedBigInteger('total_jobs')->default(0);
            $table->unsignedBigInteger('pending_jobs')->default(0);
            $table->unsignedBigInteger('failed_jobs')->default(0);
            $table->dropColumn(['cursor', 'upper_bound']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('moderation_processes', function (Blueprint $table): void {
            $table->unsignedBigInteger('cursor')->default(0);
            $table->unsignedBigInteger('upper_bound')->nullable();
            $table->dropColumn(['run_number', 'total_jobs', 'pending_jobs', 'failed_jobs']);
        });
    }
};
