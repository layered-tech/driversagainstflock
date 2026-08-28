<?php

use App\Console\Commands\FetchOverpassDataCommand;
use App\Console\Commands\RefreshMarkerFileCommand;
use Illuminate\Support\Facades\Schedule;

Schedule::command(FetchOverpassDataCommand::class, ['--all', '--full'])
    ->hourly()
    ->withoutOverlapping(3600)
    ->onOneServer()
    ->when(fn (): bool => (bool) config('osm.overpass_ingestion_enabled'));

// Schedule::command(Osm2pgsqlReplicationUpdateCommand::class)
//    ->everyMinute()
//    ->withoutOverlapping(60)
//    ->onOneServer();

Schedule::command(RefreshMarkerFileCommand::class)
    ->daily()
    ->withoutOverlapping();

Schedule::command('telescope:prune')->environments(['local', 'staging'])->daily();
