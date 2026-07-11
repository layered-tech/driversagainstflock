<?php

return [
    'poi_backend' => env('DIRECTIONS_POI_BACKEND', 'database'),
    'avoid_buffer_meters' => (int) env('DIRECTIONS_AVOID_BUFFER_METERS', 50),
    'max_distance_meters' => (int) env('DIRECTIONS_MAX_DISTANCE_METERS', 150000),
    'search_distance_multiplier' => (float) env('DIRECTIONS_SEARCH_DISTANCE_MULTIPLIER', 1.25),
    'expansion_attempts' => (int) env('DIRECTIONS_EXPANSION_ATTEMPTS', 3),
    'expansion_multiplier' => (float) env('DIRECTIONS_EXPANSION_MULTIPLIER', 2),
    'cone_angle_degrees' => (float) env('DIRECTIONS_CONE_ANGLE_DEGREES', 45),
    'cone_segments' => (int) env('DIRECTIONS_CONE_SEGMENTS', 2),
    'overpass_url' => env('DIRECTIONS_OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
    'speed_limit_radius_meters' => (int) env('DIRECTIONS_SPEED_LIMIT_RADIUS_METERS', 10),
    'speed_limit_cache_seconds' => (int) env('DIRECTIONS_SPEED_LIMIT_CACHE_SECONDS', 30),
];
