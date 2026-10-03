<?php

use App\Models\OsmNode;
use App\Repositories\MapRepository;
use Illuminate\Support\Facades\DB;
use MatanYadaev\EloquentSpatial\Objects\Point;

it('can use the geometry index while preserving viewport edges and exclusions', function (array $bounds, array $coordinates): void {
    foreach ($coordinates as $offset => [$longitude, $latitude]) {
        OsmNode::create([
            'osm_id' => 9000 + $offset,
            'longitude' => $longitude,
            'latitude' => $latitude,
            'location' => new Point($latitude, $longitude, 4326),
            'tags' => ['surveillance:type' => 'ALPR'],
        ]);
    }

    $connection = DB::connection((string) config('osm.reader.connection'));
    $table = $connection->getQueryGrammar()->wrapTable((string) config('osm.reader.table'));
    $connection->statement("CREATE INDEX testing_osm_nodes_markers_gist ON {$table} USING gist (location)");
    $connection->statement('SET LOCAL enable_seqscan = off');
    $connection->statement('SET LOCAL enable_indexscan = off');
    $connection->flushQueryLog();
    $connection->enableQueryLog();

    try {
        $points = app(MapRepository::class)->getPoints(...$bounds)['points'];
        $queries = $connection->getQueryLog();
    } finally {
        $connection->disableQueryLog();
    }

    expect(array_column(array_column($points, 'properties'), 'osm_id'))->toBe([9000, 9001])
        ->and($queries)->toHaveCount(1);

    $plan = $connection->select('EXPLAIN (FORMAT JSON) '.$queries[0]['query'], $queries[0]['bindings']);

    expect($plan[0]->{'QUERY PLAN'})
        ->toContain('testing_osm_nodes_markers_gist')
        ->toContain('Index Cond');
})->with([
    'ordinary viewport' => [
        [-88.2, 43.0, -88.1, 43.1],
        [[-88.2, 43.0], [-88.1, 43.1], [-88.3, 43.05]],
    ],
    'antimeridian viewport' => [
        [179.9, -1.0, -179.9, 1.0],
        [[179.9, -1.0], [-179.9, 1.0], [0.0, 0.0]],
    ],
]);
