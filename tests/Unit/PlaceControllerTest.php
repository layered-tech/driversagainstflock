<?php

use App\Http\Controllers\Api\PlaceController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

it('forwards the autocomplete session token to place details', function () {
    $sessionToken = '123e4567-e89b-42d3-a456-426614174000';

    Http::fake([
        'https://places.googleapis.com/*' => Http::response([
            'id' => 'place-id',
        ]),
    ]);

    $controller = new PlaceController;

    $controller(
        Request::create('/api/place/place-id', 'GET', [
            'sessionToken' => $sessionToken,
        ]),
        'place-id',
    );

    $sentRequest = Http::recorded()[0][0];
    parse_str(parse_url($sentRequest->url(), PHP_URL_QUERY) ?? '', $query);

    expect($query)->toMatchArray([
        'sessionToken' => $sessionToken,
    ]);
});

it('does not invent a place-details session token', function () {
    Http::fake([
        'https://places.googleapis.com/*' => Http::response([
            'id' => 'place-id',
        ]),
    ]);

    $controller = new PlaceController;

    $controller(Request::create('/api/place/place-id', 'GET'), 'place-id');

    $sentRequest = Http::recorded()[0][0];
    parse_str(parse_url($sentRequest->url(), PHP_URL_QUERY) ?? '', $query);

    expect($query)->not->toHaveKey('sessionToken');
});
