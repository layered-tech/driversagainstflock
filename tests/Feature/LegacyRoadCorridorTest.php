<?php

use App\Services\Roads\OpenStreetMapRoadGraphLookup;
use Illuminate\Support\Facades\Http;

test('legacy road corridors return an empty result by default without a lookup', function () {
    Http::fake();
    $this->mock(OpenStreetMapRoadGraphLookup::class)->shouldNotReceive('find');

    $this->getJson('/api/v1/road-corridor?latitude=43.13&longitude=-88.22&radius_meters=3200')
        ->assertOk()
        ->assertExactJson(['ok' => true, 'result' => ['ways' => []]]);

    Http::assertNothingSent();
});
