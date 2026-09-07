<?php

$baseUrl = rtrim((string) env('OSM_WEB_URL', 'https://www.openstreetmap.org'), '/');

return [
    'approved_osm_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('OSM_MODERATOR_IDS', ''))), fn (string $id): bool => preg_match('/^[1-9][0-9]*$/D', $id) === 1)),
    'oauth' => [
        'client_id' => env('OSM_WEB_CLIENT_ID'),
        'client_secret' => env('OSM_WEB_CLIENT_SECRET'),
        'redirect_uri' => env('OSM_WEB_REDIRECT_URI'),
        'url' => $baseUrl,
        'api_url' => env('OSM_WEB_API_URL', $baseUrl.'/api/0.6'),
    ],
];
