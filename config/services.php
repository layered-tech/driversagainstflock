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

    'openwebninja' => [
        'api_key' => env('OPENWEBNINJA_API_KEY'),
    ],

    'openstreetmap' => [
        'client_id' => env('OPENSTREETMAP_CLIENT_ID'),
        'redirect' => env('OPENSTREETMAP_REDIRECT_URI', '/auth/openstreetmap/callback'),
    ],

    'mobile_auth' => [
        'allowed_redirect_schemes' => array_filter(array_map('trim', explode(',', env('MOBILE_AUTH_REDIRECT_SCHEMES', 'driversagainstflock')))),
        'code_expires_minutes' => env('MOBILE_AUTH_CODE_EXPIRES_MINUTES', 5),
    ],

];
