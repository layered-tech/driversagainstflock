<?php

return [
    'overpass_ingestion_enabled' => filter_var(
        env('OVERPASS_INGESTION_ENABLED', true),
        FILTER_VALIDATE_BOOL,
    ),

    'reader' => [
        'connection' => env('OSM_READER_CONNECTION', 'osm'),
        'enabled' => filter_var(env('OSM_READER_ENABLED', false), FILTER_VALIDATE_BOOL),
        'maximum_source_age_minutes' => (int) env('OSM_READER_MAXIMUM_SOURCE_AGE_MINUTES', 10),
        'table' => 'osm_current.application_alpr_nodes',
    ],
];
