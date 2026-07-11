<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->withoutMiddleware();

    Cache::flush();
});

it('returns the locality boundary for a zip code', function () {
    Http::fake([
        'https://nominatim.openstreetmap.org/search*' => Http::sequence()
            ->push([[
                'address' => [
                    'city' => 'San Francisco',
                    'state' => 'California',
                    'postcode' => '94103',
                ],
                'lat' => '37.7726',
                'lon' => '-122.4099',
            ]])
            ->push([
                'type' => 'FeatureCollection',
                'features' => [[
                    'type' => 'Feature',
                    'geometry' => [
                        'type' => 'Polygon',
                        'coordinates' => [[
                            [-122.52, 37.7],
                            [-122.35, 37.7],
                            [-122.35, 37.84],
                            [-122.52, 37.84],
                            [-122.52, 37.7],
                        ]],
                    ],
                    'properties' => [
                        'name' => 'San Francisco',
                        'osm_id' => 111968,
                        'osm_type' => 'relation',
                        'address' => [
                            'city' => 'San Francisco',
                            'state' => 'California',
                        ],
                    ],
                ]],
            ]),
    ]);

    $this->getJson('/api/locality-boundary?zip=94103')
        ->assertOk()
        ->assertJsonPath('zip', '94103')
        ->assertJsonPath('name', 'San Francisco')
        ->assertJsonPath('state', 'California')
        ->assertJsonPath('source', 'OpenStreetMap Nominatim')
        ->assertJsonPath('bounds.sw.0', -122.52)
        ->assertJsonPath('bounds.sw.1', 37.7)
        ->assertJsonPath('bounds.ne.0', -122.35)
        ->assertJsonPath('bounds.ne.1', 37.84)
        ->assertJsonPath('boundary.features.0.geometry.type', 'Polygon')
        ->assertJsonPath('boundary.features.0.properties.zip', '94103');

    Http::assertSent(fn ($request) => str_contains($request->url(), 'postalcode=94103')
        && str_contains(implode(',', $request->header('User-Agent')), 'locality boundary lookup'));
    Http::assertSent(fn ($request) => str_contains(urldecode($request->url()), 'city=San Francisco')
        && str_contains($request->url(), 'polygon_geojson=1'));
});

it('caches successful boundary lookups', function () {
    Http::fake([
        'https://nominatim.openstreetmap.org/search*' => Http::sequence()
            ->push([[
                'address' => [
                    'city' => 'Austin',
                    'state' => 'Texas',
                ],
            ]])
            ->push([
                'type' => 'FeatureCollection',
                'features' => [[
                    'type' => 'Feature',
                    'geometry' => [
                        'type' => 'Polygon',
                        'coordinates' => [[
                            [-97.94, 30.1],
                            [-97.56, 30.1],
                            [-97.56, 30.52],
                            [-97.94, 30.52],
                            [-97.94, 30.1],
                        ]],
                    ],
                    'properties' => [
                        'name' => 'Austin',
                        'address' => [
                            'city' => 'Austin',
                            'state' => 'Texas',
                        ],
                    ],
                ]],
            ])
            ->whenEmpty(Http::response([], 500)),
    ]);

    $this->getJson('/api/locality-boundary?zip=78701')->assertOk();
    $this->getJson('/api/locality-boundary?zip=78701')
        ->assertOk()
        ->assertJsonPath('name', 'Austin');

    Http::assertSentCount(2);
});

it('returns not found when no locality boundary is available', function () {
    Http::fake([
        'https://nominatim.openstreetmap.org/search*' => Http::sequence()
            ->push([[
                'address' => [
                    'city' => 'Boundaryless',
                    'state' => 'Texas',
                ],
            ]])
            ->push([
                'type' => 'FeatureCollection',
                'features' => [],
            ]),
    ]);

    $this->getJson('/api/locality-boundary?zip=73301')
        ->assertNotFound()
        ->assertJsonPath('message', 'No locality boundary was found for that ZIP code.');
});

it('validates zip codes', function () {
    $this->getJson('/api/locality-boundary?zip=invalid')
        ->assertUnprocessable()
        ->assertJsonValidationErrorFor('zip');

    Http::assertNothingSent();
});
