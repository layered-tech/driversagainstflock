<?php

use App\Http\Controllers\Api\AutocompleteSearchController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
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

it('requires the client to provide the autocomplete session token', function () {
    Http::fake();

    $controller = new AutocompleteSearchController;

    expect(fn () => $controller(Request::create(
        '/api/search/autocomplete',
        'POST',
        ['input' => 'coffee'],
    )))->toThrow(ValidationException::class);

    Http::assertNothingSent();
});
