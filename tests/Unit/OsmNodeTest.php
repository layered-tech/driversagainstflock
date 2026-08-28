<?php

use App\Models\OsmNode;
use Tests\TestCase;

uses(TestCase::class);

it('always uses the configured OSM reader source', function () {
    config([
        'osm.reader.connection' => 'osm',
        'osm.reader.table' => 'osm_current.application_alpr_nodes',
    ]);

    $node = new OsmNode;

    expect($node->getConnectionName())->toBe('osm')
        ->and($node->getTable())->toBe('osm_current.application_alpr_nodes');
});
