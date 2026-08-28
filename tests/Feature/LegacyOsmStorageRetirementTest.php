<?php

use Illuminate\Support\Facades\Artisan;

it('retires the local marker mutation endpoints and models', function (string $endpoint) {
    $this->withoutMiddleware()
        ->postJson($endpoint)
        ->assertNotFound();
})->with([
    '/api/save',
    '/api/delete/1',
    '/api/confirm/1',
]);

it('retires application-local OSM ingestion and cutover commands', function () {
    expect(array_keys(Artisan::all()))
        ->not->toContain('app:fetch-overpass-data')
        ->not->toContain('app:osm2pgsql:sync-nodes')
        ->not->toContain('app:osm2pgsql:update')
        ->not->toContain('app:verify-osm-cutover');
});
