<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;

test('obsolete backend OAuth endpoints are unavailable', function () {
    expect(Route::has('auth.openstreetmap.redirect'))->toBeFalse()
        ->and(Route::has('auth.openstreetmap.callback'))->toBeFalse()
        ->and(Route::has('auth.openstreetmap.register'))->toBeFalse()
        ->and(Route::has('auth.openstreetmap.register.store'))->toBeFalse();

    $this->get('/auth/openstreetmap/redirect')->assertNotFound();
    $this->postJson('/api/oauth/mobile/token')->assertNotFound();
});

test('obsolete directions provider verification command is unavailable', function () {
    expect(Artisan::all())->not->toHaveKey('directions:verify-providers');
});
