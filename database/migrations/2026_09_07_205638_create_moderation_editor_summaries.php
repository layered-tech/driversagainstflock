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
        Schema::create('moderation_editor_summaries', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('osm_uid')->unique();
            $table->string('name')->nullable()->index();
            $table->timestampTz('first_active')->nullable();
            $table->timestampTz('last_active')->nullable()->index();
            $table->unsignedBigInteger('tracked_changesets')->default(0)->index();
            $table->unsignedBigInteger('added')->default(0)->index();
            $table->unsignedBigInteger('modified')->default(0)->index();
            $table->unsignedBigInteger('deleted')->default(0)->index();
            $table->unsignedBigInteger('flagged_changesets')->default(0);
            $table->unsignedBigInteger('reviewed_changesets')->default(0);
            $table->unsignedBigInteger('flags_count')->nullable()->index();
            $table->decimal('survival_percent', 5, 1)->nullable()->index();
            $table->unsignedBigInteger('survival_reverted')->nullable();
            $table->unsignedInteger('areas_count')->default(0)->index();
            $table->timestampTz('calculated_at', 6)->nullable()->index();
            $table->timestampTz('dirty_at', 6)->nullable()->index();
            $table->unsignedBigInteger('rebuild_run')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('moderation_editor_areas', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('moderation_editor_summary_id')->constrained()->cascadeOnDelete();
            $table->foreignId('watched_area_id')->index()->constrained()->cascadeOnDelete();
            $table->string('refresh_token', 24)->index();
            $table->timestamps();
            $table->unique(['moderation_editor_summary_id', 'watched_area_id'], 'moderation_editor_area_unique');
        });

        Schema::table('watched_areas', function (Blueprint $table): void {
            $table->timestampTz('summary_dirty_at', 6)->nullable()->index();
            $table->timestampTz('summary_refreshed_at', 6)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('watched_areas', function (Blueprint $table): void {
            $table->dropColumn(['summary_dirty_at', 'summary_refreshed_at']);
        });
        Schema::dropIfExists('moderation_editor_areas');
        Schema::dropIfExists('moderation_editor_summaries');
    }
};
