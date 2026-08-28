<?php

use App\Jobs\RefreshMarkerFile;
use App\Services\MarkerFileCache;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Laravel\Horizon\ProvisioningPlan;

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
        ->and($job->timeout)->toBe(600)
        ->and($job->connection)->toBe('redis-long-running')
        ->and($job->queue)->toBe('marker-files')
        ->and($job->backoff())->toBe([60, 300]);
});

test('marker file queue timeout chain prevents duplicate execution', function () {
    $job = new RefreshMarkerFile;
    $supervisorTimeout = config('horizon.defaults.supervisor-marker-files.timeout');
    $retryAfter = config('queue.connections.redis-long-running.retry_after');
    $productionSupervisor = ProvisioningPlan::get('test')
        ->optionsFor('production', 'supervisor-marker-files');

    expect($supervisorTimeout)->toBeInt()
        ->toBeGreaterThan($job->timeout)
        ->and($retryAfter)->toBeInt()
        ->toBeGreaterThan($supervisorTimeout)
        ->and($productionSupervisor)->not->toBeNull()
        ->and($productionSupervisor->connection)->toBe('redis-long-running')
        ->and($productionSupervisor->queue)->toBe('marker-files')
        ->and($productionSupervisor->maxProcesses)->toBe(1)
        ->and($productionSupervisor->timeout)->toBe(660)
        ->and(config('horizon.environments.production'))->toHaveKey('supervisor-marker-files')
        ->and(config('horizon.environments.staging'))->toHaveKey('supervisor-marker-files')
        ->and(config('horizon.environments.local'))->toHaveKey('supervisor-marker-files');
});

test('marker file refresh job generates the cached payload', function () {
    $markerFileCache = Mockery::mock(MarkerFileCache::class);
    $markerFileCache->shouldReceive('refresh')->once()->andReturn('/tmp/markers-v3.json');

    (new RefreshMarkerFile)->handle($markerFileCache);
});

test('marker file refresh job logs terminal failures', function () {
    Log::spy();

    $exception = new RuntimeException('Marker refresh timed out.');

    (new RefreshMarkerFile)->failed($exception);

    Log::shouldHaveReceived('error')
        ->once()
        ->with('Marker file refresh failed.', ['exception' => $exception]);
});
