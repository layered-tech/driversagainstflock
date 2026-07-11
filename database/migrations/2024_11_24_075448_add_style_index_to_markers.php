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
            $table->string('style_id')->nullable()->index()->after('bearing');
        });

        Schema::create('styles', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('circle_color')->nullable()->index();
            $table->string('stroke_color')->nullable()->index();
            $table->string('viewport_fill_color')->nullable()->index();
            $table->string('viewport_line_color')->nullable()->index();
            $table->string('cluster_circle_color')->nullable()->index();
            $table->string('cluster_stroke_color')->nullable()->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('markers', function (Blueprint $table) {
            $table->dropColumn('style_id');
        });

        Schema::dropIfExists('styles');
    }
};
