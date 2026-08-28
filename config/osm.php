<?php

return [
    'reader' => [
        'connection' => env('OSM_READER_CONNECTION', 'osm'),
        'table' => env('OSM_READER_TABLE', 'osm_current.application_alpr_nodes'),
    ],
];
