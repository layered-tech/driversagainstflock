<?php

use App\Console\Commands\RefreshMarkerFileCommand;
use App\Jobs\ReconcileAlprPresenceReports;
use Illuminate\Support\Facades\Schedule;

Schedule::command(RefreshMarkerFileCommand::class)
    ->daily()
    ->withoutOverlapping();

Schedule::command('telescope:prune')->environments(['local', 'staging'])->daily();

foreach (config('moderation.schedules', []) as $kind => $settings) {
    if ($settings['enabled']) {
        $event = Schedule::command('moderation:process '.$kind)->cron($settings['cron'])->timezone('UTC')->withoutOverlapping()->onOneServer();
        if (isset($settings['every_days'])) {
            $event->when(function () use ($settings): bool {
                $daysSinceEpoch = intdiv(now('UTC')->getTimestamp(), 86400);

                return $daysSinceEpoch % $settings['every_days'] === 0;
            });
        }
    }
}

Schedule::job(new ReconcileAlprPresenceReports)->everyFiveMinutes()->withoutOverlapping();

Schedule::command('horizon:snapshot')->everyFiveMinutes();
