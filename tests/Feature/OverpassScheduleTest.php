<?php

use Illuminate\Console\Scheduling\Schedule;

it('keeps the scheduled Overpass import behind the production cutover flag', function () {
    $event = collect(app(Schedule::class)->events())
        ->first(fn ($event): bool => str_contains($event->command ?? '', 'app:fetch-overpass-data'));

    expect($event)->not->toBeNull();

    config(['osm.overpass_ingestion_enabled' => true]);
    expect($event->filtersPass(app()))->toBeTrue();

    config(['osm.overpass_ingestion_enabled' => false]);
    expect($event->filtersPass(app()))->toBeFalse();
});
