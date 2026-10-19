<?php

use Illuminate\Support\Facades\Storage;

test('issues a temporary URL only inside the fixed Wisconsin artifact', function () {
    $tile = '-895_430-'.str_repeat('a', 64).'.jsonl.gz';
    $disk = Mockery::mock();
    Storage::shouldReceive('disk')->once()->with('road-corridors')->andReturn($disk);
    $disk->shouldReceive('temporaryUrl')->once()->with(
        'experimental/road-corridors/20261019T043000Z-us-v1/wisconsin/tiles/'.$tile,
        Mockery::on(fn ($expiry) => $expiry->isFuture() && $expiry->lessThan(now()->addMinutes(16))),
    )->andReturn('https://example.com/signed-tile');

    $this->getJson('/api/v1/road-corridor-tiles/'.$tile)
        ->assertOk()->assertJsonPath('url', 'https://example.com/signed-tile')
        ->assertHeader('Cache-Control', 'no-store, private');
});

test('rejects arbitrary object names', function (string $tile) {
    Storage::shouldReceive('disk')->never();
    $this->getJson('/api/v1/road-corridor-tiles/'.$tile)->assertNotFound();
})->with(['manifest.json', 'source.osm.pbf', '-895_430-invalid.jsonl.gz']);
