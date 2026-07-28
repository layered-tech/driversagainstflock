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
        Schema::create('api_logs', function (Blueprint $table) {
            $table->id();
            $table->string('method', 10);
            $table->string('request_path', 2048);
            $table->unsignedSmallInteger('status');
            $table->unsignedInteger('elapsed_ms');
            $table->jsonb('request_headers');
            $table->jsonb('request_payload');
            $table->jsonb('response_headers');
            $table->jsonb('response_payload')->nullable();
            $table->timestamps();

            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('api_logs');
    }
};
