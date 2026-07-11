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
        Schema::create('osm_nodes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('node_id')->unique()->comment('The ID of the node from Overpass API');
            $table->unsignedInteger('marker_id')->index()->comment('Foreign key to the markers table');
            $table->decimal('lat', 10, 7)->comment('Latitude of the node');
            $table->decimal('lon', 10, 7)->comment('Longitude of the node');
            $table->json('tags')->nullable()->comment('Tags associated with the node');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('osm_nodes');
    }
};
