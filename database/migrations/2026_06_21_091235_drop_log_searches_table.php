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
        Schema::dropIfExists('log_searches');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::create('log_searches', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id')->nullable();
            $table->string('term');
            $table->timestamps();
        });
    }
};
