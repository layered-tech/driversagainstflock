<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->withoutMiddleware();

    Cache::flush();

    config([
        'directions.overpass_url' => 'https://overpass.test/api/interpreter',
        'directions.speed_limit_cache_seconds' => 30,
        'directions.speed_limit_radius_meters' => 10,
    ]);
});

it('returns the nearest osm maxspeed as mph', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [
                [
                    'type' => 'way',
                    'id' => 100,
                    'tags' => [
                        'highway' => 'residential',
                        'maxspeed' => '35 mph',
                    ],
                    'geometry' => [
                        ['lat' => 45.5228, 'lon' => -122.6762],
                        ['lat' => 45.5232, 'lon' => -122.6758],
                    ],
                ],
                [
                    'type' => 'way',
                    'id' => 200,
                    'tags' => [
                        'highway' => 'primary',
                        'maxspeed' => '80',
                    ],
                    'geometry' => [
                        ['lat' => 45.5290, 'lon' => -122.6810],
                        ['lat' => 45.5300, 'lon' => -122.6820],
                    ],
                ],
            ],
        ]),
    ]);

    $this->getJson('/api/v1/speed-limit?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('result.osm_way_id', 100)
        ->assertJsonPath('result.maxspeed', '35 mph')
        ->assertJsonPath('result.speed_limit_mph', 35)
        ->assertJsonPath('result.unit', 'mph');

    Http::assertSent(fn ($request) => str_contains($request->url(), 'overpass.test')
        && str_contains($request->data()['data'] ?? '', '["highway"]["maxspeed"]'));
});

it('converts numeric osm maxspeed values from kilometers per hour', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'type' => 'way',
                'id' => 300,
                'tags' => [
                    'highway' => 'secondary',
                    'maxspeed' => '80',
                ],
                'geometry' => [
                    ['lat' => 45.5230, 'lon' => -122.6762],
                    ['lat' => 45.5230, 'lon' => -122.6758],
                ],
            ]],
        ]),
    ]);

    $this->getJson('/api/v1/speed-limit?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonPath('result.speed_limit_mph', 50);
});

it('returns null when nearby ways do not have parseable maxspeed values', function () {
    Http::fake([
        'https://overpass.test/api/interpreter' => Http::response([
            'elements' => [[
                'type' => 'way',
                'id' => 400,
                'tags' => [
                    'highway' => 'secondary',
                    'maxspeed' => 'signals',
                ],
                'geometry' => [
                    ['lat' => 45.5230, 'lon' => -122.6762],
                    ['lat' => 45.5230, 'lon' => -122.6758],
                ],
            ]],
        ]),
    ]);

    $this->getJson('/api/v1/speed-limit?latitude=45.523&longitude=-122.676')
        ->assertOk()
        ->assertJsonPath('result', null);
});
