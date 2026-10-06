<?php

use App\Jobs\DrainModerationSummaries;
use App\Jobs\ProcessModeration;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Http\Request;
use Illuminate\Pipeline\Pipeline;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Laravel\Nightwatch\Contracts\Ingest;
use Laravel\Nightwatch\Facades\Nightwatch;
use Laravel\Nightwatch\Http\Middleware\Sample;

uses(TestCase::class);

beforeEach(function () {
    $nightwatch = Nightwatch::getFacadeRoot();
    $nightwatch->config['enabled'] = true;
    $nightwatch->config['sampling']['exceptions'] = 1.0;
    $ingest = Mockery::mock(Ingest::class);
    $ingest->shouldReceive('shouldDigestWhenBufferIsFull')->with(false)->once();
    $ingest->shouldReceive('shouldDigestWhenBufferIsFull')->with(true)->once();
    $ingest->shouldReceive('writeNow')->withArgs(fn (array $record): bool => $record['t'] === 'exception')->once();
    $nightwatch->ingest = $ingest;
});

it('never samples moderation routes but captures their exceptions', function () {
    $routes = collect(Route::getRoutes())->filter(fn ($route): bool => str_starts_with($route->getName() ?? '', 'moderation.'));

    expect($routes)->not->toBeEmpty();

    foreach ($routes as $route) {
        expect($route->gatherMiddleware())->toContain(Sample::never());
    }

    expect(Route::getRoutes()->getByName('profile.edit')->gatherMiddleware())->not->toContain(Sample::never());

    $middleware = array_values(array_filter(
        $routes->first()->gatherMiddleware(),
        fn (string $middleware): bool => str_starts_with($middleware, Sample::class.':'),
    ));

    app(Pipeline::class)->send(Request::create('/moderation'))->through($middleware)->then(function (): void {
        expect(Nightwatch::sampling())->toBeFalse();

        Nightwatch::report(new RuntimeException('Moderation request failed'), handled: false);

        expect(Nightwatch::sampling())->toBeTrue();
    });
});

it('never samples moderation jobs but captures their exceptions', function (string $jobClass) {
    $job = Mockery::mock(Job::class);
    $job->shouldReceive('payload')->andReturn([]);
    $job->shouldReceive('resolveQueuedJobClass')->andReturn($jobClass);

    Event::dispatch(new JobProcessing('redis', $job));

    expect(Nightwatch::sampling())->toBeFalse();

    Nightwatch::report(new RuntimeException('Moderation job failed'), handled: false);

    expect(Nightwatch::sampling())->toBeTrue();
})->with([
    'processing' => ProcessModeration::class,
    'summary drain' => DrainModerationSummaries::class,
]);
