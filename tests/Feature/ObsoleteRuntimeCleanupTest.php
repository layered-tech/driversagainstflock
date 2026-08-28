<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

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

test('application environment example omits retired osm settings', function () {
    $environmentKeys = Str::of((string) file_get_contents(base_path('.env.example')))
        ->explode("\n")
        ->filter(fn (string $line): bool => Str::contains($line, '='))
        ->map(fn (string $line): string => Str::before($line, '='));

    collect([
        'OSM_READER_ENABLED',
        'OVERPASS_INGESTION_ENABLED',
        'OSM_READER_MAXIMUM_SOURCE_AGE_MINUTES',
        'OPENSTREETMAP_CLIENT_ID',
        'OPENSTREETMAP_CLIENT_SECRET',
        'OPENSTREETMAP_REDIRECT_URI',
        'MOBILE_AUTH_REDIRECT_SCHEMES',
        'MOBILE_AUTH_CODE_EXPIRES_MINUTES',
    ])->each(fn (string $key) => expect($environmentKeys)->not->toContain($key));

    expect($environmentKeys->filter(
        fn (string $key): bool => Str::startsWith($key, 'OSM2PGSQL_'),
    ))->toBeEmpty();

    collect([
        'OSM_READER_CONNECTION',
        'OSM_READER_TABLE',
        'OSM_READER_HOST',
        'OSM_READER_PORT',
        'OSM_READER_DATABASE',
        'OSM_READER_USERNAME',
        'OSM_READER_PASSWORD',
        'OSM_READER_SSLMODE',
        'OPENSTREETMAP_API_URL',
    ])->each(fn (string $key) => expect($environmentKeys)->toContain($key));
});
