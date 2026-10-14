<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('area_devices', function (Blueprint $table): void {
            $table->id();
            $table->string('token_hash', 64)->unique();
            $table->text('push_token')->nullable();
            $table->string('timezone')->default('UTC');
            $table->timestampTz('last_seen_at')->index();
            $table->timestampsTz();
        });
        Schema::create('area_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('area_device_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('kind', 16);
            $table->string('definition');
            $table->jsonb('geometry');
            $table->jsonb('bounds');
            $table->string('geometry_hash', 64);
            $table->string('alert_mode', 16)->default('off');
            $table->boolean('notify_added')->default(true);
            $table->boolean('notify_removed')->default(true);
            $table->string('digest_time', 5)->default('08:00');
            $table->unsignedBigInteger('last_processed_version_id')->default(0);
            $table->unsignedBigInteger('last_read_version_id')->default(0);
            $table->unsignedInteger('pending_added')->default(0);
            $table->unsignedInteger('pending_removed')->default(0);
            $table->unsignedInteger('preference_version')->default(1);
            $table->timestampTz('next_digest_at')->nullable()->index();
            $table->timestampsTz();
            $table->unique(['area_device_id', 'geometry_hash']);
        });
        Schema::create('area_alert_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('area_subscription_id')->constrained()->cascadeOnDelete();
            $table->string('delivery_key');
            $table->unsignedInteger('preference_version');
            $table->jsonb('payload');
            $table->string('status', 16)->default('pending')->index();
            $table->string('ticket_id')->nullable();
            $table->text('error')->nullable();
            $table->timestampTz('sent_at')->nullable();
            $table->timestampsTz();
            $table->unique(['area_subscription_id', 'delivery_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('area_alert_deliveries');
        Schema::dropIfExists('area_subscriptions');
        Schema::dropIfExists('area_devices');
    }
};
