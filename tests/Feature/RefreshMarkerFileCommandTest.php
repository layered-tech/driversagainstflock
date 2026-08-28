<?php

use App\Jobs\RefreshMarkerFile;
use App\Services\MarkerFileCache;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Queue;

test('marker file refresh command dispatches a unique queued job', function () {
    Queue::fake();

    $this->artisan('markers:refresh-file')
        ->expectsOutputToContain('Marker file refresh queued.')
        ->assertSuccessful();

    Queue::assertPushed(RefreshMarkerFile::class, 1);

    $job = new RefreshMarkerFile;

    expect($job)
        ->toBeInstanceOf(ShouldQueue::class)
        ->toBeInstanceOf(ShouldBeUnique::class)
        ->and($job->tries)->toBe(3)
        ->and($job->timeout)->toBe(55)
        ->and($job->backoff())->toBe([60, 300]);
});

test('marker file refresh job generates the cached payload', function () {
    $markerFileCache = Mockery::mock(MarkerFileCache::class);
    $markerFileCache->shouldReceive('refresh')->once()->andReturn('/tmp/markers-v3.json');

    (new RefreshMarkerFile)->handle($markerFileCache);
});
