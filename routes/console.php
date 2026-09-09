<?php

use App\Console\Commands\RefreshMarkerFileCommand;
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
