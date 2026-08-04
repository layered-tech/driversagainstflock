<?php

use App\Http\Controllers\Api\AutocompleteSearchController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

it('uses a new random google autocomplete session token for each request', function () {
    Http::fake([
        'https://places.googleapis.com/*' => Http::response([
            'suggestions' => [],
        ]),
    ]);

    $controller = new AutocompleteSearchController;

    $controller(Request::create('/api/search/autocomplete', 'POST', [
        'input' => 'coffee',
    ]));
    $controller(Request::create('/api/search/autocomplete', 'POST', [
        'input' => 'coffee shop',
    ]));

    $tokens = collect(Http::recorded())->map(
        fn (array $record): mixed => $record[0]->data()['sessionToken'] ?? null,
    );

    expect($tokens)->toHaveCount(2);
    expect($tokens[0])->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i');
    expect($tokens[1])->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i');
    expect($tokens[1])->not->toBe($tokens[0]);
    expect($tokens->all())->not->toContain('coffee');
    expect($tokens->all())->not->toContain('127.0.0.1');
});
