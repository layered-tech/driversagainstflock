<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('alpr_presence_reports', function (Blueprint $table): void {
            $table->unique('event_key');
            $table->dropUnique(['reporter_key', 'event_key']);
            $table->dropForeign(['user_id']);
            $table->dropColumn(['reporter_key', 'user_id']);
        });
    }

    /** Reporter identities cannot be restored after this privacy change. */
    public function down(): void
    {
        throw new LogicException('Use a forward migration to change ALPR report identity storage.');
    }
};
