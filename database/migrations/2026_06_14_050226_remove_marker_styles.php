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
        if (Schema::hasColumn('markers', 'style_id')) {
            Schema::table('markers', function (Blueprint $table) {
                $table->dropColumn('style_id');
            });
        }

        Schema::dropIfExists('styles');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasColumn('markers', 'style_id')) {
            Schema::table('markers', function (Blueprint $table) {
                $table->string('style_id')->nullable()->index();
            });
        }

        if (! Schema::hasTable('styles')) {
            Schema::create('styles', function (Blueprint $table) {
                $table->id();
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
    }
};
