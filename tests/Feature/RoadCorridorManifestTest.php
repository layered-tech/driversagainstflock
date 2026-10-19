<?php

use App\Services\RoadCorridorReleases;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    config(['road-corridor.release_pointer_key' => null]);
    Cache::flush();
});

test('discovers the bundled Wisconsin release without an S3 request', function () {
    Storage::shouldReceive('disk')->never();
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()
        ->assertJsonPath('enabled', true)->assertJsonPath('catalog.schema_version', 1)
        ->assertJsonPath('catalog.release', config('road-corridor.bundled_release'))
        ->assertHeader('Cache-Control', 'no-store, private');
});

test('rollback disables discovery and tile signing without touching S3', function () {
    config(['road-corridor.downloads_enabled' => false]);
    Storage::shouldReceive('disk')->never();
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertExactJson(['enabled' => false]);
    $this->getJson('/api/v1/road-corridor-tiles/-883_430-'.str_repeat('a', 64).'.jsonl.gz')->assertStatus(503);
});

test('discovers a configured immutable release and rejects a mismatched catalog', function () {
    config(['road-corridor.active_release' => 'new-release']);
    Storage::fake('road-corridors');
    $key = 'experimental/road-corridors/new-release/wisconsin/mobile-catalog.json';
    Storage::disk('road-corridors')->put($key, json_encode(['schema_version' => 1, 'release' => 'new-release', 'tiles' => [], 'coverage' => []]));
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertJsonPath('catalog.release', 'new-release');
    Cache::flush();
    Storage::disk('road-corridors')->put($key, json_encode(['release' => 'wrong-release']));
    $this->getJson('/api/v1/road-corridor-manifest')->assertStatus(503);
});

test('tile signing accepts only configured releases and preserves the old client default', function () {
    config(['road-corridor.active_release' => 'new-release', 'road-corridor.previous_release' => 'old-release']);
    $tile = '-883_430-'.str_repeat('a', 64).'.jsonl.gz';
    $disk = Mockery::mock();
    Storage::shouldReceive('disk')->twice()->with('road-corridors')->andReturn($disk);
    foreach (['new-release', 'old-release'] as $release) {
        $disk->shouldReceive('temporaryUrl')->once()->with("experimental/road-corridors/{$release}/wisconsin/tiles/{$tile}", Mockery::any())->andReturn('https://example.com/tile');
        $this->getJson("/api/v1/road-corridor-tiles/{$tile}?release={$release}")->assertOk();
    }
    foreach (['unapproved', '..%2Fsecret', ''] as $release) {
        $this->getJson("/api/v1/road-corridor-tiles/{$tile}?release={$release}")->assertNotFound();
    }
});

test('unchanged catalogs use conditional responses while rollback takes effect immediately', function () {
    $etag = $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->headers->get('ETag');
    $this->withHeader('If-None-Match', $etag)->getJson('/api/v1/road-corridor-manifest')->assertStatus(304);
    config(['road-corridor.downloads_enabled' => false]);
    $this->withHeader('If-None-Match', $etag)->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertJsonPath('enabled', false);
});

test('follows a verified publication pointer and signs active and previous tiles', function () {
    config(['road-corridor.active_release' => null, 'road-corridor.release_pointer_key' => 'experimental/road-corridors/wisconsin/current.json']);
    Storage::fake('road-corridors');
    $disk = Storage::disk('road-corridors');
    $catalog = json_encode(['schema_version' => 1, 'release' => 'scheduled-release', 'tiles' => [], 'coverage' => []]);
    $disk->put('experimental/road-corridors/scheduled-release/wisconsin/mobile-catalog.json', $catalog);
    $disk->put(config('road-corridor.release_pointer_key'), json_encode([
        'schema_version' => 1, 'active_release' => 'scheduled-release', 'previous_release' => 'older-release', 'catalog_sha256' => hash('sha256', $catalog),
    ]));
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertJsonPath('catalog.release', 'scheduled-release');
    $published = app(RoadCorridorReleases::class)->current();
    expect($published['previous_release'])->toBe('older-release');
    $tile = '-883_430-'.str_repeat('a', 64).'.jsonl.gz';
    $this->getJson('/api/v1/road-corridor-tiles/'.$tile.'?release=older-release')->assertOk();
});

test('an invalid new pointer or catalog retains the last verified release', function () {
    $key = 'experimental/road-corridors/wisconsin/current.json';
    config(['road-corridor.active_release' => null, 'road-corridor.release_pointer_key' => $key]);
    Storage::fake('road-corridors');
    $disk = Storage::disk('road-corridors');
    $catalog = json_encode(['release' => 'working', 'tiles' => [], 'coverage' => []]);
    $disk->put('experimental/road-corridors/working/wisconsin/mobile-catalog.json', $catalog);
    $disk->put($key, json_encode(['schema_version' => 1, 'active_release' => 'working', 'catalog_sha256' => hash('sha256', $catalog)]));
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertJsonPath('catalog.release', 'working');
    $disk->put($key, json_encode(['schema_version' => 1, 'active_release' => 'broken', 'catalog_sha256' => str_repeat('a', 64)]));
    Cache::forget('road-corridor.pointer.'.hash('sha256', $key));
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertJsonPath('catalog.release', 'working');
});

test('manual release override and service rollback do not depend on the publication pointer', function () {
    config(['road-corridor.active_release' => config('road-corridor.bundled_release'), 'road-corridor.release_pointer_key' => 'pointer.json']);
    Storage::shouldReceive('disk')->never();
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertJsonPath('catalog.release', config('road-corridor.bundled_release'));
    config(['road-corridor.downloads_enabled' => false]);
    $this->getJson('/api/v1/road-corridor-manifest')->assertOk()->assertExactJson(['enabled' => false]);
});
