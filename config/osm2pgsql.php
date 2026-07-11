<?php

return [
    'enabled' => filter_var(env('OSM2PGSQL_ENABLED', false), FILTER_VALIDATE_BOOL),
    'database' => env('OSM2PGSQL_DATABASE', env('DB_DATABASE', 'driversagainstflock')),
    'import_table' => env('OSM2PGSQL_IMPORT_TABLE', 'osm2pgsql_alpr_nodes'),
    'replication_binary' => env('OSM2PGSQL_REPLICATION_BINARY', 'osm2pgsql-replication'),
    'osm2pgsql_binary' => env('OSM2PGSQL_OSM2PGSQL_BINARY', 'osm2pgsql'),
    'style' => env('OSM2PGSQL_STYLE', 'database/osm2pgsql/alpr.lua'),
    'replication_server' => env('OSM2PGSQL_REPLICATION_SERVER', 'https://planet.openstreetmap.org/replication/minute/'),
    'flat_nodes' => env('OSM2PGSQL_FLAT_NODES'),
    'process_timeout_seconds' => (int) env('OSM2PGSQL_PROCESS_TIMEOUT_SECONDS', 28800),
    'sync_chunk' => (int) env('OSM2PGSQL_SYNC_CHUNK', 5000),
];
