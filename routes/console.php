<?php

use App\Console\Commands\RefreshMarkerFileCommand;
use Illuminate\Support\Facades\Schedule;

Schedule::command(RefreshMarkerFileCommand::class)
    ->daily()
    ->withoutOverlapping();

Schedule::command('telescope:prune')->environments(['local', 'staging'])->daily();
