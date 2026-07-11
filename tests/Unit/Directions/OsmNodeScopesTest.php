<?php

use App\Models\OsmNode;
use Tests\TestCase;

uses(TestCase::class);

it('filters bounds through canonical coordinate columns', function () {
    $query = OsmNode::query()->withinBounds([
        'west' => -122.7,
        'south' => 45.4,
        'east' => -122.6,
        'north' => 45.6,
    ]);

    expect($query->toSql())
        ->toContain('"longitude" between ? and ?')
        ->toContain('"latitude" between ? and ?')
        ->not->toContain('location &&')
        ->not->toContain('ST_Intersects(location')
        ->and($query->getBindings())->toBe([
            -122.7,
            -122.6,
            45.4,
            45.6,
        ]);
});

it('filters route intersections through canonical coordinate columns', function () {
    $query = OsmNode::query()->nearRoute([
        [-122.676, 45.523],
        [-122.66, 45.52],
    ], 250);

    expect($query->toSql())
        ->toContain('ST_MakePoint(longitude::double precision, latitude::double precision)')
        ->not->toContain('location::geography')
        ->not->toContain('location &&')
        ->and($query->getBindings())->toContain('LINESTRING(-122.676000 45.523000,-122.660000 45.520000)');
});

it('matches profiles through tags or denormalized surveillance type', function () {
    $query = OsmNode::query()->matchingProfiles([[
        'tags' => ['surveillance:type' => 'ALPR'],
    ]]);

    expect($query->toSql())
        ->toContain('tags @> ?::jsonb')
        ->toContain('"surveillance_type" = ?')
        ->and($query->getBindings())->toBe([
            '{"surveillance:type":"ALPR"}',
            'ALPR',
        ]);
});
