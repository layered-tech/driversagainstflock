<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('moderation_flags', function (Blueprint $table): void {
            $table->string('source')->default('rule')->index();
            $table->unsignedBigInteger('rule_id')->nullable()->change();
            $table->unsignedInteger('rule_version')->nullable()->change();
        });
        DB::statement("CREATE UNIQUE INDEX moderation_presence_node_unique ON moderation_flags (node_id) WHERE source = 'alpr_presence'");
        DB::statement("ALTER TABLE moderation_flags ADD CONSTRAINT moderation_flag_source_check CHECK ((source = 'rule' AND rule_id IS NOT NULL AND rule_version IS NOT NULL) OR (source = 'alpr_presence' AND rule_id IS NULL AND rule_version IS NULL AND related_node_id = 0))");
        Schema::create('alpr_presence_reports', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('osm_node_id')->index();
            $table->string('response');
            $table->string('platform');
            $table->timestampTz('passed_at', 3);
            $table->timestampTz('occurred_at', 3)->index();
            $table->timestampTz('submitted_at', 3);
            $table->timestampTz('received_at', 3)->index();
            $table->jsonb('observed')->nullable();
            $table->unsignedInteger('server_node_version');
            $table->double('server_latitude')->nullable();
            $table->double('server_longitude')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reporter_key', 64);
            $table->string('event_key', 128);
            $table->string('payload_hash', 64);
            $table->foreignId('moderation_flag_id')->nullable()->constrained('moderation_flags')->restrictOnDelete();
            $table->unique(['reporter_key', 'event_key']);
            $table->index(['osm_node_id', 'occurred_at']);
        });
        DB::statement("ALTER TABLE alpr_presence_reports ADD CONSTRAINT alpr_presence_response_check CHECK (response = 'not_there')");
    }

    public function down(): void
    {
        Schema::dropIfExists('alpr_presence_reports');
        DB::statement('ALTER TABLE moderation_flags DROP CONSTRAINT moderation_flag_source_check');
        DB::statement('DROP INDEX moderation_presence_node_unique');
        DB::table('moderation_flags')->where('source', 'alpr_presence')->delete();
        Schema::table('moderation_flags', function (Blueprint $table): void {
            $table->dropColumn('source');
            $table->unsignedBigInteger('rule_id')->nullable(false)->change();
            $table->unsignedInteger('rule_version')->nullable(false)->change();
        });
    }
};
