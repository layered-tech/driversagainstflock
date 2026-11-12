<?php

return [
    'url' => env('POLICE_ALERTS_WAZE_URL', 'https://api.openwebninja.com/waze/alerts-and-jams'),
    'radius_miles' => (int) env('POLICE_ALERTS_RADIUS_MILES', 10),
    'max_alerts' => (int) env('POLICE_ALERTS_MAX_ALERTS', 50),
    'cache_seconds' => (int) env('POLICE_ALERTS_CACHE_SECONDS', 300),
    'failure_cooldown_seconds' => (int) env('POLICE_ALERTS_FAILURE_COOLDOWN_SECONDS', 60),
    'quota_cooldown_seconds' => (int) env('POLICE_ALERTS_QUOTA_COOLDOWN_SECONDS', 900),
    'monthly_request_limit' => (int) env('POLICE_ALERTS_MONTHLY_REQUEST_LIMIT', 9500),
];
