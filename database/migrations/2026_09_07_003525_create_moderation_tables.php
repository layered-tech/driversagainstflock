<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('moderation_reviews', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_type');
            $table->unsignedBigInteger('subject_id');
            $table->string('revision', 64);
            $table->string('status');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['subject_type', 'subject_id']);
        });
        Schema::create('moderation_activities', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('actor');
            $table->string('action');
            $table->string('subject_type');
            $table->unsignedBigInteger('subject_id');
            $table->jsonb('details');
            $table->timestamps();
            $table->index(['subject_type', 'subject_id']);
        });
        Schema::create('watched_areas', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('kind');
            $table->string('definition');
            $table->jsonb('geometry');
            $table->jsonb('bounds');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('watched_area_user', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('watched_area_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unique(['watched_area_id', 'user_id']);
        });
    }

    public function down(): void
    {
        foreach (['watched_area_user', 'watched_areas', 'moderation_activities', 'moderation_reviews'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
