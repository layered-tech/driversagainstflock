<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('confirmations');
        Schema::dropIfExists('markers');
        Schema::dropIfExists('nodes');
        Schema::dropIfExists('social_accounts');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        throw new LogicException('The retired application tables cannot be restored automatically.');
    }
};
