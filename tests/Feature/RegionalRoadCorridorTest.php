<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Cache::flush();
    config(['road-corridor.release_pointer_key' => null, 'road-corridor.regional_pointer_key' => 'national-pointer.json']);
    Storage::fake('road-corridors');
});

function publishRegionalCorridorFixture(string $release = 'national-release', ?array $previous = null): array
{
    $disk = Storage::disk('road-corridors');
    $tile = '-883_430-'.str_repeat('a', 64).'.jsonl.gz';
    $regions = [];
    foreach (['-45_21', '-61_18', '-75_30', '-79_10'] as $region) {
        $catalog = json_encode(['schema_version' => 1, 'release' => $release, 'region' => $region, 'coverage' => [], 'tiles' => [['key' => 'tiles/'.$tile]]]);
        $disk->put("experimental/road-corridors/{$release}/us/regions/{$region}.json", $catalog);
        $regions[$region] = ['sha256' => hash('sha256', $catalog)];
    }
    $index = json_encode(['schema_version' => 2, 'release' => $release, 'region_degrees' => 2, 'halo_degrees' => 0.3, 'regions' => $regions]);
    $disk->put("experimental/road-corridors/{$release}/us/index.json", $index);
    $pointer = ['schema_version' => 2, 'active_release' => $release, 'catalog_sha256' => hash('sha256', $index)];
    if ($previous) {
        $pointer += ['previous_release' => $previous['active_release'], 'previous_catalog_sha256' => $previous['catalog_sha256']];
    }
    $disk->put('national-pointer.json', json_encode($pointer));

    return $pointer;
}

test('regional discovery serves bounded catalogs including Alaska and Hawaii', function (string $region) {
    publishRegionalCorridorFixture();
    $this->getJson('/api/v2/road-corridor-manifest?region='.$region)->assertOk()
        ->assertJsonPath('catalog.region', $region)->assertJsonPath('catalog.release', 'national-release');
})->with(['-45_21', '-61_18', '-75_30', '-79_10']);

test('legacy discovery and regional fallback still serve Wisconsin', function () {
    publishRegionalCorridorFixture();
    foreach (['/api/v1/road-corridor-manifest', '/api/v2/road-corridor-manifest?region=0_0'] as $url) {
        $this->getJson($url)->assertOk()->assertJsonPath('catalog.release', config('road-corridor.bundled_release'));
    }
    Storage::disk('road-corridors')->delete('national-pointer.json');
    Cache::flush();
    $this->getJson('/api/v2/road-corridor-manifest?region=-45_21')->assertOk()
        ->assertJsonPath('catalog.release', config('road-corridor.bundled_release'));
});

test('regional catalogs have independent conditional responses', function () {
    publishRegionalCorridorFixture();
    $etag = $this->getJson('/api/v2/road-corridor-manifest?region=-45_21')->assertOk()->headers->get('ETag');
    $this->withHeader('If-None-Match', $etag)->getJson('/api/v2/road-corridor-manifest?region=-45_21')->assertStatus(304);
    $this->withHeader('If-None-Match', $etag)->getJson('/api/v2/road-corridor-manifest?region=-61_18')->assertOk();
});

test('regional signing accepts only published catalog tiles in active or previous releases', function () {
    $old = publishRegionalCorridorFixture('old-release');
    publishRegionalCorridorFixture('new-release', $old);
    $tile = '-883_430-'.str_repeat('a', 64).'.jsonl.gz';
    foreach (['new-release', 'old-release'] as $release) {
        $response = $this->getJson("/api/v2/road-corridor-tiles/{$tile}?region=-45_21&release={$release}")->assertOk();
        expect($response->json('url'))->toContain("/{$release}/us/tiles/");
    }
    $this->getJson("/api/v2/road-corridor-tiles/{$tile}?region=-45_21&release=unknown")->assertNotFound();
    $this->getJson('/api/v2/road-corridor-tiles/-883_430-'.str_repeat('b', 64).'.jsonl.gz?region=-45_21&release=new-release')->assertNotFound();
});

test('regional discovery rejects malformed input before storage access', function (string $region) {
    Storage::shouldReceive('disk')->never();
    $this->getJson('/api/v2/road-corridor-manifest?region='.$region)->assertUnprocessable();
})->with(['..%2Fsecret', 'region[]=-45_21', '']);

test('a broken national publication retains the last verified index', function () {
    publishRegionalCorridorFixture();
    $url = '/api/v2/road-corridor-manifest?region=-45_21';
    $this->getJson($url)->assertOk()->assertJsonPath('catalog.release', 'national-release');
    Storage::disk('road-corridors')->put('national-pointer.json', '{bad');
    Cache::forget('road-corridor.regional-pointer.'.hash('sha256', 'national-pointer.json'));
    $this->getJson($url)->assertOk()->assertJsonPath('catalog.release', 'national-release');
});

test('global and regional rollback controls stop national downloads', function () {
    publishRegionalCorridorFixture();
    config(['road-corridor.regional_downloads_enabled' => false]);
    $this->getJson('/api/v2/road-corridor-manifest?region=-45_21')->assertOk()
        ->assertJsonPath('catalog.release', config('road-corridor.bundled_release'));
    $tile = '-883_430-'.str_repeat('a', 64).'.jsonl.gz';
    $this->getJson("/api/v2/road-corridor-tiles/{$tile}?region=-45_21&release=national-release")->assertStatus(503);
    config(['road-corridor.downloads_enabled' => false]);
    Storage::shouldReceive('disk')->never();
    $this->getJson('/api/v2/road-corridor-manifest?region=-45_21')->assertOk()->assertExactJson(['enabled' => false]);
});

test('a corrupted regional catalog is rejected even when its index is valid', function () {
    publishRegionalCorridorFixture();
    Storage::disk('road-corridors')->put('experimental/road-corridors/national-release/us/regions/-45_21.json', '{}');
    $this->getJson('/api/v2/road-corridor-manifest?region=-45_21')->assertStatus(503);
});
