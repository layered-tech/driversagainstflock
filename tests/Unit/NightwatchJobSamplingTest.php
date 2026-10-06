<?php

use App\Jobs\ProcessModeration;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Event;
use Laravel\Nightwatch\Facades\Nightwatch;

uses(TestCase::class);

it('samples other queued jobs at one percent before and after moderation jobs', function () {
    $nightwatch = Nightwatch::getFacadeRoot();
    $mock = Mockery::mock();
    $mock->shouldReceive('sample')->withArgs(fn (float $rate): bool => $rate === 0.01)->twice();
    $mock->shouldReceive('dontSample')->once();
    Nightwatch::swap($mock);

    $job = Mockery::mock(Job::class);
    $job->shouldReceive('payload')->andReturn([]);
    $job->shouldReceive('resolveQueuedJobClass')->andReturn('App\\Jobs\\OtherJob');

    $moderationJob = Mockery::mock(Job::class);
    $moderationJob->shouldReceive('payload')->andReturn([]);
    $moderationJob->shouldReceive('resolveQueuedJobClass')->andReturn(ProcessModeration::class);

    try {
        Event::dispatch(new JobProcessing('redis', $job));
        Event::dispatch(new JobProcessing('redis', $moderationJob));
        Event::dispatch(new JobProcessing('redis', $job));
    } finally {
        Nightwatch::swap($nightwatch);
    }
});
