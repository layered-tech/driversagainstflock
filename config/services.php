<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'openrouteservice' => [
        'api_key' => env('OPENROUTESERVICE_KEY'),
    ],

    'graphhopper' => [
        'url' => env('GRAPHHOPPER_URL', 'http://graphhopper.daf-routing.internal:8080'),
        'token' => env('GRAPHHOPPER_TOKEN'),
        'profile' => env('GRAPHHOPPER_PROFILE', 'car'),
        'connect_timeout_seconds' => (int) env('GRAPHHOPPER_CONNECT_TIMEOUT_SECONDS', 3),
        'timeout_seconds' => (int) env('GRAPHHOPPER_TIMEOUT_SECONDS', 45),
        'route_timeout_milliseconds' => (int) env('GRAPHHOPPER_ROUTE_TIMEOUT_MILLISECONDS', 40000),
    ],

    'openwebninja' => [
        'api_key' => env('OPENWEBNINJA_API_KEY'),
    ],

    'openstreetmap' => [
        'api_url' => env('OPENSTREETMAP_API_URL', 'https://api06.dev.openstreetmap.org/api/0.6'),
        'client_id' => env('OPENSTREETMAP_CLIENT_ID'),
        'redirect' => env('OPENSTREETMAP_REDIRECT_URI', '/auth/openstreetmap/callback'),
    ],

    'mobile_auth' => [
        'allowed_redirect_schemes' => array_filter(array_map('trim', explode(',', env('MOBILE_AUTH_REDIRECT_SCHEMES', 'driversagainstflock')))),
        'code_expires_minutes' => env('MOBILE_AUTH_CODE_EXPIRES_MINUTES', 5),
    ],

];
