<?php

$baseUrl = rtrim((string) env('OSM_WEB_URL', 'https://www.openstreetmap.org'), '/');

return [
    'approved_osm_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('OSM_MODERATOR_IDS', ''))), fn (string $id): bool => preg_match('/^[1-9][0-9]*$/D', $id) === 1)),
    'cache' => [
        'fresh_seconds' => (int) env('MODERATION_CACHE_FRESH_SECONDS', 300),
        'stale_seconds' => (int) env('MODERATION_CACHE_STALE_SECONDS', 600),
    ],
    'processing' => [
        'connection' => env('MODERATION_QUEUE_CONNECTION', 'redis'),
        'dispatch_chunk_size' => (int) env('MODERATION_DISPATCH_CHUNK_SIZE', 500),
        'queue' => env('MODERATION_QUEUE', 'moderation'),
    ],
    'profiles' => ['api_url' => env('MODERATION_PROFILE_API_URL', 'https://api.openstreetmap.org/api/0.6')],
    'roads' => ['cache_seconds' => (int) env('MODERATION_ROADS_CACHE_SECONDS', 86400)],
    'schedules' => [
        'outcomes' => ['enabled' => env('MODERATION_OUTCOMES_ENABLED', true), 'cron' => env('MODERATION_OUTCOMES_CRON', '0 0 * * *'), 'every_days' => 2],
        'rules' => ['enabled' => env('MODERATION_RULES_ENABLED', true), 'cron' => env('MODERATION_RULES_CRON', '0 */3 * * *')],
        'profiles' => ['enabled' => env('MODERATION_PROFILES_ENABLED', true), 'cron' => env('MODERATION_PROFILES_CRON', '0 3 * * *')],
        'summaries' => ['enabled' => env('MODERATION_SUMMARIES_ENABLED', true), 'cron' => env('MODERATION_SUMMARIES_CRON', '5 * * * *')],
        'warm' => ['enabled' => env('MODERATION_WARM_ENABLED', true), 'cron' => env('MODERATION_WARM_CRON', '*/5 * * * *')],
    ],
    'oauth' => [
        'client_id' => env('OSM_WEB_CLIENT_ID'),
        'client_secret' => env('OSM_WEB_CLIENT_SECRET'),
        'redirect_uri' => env('OSM_WEB_REDIRECT_URI'),
        'url' => $baseUrl,
        'api_url' => env('OSM_WEB_API_URL', $baseUrl.'/api/0.6'),
    ],
];
