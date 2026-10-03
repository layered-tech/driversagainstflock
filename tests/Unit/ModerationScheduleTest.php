<?php

use Carbon\CarbonImmutable;
use Cron\CronExpression;
use Illuminate\Console\Scheduling\Schedule as ConsoleSchedule;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Env;
use Illuminate\Support\Facades\Schedule;

pest()->extend(TestCase::class);

beforeEach(function () {
    $environment = Env::getRepository();
    $this->moderationEnvironment = [];
    foreach (['OUTCOMES', 'RULES', 'PROFILES', 'SUMMARIES', 'WARM'] as $kind) {
        foreach (['ENABLED', 'CRON'] as $setting) {
            $key = 'MODERATION_'.$kind.'_'.$setting;
            $this->moderationEnvironment[$key] = $environment->get($key);
            $environment->clear($key);
        }
    }

    $configuration = require base_path('config/moderation.php');
    config(['moderation.schedules' => $configuration['schedules']]);
    Schedule::swap(new ConsoleSchedule);
    require base_path('routes/console.php');
});

afterEach(function () {
    $environment = Env::getRepository();
    foreach ($this->moderationEnvironment as $key => $value) {
        $value === null ? $environment->clear($key) : $environment->set($key, $value);
    }
});

test('moderation tasks run at the requested intervals in UTC', function (string $kind, int $minutes, string $firstRun) {
    $event = collect(Schedule::events())->first(fn ($event): bool => str_contains($event->command ?? '', 'moderation:process '.$kind));

    expect($event)->not->toBeNull()
        ->and($event->timezone)->toBe('UTC')
        ->and($event->withoutOverlapping)->toBeTrue()
        ->and($event->onOneServer)->toBeTrue();

    $runs = (new CronExpression($event->expression))->getMultipleRunDates(3, '2026-01-01 00:00:00', false, true, 'UTC');

    expect($runs[0]->format('Y-m-d H:i:s'))->toBe($firstRun);
    foreach (array_slice($runs, 1) as $index => $run) {
        expect(($run->getTimestamp() - $runs[$index]->getTimestamp()) / 60)->toEqual($minutes);
    }
})->with([
    'rules' => ['rules', 180, '2026-01-01 00:00:00'],
    'profiles' => ['profiles', 1440, '2026-01-01 03:00:00'],
    'summaries' => ['summaries', 60, '2026-01-01 00:05:00'],
    'warm' => ['warm', 5, '2026-01-01 00:00:00'],
]);

test('outcomes run every 48 hours across calendar boundaries', function (string $start) {
    $event = collect(Schedule::events())->first(fn ($event): bool => str_contains($event->command ?? '', 'moderation:process outcomes'));
    $start = CarbonImmutable::parse($start, 'UTC');
    $runs = [];

    for ($hour = 0; $hour < 192; $hour++) {
        $date = $start->addHours($hour);
        $this->travelTo($date);
        if ($event->isDue($this->app) && $event->filtersPass($this->app)) {
            $runs[] = $date;
        }
    }

    expect($runs)->toHaveCount(4);
    foreach (array_slice($runs, 1) as $index => $run) {
        expect($runs[$index]->diffInHours($run))->toEqual(48)
            ->and($run->format('H:i'))->toBe('00:00');
    }
})->with(['2026-01-29', '2026-02-26', '2026-12-29']);

test('legacy rebuild environment settings cannot schedule an automatic rebuild', function () {
    $environment = Env::getRepository();
    $settings = ['MODERATION_SUMMARIES_REBUILD_ENABLED' => 'true', 'MODERATION_SUMMARIES_REBUILD_CRON' => '* * * * *'];
    $original = [];
    foreach ($settings as $key => $value) {
        $original[$key] = $environment->get($key);
        $environment->set($key, $value);
    }

    try {
        $configuration = require base_path('config/moderation.php');
        config(['moderation.schedules' => $configuration['schedules']]);
        Schedule::swap(new ConsoleSchedule);
        require base_path('routes/console.php');

        $commands = collect(Schedule::events())->pluck('command')->filter();

        expect($commands->contains(fn (string $command): bool => str_contains($command, 'moderation:process summaries')))->toBeTrue()
            ->and($commands->contains(fn (string $command): bool => str_contains($command, '--rebuild')))->toBeFalse();
    } finally {
        foreach ($original as $key => $value) {
            $value === null ? $environment->clear($key) : $environment->set($key, $value);
        }
    }
});
