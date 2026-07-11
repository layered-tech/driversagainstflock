<?php

use App\Repositories\MapRepository;
use App\Services\MarkerFileCache;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

uses(TestCase::class);

function markerFileCacheTestPath(): string
{
    return storage_path('framework/testing/markers-cache-test.json');
}

afterEach(function () {
    File::delete(markerFileCacheTestPath());
    File::delete(markerFileCacheTestPath().'.tmp');
});

it('writes marker points to a reusable json file', function () {
    $markerRepository = mock(MapRepository::class);
    $markerRepository
        ->shouldReceive('lazyMarkerFilePoints')
        ->once()
        ->andReturn([
            [
                'location' => [-88.2, 43.1],
                'properties' => [
                    'id' => 1,
                    'icon' => 'falcon-sr',
                ],
            ],
            [
                'location' => [-122.5, 45.5],
                'properties' => [
                    'id' => 2,
                    'icon' => 'falcon-lr',
                ],
            ],
        ]);

    $markerFileCache = new MarkerFileCache($markerRepository, markerFileCacheTestPath());

    $path = $markerFileCache->refresh();
    $payload = json_decode(File::get($path), true, 512, JSON_THROW_ON_ERROR);

    expect($path)->toBe(markerFileCacheTestPath())
        ->and($payload['points'])->toHaveCount(2)
        ->and($payload['points'][0]['properties']['id'])->toBe(1)
        ->and($payload['points'][1]['location'])->toBe([-122.5, 45.5]);
});

it('reuses an existing marker file without regenerating it', function () {
    File::ensureDirectoryExists(dirname(markerFileCacheTestPath()));
    File::put(markerFileCacheTestPath(), '{"points":[]}');

    $markerRepository = mock(MapRepository::class);
    $markerRepository->shouldNotReceive('lazyMarkerFilePoints');

    $markerFileCache = new MarkerFileCache($markerRepository, markerFileCacheTestPath());

    expect($markerFileCache->getOrCreatePath())->toBe(markerFileCacheTestPath());
});
