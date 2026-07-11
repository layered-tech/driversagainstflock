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
        Schema::table('nodes', function (Blueprint $table) {
            $table->index(['created_at', 'id'], 'nodes_hotlist_created_at_id_index');
            $table->index(['surveillance_type', 'created_at', 'id'], 'nodes_hotlist_type_created_at_id_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropIndex('nodes_hotlist_type_created_at_id_index');
            $table->dropIndex('nodes_hotlist_created_at_id_index');
        });
    }
};
