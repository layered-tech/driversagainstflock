<?php

use App\Models\OsmNode;
use App\Services\Directions\DatabasePoiSource;
use Illuminate\Support\Facades\DB;
use MatanYadaev\EloquentSpatial\Objects\Point;

it('uses the geometry index for route candidates while excluding nodes outside the buffer', function (): void {
    foreach ([[-88.2, 43.0], [-88.15, 43.0], [-88.15, 43.003]] as $offset => [$longitude, $latitude]) {
        OsmNode::create([
            'osm_id' => 9100 + $offset,
            'longitude' => $longitude,
            'latitude' => $latitude,
            'location' => new Point($latitude, $longitude, 4326),
            'tags' => ['surveillance:type' => 'ALPR'],
        ]);
    }

    $connection = DB::connection((string) config('osm.reader.connection'));
    $table = $connection->getQueryGrammar()->wrapTable((string) config('osm.reader.table'));
    $connection->statement("CREATE INDEX testing_osm_nodes_directions_gist ON {$table} USING gist (location)");
    $connection->statement('SET LOCAL enable_seqscan = off');
    $connection->statement('SET LOCAL enable_indexscan = off');
    $connection->flushQueryLog();
    $connection->enableQueryLog();

    try {
        $pois = app(DatabasePoiSource::class)->findAlongRoute(
            [[-88.2, 43.0], [-88.1, 43.0]],
            250,
            [['tags' => ['surveillance:type' => 'ALPR']]],
        );
        $queries = $connection->getQueryLog();
    } finally {
        $connection->disableQueryLog();
    }

    expect($pois)->toHaveCount(2)
        ->and($queries)->toHaveCount(1);

    $plan = $connection->select('EXPLAIN (FORMAT JSON) '.$queries[0]['query'], $queries[0]['bindings']);

    expect($plan[0]->{'QUERY PLAN'})
        ->toContain('testing_osm_nodes_directions_gist')
        ->toContain('Index Cond');
});
