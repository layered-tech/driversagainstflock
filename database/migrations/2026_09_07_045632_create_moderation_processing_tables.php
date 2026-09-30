<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('moderation_contributions', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('node_id')->index();
            $table->unsignedBigInteger('changeset_id')->index();
            $table->unsignedBigInteger('osm_uid')->nullable()->index();
            $table->string('osm_user')->nullable();
            $table->unsignedInteger('node_version');
            $table->timestampTz('edited_at');
            $table->string('status')->default('unknown')->index();
            $table->boolean('history_complete')->default(false);
            $table->boolean('visible');
            $table->jsonb('tags_set');
            $table->jsonb('locations');
            $table->timestamps();
            $table->unique(['node_id', 'changeset_id']);
        });
        Schema::create('moderation_outcomes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('contribution_id')->constrained('moderation_contributions')->cascadeOnDelete();
            $table->unsignedInteger('later_version');
            $table->unsignedBigInteger('later_changeset_id')->index();
            $table->unsignedBigInteger('later_osm_uid')->nullable()->index();
            $table->string('later_osm_user')->nullable();
            $table->timestampTz('occurred_at')->index();
            $table->unsignedBigInteger('elapsed_seconds');
            $table->string('kind');
            $table->boolean('self_edit');
            $table->jsonb('evidence');
            $table->timestamps();
            $table->unique(['contribution_id', 'later_version', 'kind'], 'moderation_outcome_event_unique');
        });
        Schema::create('moderation_processes', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('state')->default('pending');
            $table->unsignedBigInteger('cursor')->default(0);
            $table->unsignedBigInteger('upper_bound')->nullable();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('last_success_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });
        Schema::create('moderation_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('type');
            $table->string('severity');
            $table->boolean('enabled')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->jsonb('settings');
            $table->jsonb('conditions');
            $table->jsonb('exceptions');
            $table->jsonb('area_ids');
            $table->timestamps();
        });
        Schema::create('moderation_rule_versions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('rule_id')->constrained('moderation_rules')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->jsonb('configuration');
            $table->timestamps();
            $table->unique(['rule_id', 'version']);
        });
        Schema::create('moderation_flags', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('rule_id')->constrained('moderation_rules')->cascadeOnDelete();
            $table->unsignedInteger('rule_version');
            $table->unsignedBigInteger('node_id')->index();
            $table->unsignedBigInteger('related_node_id')->default(0)->index();
            $table->unsignedInteger('node_version');
            $table->string('status')->default('open')->index();
            $table->string('evidence_hash', 64);
            $table->jsonb('evidence');
            $table->timestampTz('evaluated_at');
            $table->boolean('stale')->default(false);
            $table->foreignId('dismissed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('dismissed_at')->nullable();
            $table->timestamps();
            $table->unique(['rule_id', 'node_id', 'related_node_id']);
        });
        Schema::create('moderation_evaluations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('rule_id')->constrained('moderation_rules')->cascadeOnDelete();
            $table->unsignedBigInteger('node_id');
            $table->unsignedInteger('node_version');
            $table->unsignedInteger('rule_version');
            $table->string('state');
            $table->text('error')->nullable();
            $table->timestampTz('evaluated_at');
            $table->timestamps();
            $table->unique(['rule_id', 'node_id']);
        });
        Schema::create('osm_editor_profiles', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('osm_uid')->unique();
            $table->string('display_name')->nullable();
            $table->timestampTz('account_created_at')->nullable();
            $table->text('avatar_url')->nullable();
            $table->unsignedBigInteger('changesets_count')->nullable();
            $table->timestampTz('fetched_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['osm_editor_profiles', 'moderation_evaluations', 'moderation_flags', 'moderation_rule_versions', 'moderation_rules', 'moderation_processes', 'moderation_outcomes', 'moderation_contributions'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
