<?php

use App\Jobs\DrainModerationSummaries;
use App\Jobs\ProcessModeration;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Queue\Events\JobQueued;
use Illuminate\Queue\Events\JobQueueing;
use Illuminate\Support\Facades\Event;
use Laravel\Nightwatch\Contracts\Ingest;
use Laravel\Nightwatch\Facades\Nightwatch;

uses(TestCase::class);

it('rejects enqueue events from sampled executions', function (string $jobClass) {
    $nightwatch = Nightwatch::getFacadeRoot();
    $nightwatch->config['enabled'] = true;
    $ingest = Mockery::mock(Ingest::class);
    $ingest->shouldReceive('shouldDigestWhenBufferIsFull')->with(true)->once();
    $ingest->shouldNotReceive('write');
    $nightwatch->ingest = $ingest;

    Nightwatch::sample(rate: 1.0);

    $payload = json_encode(['uuid' => 'queued-job-test'], JSON_THROW_ON_ERROR);
    Nightwatch::queuedJob(new JobQueueing('redis', 'default', $jobClass, $payload, null));
    Nightwatch::queuedJob(new JobQueued('redis', 'default', 'queued-job-test', $jobClass, $payload, null));

    expect(Nightwatch::sampling())->toBeTrue();
})->with([
    'moderation' => ProcessModeration::class,
    'summary drain' => DrainModerationSummaries::class,
    'other job' => 'App\\Jobs\\OtherJob',
]);

it('captures all other queued jobs before and after excluded jobs', function (string $excludedJobClass) {
    $nightwatch = Nightwatch::getFacadeRoot();
    $mock = Mockery::mock();
    $mock->shouldReceive('sample')->withArgs(fn (float $rate): bool => $rate === 1.0)->twice();
    $mock->shouldReceive('dontSample')->once();
    Nightwatch::swap($mock);

    $job = Mockery::mock(Job::class);
    $job->shouldReceive('payload')->andReturn([]);
    $job->shouldReceive('resolveQueuedJobClass')->andReturn('App\\Jobs\\OtherJob');

    $moderationJob = Mockery::mock(Job::class);
    $moderationJob->shouldReceive('payload')->andReturn([]);
    $moderationJob->shouldReceive('resolveQueuedJobClass')->andReturn($excludedJobClass);

    try {
        Event::dispatch(new JobProcessing('redis', $job));
        Event::dispatch(new JobProcessing('redis', $moderationJob));
        Event::dispatch(new JobProcessing('redis', $job));
    } finally {
        Nightwatch::swap($nightwatch);
    }
})->with([
    'moderation' => ProcessModeration::class,
    'summary drain' => DrainModerationSummaries::class,
]);
