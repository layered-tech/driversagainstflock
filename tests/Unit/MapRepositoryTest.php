<?php

use App\Models\Marker;
use App\Models\OsmNode;
use App\Repositories\MapRepository;
use MatanYadaev\EloquentSpatial\Objects\Point;
use Tests\TestCase;

uses(TestCase::class);

test('it surfaces OSM node tags without deriving ALPR rendering decisions', function () {
    $node = new OsmNode([
        'osm_id' => 9000,
        'latitude' => 43.1,
        'longitude' => -88.2,
        'direction' => '180',
        'tags' => [
            'brand:wikidata' => 'Q108485435',
            'manufacturer:wikidata' => 'Q108485435',
        ],
    ]);
    $node->id = 1;

    $transformed = (new MapRepository)->transformOsmNode($node);

    expect($transformed['properties']['osm_nodes'])->toHaveCount(1)
        ->and($transformed['properties']['osm_nodes'][0]['node_id'])->toBe(9000)
        ->and($transformed['properties']['osm_nodes'][0]['tags']['brand:wikidata'])->toBe('Q108485435')
        ->and($transformed['properties']['osm_nodes'][0]['tags']['manufacturer:wikidata'])->toBe('Q108485435')
        ->and($transformed['location'])->toBe([-88.2, 43.1])
        ->and($transformed['properties']['direction'])->toBe('180')
        ->and($transformed['properties']['heading'])->toBe(180)
        ->and(array_key_exists('has_alpr_brand', $transformed['properties']))->toBeFalse()
        ->and(array_key_exists('shows_alpr_symbol', $transformed['properties']))->toBeFalse();
});

test('it preserves semicolon-delimited OSM node directions', function () {
    $node = new OsmNode([
        'osm_id' => 9001,
        'latitude' => 43.1,
        'longitude' => -88.2,
        'direction' => '90;270',
        'tags' => [
            'direction' => '90;270',
        ],
    ]);
    $node->id = 2;

    $transformed = (new MapRepository)->transformOsmNode($node);

    expect($transformed['properties']['direction'])->toBe('90;270')
        ->and($transformed['properties']['bearing'])->toBeNull()
        ->and($transformed['properties']['heading'])->toBeNull();
});

test('it transforms markers without style records', function () {
    $marker = new Marker([
        'bearing' => 45,
        'type' => 'falcon-lr',
    ]);
    $marker->id = 123;
    $marker->point = new Point(43.1, -88.2);

    $transformed = (new MapRepository)->transformMarkerForFile($marker);

    expect(array_key_exists('style_id', $transformed['properties']))->toBeFalse()
        ->and($transformed['properties']['style'])->toBe([
            'circle_color' => '#59FF89',
            'stroke_color' => '#032E32',
            'cluster_circle_color' => '#59FF89',
            'cluster_stroke_color' => '#032E32',
        ])
        ->and($transformed['properties']['icon'])->toBe('falcon-lr')
        ->and($transformed['location'])->toBe([-88.2, 43.1]);
});
