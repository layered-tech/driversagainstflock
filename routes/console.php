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
        Schedule::command($settings['command'] ?? 'moderation:process '.$kind)->cron($settings['cron'])->timezone('UTC')->withoutOverlapping()->onOneServer();
    }
}

Schedule::job(new ReconcileAlprPresenceReports)->everyFiveMinutes()->withoutOverlapping();
