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
        Schema::table('markers', function (Blueprint $table) {
            $table->softDeletes();
        });

        Schema::create('confirmations', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('marker_id')->index();
            $table->unsignedInteger('user_id')->index();
            $table->timestamps();

            $table->index(['marker_id', 'user_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('markers', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });

        Schema::dropIfExists('confirmations');
    }
};
