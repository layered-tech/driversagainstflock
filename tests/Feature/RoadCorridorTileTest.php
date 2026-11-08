<?php

use Illuminate\Support\Facades\Storage;

test('retired Wisconsin tile URLs never sign storage objects', function (string $tile, string $query) {
    Storage::shouldReceive('disk')->never();

    $this->getJson('/api/v1/road-corridor-tiles/'.$tile.$query)->assertNotFound();
})->with([
    ['-895_430-'.str_repeat('a', 64).'.jsonl.gz', ''],
    ['-895_430-'.str_repeat('a', 64).'.jsonl.gz', '?release=20261019T043000Z-us-v1'],
    ['manifest.json', ''],
    ['source.osm.pbf', ''],
    ['-895_430-invalid.jsonl.gz', ''],
]);
