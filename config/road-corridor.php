<?php

return [
    'overpass_url' => env(
        'ROAD_CORRIDOR_OVERPASS_URL',
        env('DIRECTIONS_OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
    ),
    'radius_meters' => (int) env('ROAD_CORRIDOR_RADIUS_METERS', 3200),
    'maximum_radius_meters' => (int) env('ROAD_CORRIDOR_MAXIMUM_RADIUS_METERS', 4000),
    'cache_grid_meters' => (int) env('ROAD_CORRIDOR_CACHE_GRID_METERS', 500),
    'failure_cache_seconds' => (int) env('ROAD_CORRIDOR_FAILURE_CACHE_SECONDS', 15),
    'lock_seconds' => (int) env('ROAD_CORRIDOR_LOCK_SECONDS', 25),
    'lock_wait_seconds' => (int) env('ROAD_CORRIDOR_LOCK_WAIT_SECONDS', 20),
    'connect_timeout_seconds' => (int) env('ROAD_CORRIDOR_CONNECT_TIMEOUT_SECONDS', 4),
    'timeout_seconds' => (int) env('ROAD_CORRIDOR_TIMEOUT_SECONDS', 18),
    'overpass_timeout_seconds' => (int) env('ROAD_CORRIDOR_OVERPASS_TIMEOUT_SECONDS', 15),
];
