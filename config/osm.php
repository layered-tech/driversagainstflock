<?php

return [
    'reader' => [
        'connection' => env('OSM_READER_CONNECTION', 'osm'),
        'changesets_table' => env('OSM_CHANGESETS_TABLE', 'osm_history.application_changesets'),
        'comments_table' => env('OSM_CHANGESET_COMMENTS_TABLE', 'osm_history.application_changeset_comments'),
        'versions_table' => env('OSM_NODE_VERSIONS_TABLE', 'osm_history.alpr_node_versions'),
        'table' => env('OSM_READER_TABLE', 'osm_current.application_alpr_nodes'),
    ],
];
