<?php

use App\Models\CurrentOsmNode;
use Tests\TestCase;

uses(TestCase::class);

it('uses the legacy node source until the reader is enabled', function () {
    config([
        'osm.reader.connection' => 'osm',
        'osm.reader.enabled' => false,
        'osm.reader.table' => 'osm_current.application_alpr_nodes',
    ]);

    $node = new CurrentOsmNode;

    expect($node->getConnectionName())->toBeNull()
        ->and($node->getTable())->toBe('nodes');
});

it('uses the dedicated reader connection and compatibility view after cutover', function () {
    config([
        'osm.reader.connection' => 'osm',
        'osm.reader.enabled' => true,
        'osm.reader.table' => 'osm_current.application_alpr_nodes',
    ]);

    $node = new CurrentOsmNode;

    expect($node->getConnectionName())->toBe('osm')
        ->and($node->getTable())->toBe('osm_current.application_alpr_nodes');
});

it('can build a reader query before application cutover is enabled', function () {
    config([
        'osm.reader.connection' => 'pgsql',
        'osm.reader.enabled' => false,
        'osm.reader.table' => 'osm_current.application_alpr_nodes',
    ]);

    $model = CurrentOsmNode::readerQuery()->getModel();

    expect($model->getConnectionName())->toBe('pgsql')
        ->and($model->getTable())->toBe('osm_current.application_alpr_nodes');
});
