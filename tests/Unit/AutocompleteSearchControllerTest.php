<?php

use App\Http\Controllers\Api\AutocompleteSearchController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

it('forwards the client session token across autocomplete requests', function () {
    $sessionToken = '123e4567-e89b-42d3-a456-426614174000';

    Http::fake([
        'https://places.googleapis.com/*' => Http::response([
            'suggestions' => [],
        ]),
    ]);

    $controller = new AutocompleteSearchController;

    $controller(Request::create('/api/search/autocomplete', 'POST', [
        'input' => 'coffee',
        'sessionToken' => $sessionToken,
    ]));
    $controller(Request::create('/api/search/autocomplete', 'POST', [
        'input' => 'coffee shop',
        'sessionToken' => $sessionToken,
    ]));

    $tokens = collect(Http::recorded())->map(
        fn (array $record): mixed => $record[0]->data()['sessionToken'] ?? null,
    );

    expect($tokens->all())->toBe([$sessionToken, $sessionToken]);
});

it('generates a one-time session token when the client does not provide one', function () {
    Http::fake([
        'https://places.googleapis.com/*' => Http::response([
            'suggestions' => [],
        ]),
    ]);

    $controller = new AutocompleteSearchController;

    $controller(Request::create(
        '/api/search/autocomplete',
        'POST',
        ['input' => 'coffee'],
    ));

    $sessionToken = Http::recorded()[0][0]->data()['sessionToken'] ?? null;

    expect($sessionToken)->toBeString()->toMatch(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
    );
});
