<?php

use Illuminate\Contracts\Queue\Job;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Event;
use Laravel\Nightwatch\Facades\Nightwatch;
use Tests\TestCase;

uses(TestCase::class);

it('samples each queued job at one percent', function () {
    $nightwatch = Nightwatch::getFacadeRoot();
    $mock = Mockery::mock();
    $mock->shouldReceive('sample')->withArgs(fn (float $rate): bool => $rate === 0.01)->twice();
    Nightwatch::swap($mock);

    $job = Mockery::mock(Job::class);
    $job->shouldReceive('payload')->andReturn([]);

    try {
        Event::dispatch(new JobProcessing('redis', $job));
        Event::dispatch(new JobProcessing('redis', $job));
    } finally {
        Nightwatch::swap($nightwatch);
    }
});
