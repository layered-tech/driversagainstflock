<?php

use App\Console\Commands\FetchOverpassDataCommand;
use App\Console\Commands\RefreshMarkerFileCommand;
use Illuminate\Support\Facades\Schedule;

Schedule::command(FetchOverpassDataCommand::class, ['--all', '--full'])
    ->hourly()
    ->withoutOverlapping(3600)
    ->onOneServer();

//Schedule::command(Osm2pgsqlReplicationUpdateCommand::class)
//    ->everyMinute()
//    ->withoutOverlapping(60)
//    ->onOneServer();

Schedule::command(RefreshMarkerFileCommand::class)
    ->daily()
    ->withoutOverlapping();

Schedule::command('telescope:prune')->environments(['local', 'staging'])->daily();
