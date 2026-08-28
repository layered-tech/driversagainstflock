<?php

use Illuminate\Support\Facades\Schema;

it('retires the legacy application tables', function () {
    expect(Schema::hasTable('confirmations'))->toBeFalse()
        ->and(Schema::hasTable('markers'))->toBeFalse()
        ->and(Schema::hasTable('nodes'))->toBeFalse()
        ->and(Schema::hasTable('social_accounts'))->toBeFalse()
        ->and(Schema::hasTable('users'))->toBeTrue();
});

it('cannot automatically reverse the retirement', function () {
    $migration = require database_path('migrations/2026_08_28_043658_drop_legacy_osm_and_social_tables.php');

    expect(fn () => $migration->down())
        ->toThrow(LogicException::class, 'The retired application tables cannot be restored automatically.');
});
