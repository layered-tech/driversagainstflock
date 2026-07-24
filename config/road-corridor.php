<?php

return [
    'overpass_url' => env(
        'ROAD_CORRIDOR_OVERPASS_URL',
        env('DIRECTIONS_OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
    ),
    'radius_meters' => (int) env('ROAD_CORRIDOR_RADIUS_METERS', 500),
    'maximum_radius_meters' => (int) env('ROAD_CORRIDOR_MAXIMUM_RADIUS_METERS', 2000),
    'cache_seconds' => (int) env('ROAD_CORRIDOR_CACHE_SECONDS', 60),
    'connect_timeout_seconds' => (int) env('ROAD_CORRIDOR_CONNECT_TIMEOUT_SECONDS', 3),
    'timeout_seconds' => (int) env('ROAD_CORRIDOR_TIMEOUT_SECONDS', 10),
    'overpass_timeout_seconds' => (int) env('ROAD_CORRIDOR_OVERPASS_TIMEOUT_SECONDS', 8),
];
