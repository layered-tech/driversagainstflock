<?php

use App\Services\FuelPrices\AaaStateGasPriceService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

function aaaStatePricePage(float $regularPrice = 3.456): string
{
    $states = [
        'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
        'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
        'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
        'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
        'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
        'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
        'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
        'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
        'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    ];
    $rows = collect($states)
        ->map(fn (string $state): string => sprintf(
            '<tr><td>%s</td><td>$%0.3f</td><td>$4.100</td></tr>',
            $state,
            $regularPrice,
        ))
        ->implode('');

    return <<<HTML
    <!doctype html>
    <html><body>
    <p>Price as of August 10, 2026</p>
    <table><tr><th>State</th><th>Regular</th><th>Mid-Grade</th></tr>{$rows}</table>
    </body></html>
    HTML;
}

beforeEach(function () {
    Cache::forget(AaaStateGasPriceService::CACHE_KEY);
    $this->withoutMiddleware();
});

it('serves and caches all aaa regular state prices without receiving a location', function () {
    Http::fake([
        'https://gasprices.aaa.com/*' => Http::response(aaaStatePricePage(), 200),
    ]);

    $this->getJson('/api/v1/fuel-prices/state-averages')
        ->assertOk()
        ->assertHeader('Cache-Control', 'max-age=21600, public, stale-while-revalidate=583200')
        ->assertJsonPath('ok', true)
        ->assertJsonPath('data.fuel', 'regular')
        ->assertJsonPath('data.prices.CA', 3.456)
        ->assertJsonPath('data.prices.DC', 3.456)
        ->assertJsonPath('data.source_as_of', 'August 10, 2026')
        ->assertJsonCount(51, 'data.prices');

    $this->getJson('/api/v1/fuel-prices/state-averages')->assertOk();

    Http::assertSentCount(1);
    Http::assertSent(fn ($request): bool => $request->url() === 'https://gasprices.aaa.com/state-gas-price-averages/'
        && $request->data() === []);
});

it('returns unavailable instead of a partial or national fallback', function () {
    Http::fake([
        'https://gasprices.aaa.com/*' => Http::response('<table><tr><th>State</th><th>Regular</th></tr></table>', 200),
    ]);

    $this->getJson('/api/v1/fuel-prices/state-averages')
        ->assertStatus(503)
        ->assertJson([
            'ok' => false,
            'error' => 'State gas prices are temporarily unavailable.',
        ]);
});
