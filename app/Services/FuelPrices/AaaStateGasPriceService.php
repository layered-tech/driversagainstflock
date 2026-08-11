<?php

namespace App\Services\FuelPrices;

use DOMDocument;
use DOMXPath;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class AaaStateGasPriceService
{
    public const CACHE_KEY = 'fuel-prices.aaa-state-regular.v1';

    private const FRESH_SECONDS = 21600;

    private const STALE_SECONDS = 604800;

    private const SOURCE_URL = 'https://gasprices.aaa.com/state-gas-price-averages/';

    private const STATE_CODES = [
        'Alabama' => 'AL',
        'Alaska' => 'AK',
        'Arizona' => 'AZ',
        'Arkansas' => 'AR',
        'California' => 'CA',
        'Colorado' => 'CO',
        'Connecticut' => 'CT',
        'Delaware' => 'DE',
        'District of Columbia' => 'DC',
        'Florida' => 'FL',
        'Georgia' => 'GA',
        'Hawaii' => 'HI',
        'Idaho' => 'ID',
        'Illinois' => 'IL',
        'Indiana' => 'IN',
        'Iowa' => 'IA',
        'Kansas' => 'KS',
        'Kentucky' => 'KY',
        'Louisiana' => 'LA',
        'Maine' => 'ME',
        'Maryland' => 'MD',
        'Massachusetts' => 'MA',
        'Michigan' => 'MI',
        'Minnesota' => 'MN',
        'Mississippi' => 'MS',
        'Missouri' => 'MO',
        'Montana' => 'MT',
        'Nebraska' => 'NE',
        'Nevada' => 'NV',
        'New Hampshire' => 'NH',
        'New Jersey' => 'NJ',
        'New Mexico' => 'NM',
        'New York' => 'NY',
        'North Carolina' => 'NC',
        'North Dakota' => 'ND',
        'Ohio' => 'OH',
        'Oklahoma' => 'OK',
        'Oregon' => 'OR',
        'Pennsylvania' => 'PA',
        'Rhode Island' => 'RI',
        'South Carolina' => 'SC',
        'South Dakota' => 'SD',
        'Tennessee' => 'TN',
        'Texas' => 'TX',
        'Utah' => 'UT',
        'Vermont' => 'VT',
        'Virginia' => 'VA',
        'Washington' => 'WA',
        'West Virginia' => 'WV',
        'Wisconsin' => 'WI',
        'Wyoming' => 'WY',
    ];

    /**
     * @return array{
     *     fuel: string,
     *     prices: array<string, float>,
     *     retrieved_at: string,
     *     source: string,
     *     source_as_of: string|null
     * }
     */
    public function current(): array
    {
        return Cache::flexible(
            self::CACHE_KEY,
            [self::FRESH_SECONDS, self::STALE_SECONDS],
            fn (): array => $this->fetch(),
        );
    }

    /**
     * @return array{
     *     fuel: string,
     *     prices: array<string, float>,
     *     retrieved_at: string,
     *     source: string,
     *     source_as_of: string|null
     * }
     */
    private function fetch(): array
    {
        $response = Http::accept('text/html')
            ->withUserAgent('DriversAgainstFlock/1.0 (+https://driversagainstflock.com)')
            ->connectTimeout(5)
            ->timeout(12)
            ->retry(2, 250)
            ->get(self::SOURCE_URL)
            ->throw();

        return $this->parse($response->body());
    }

    /**
     * @return array{
     *     fuel: string,
     *     prices: array<string, float>,
     *     retrieved_at: string,
     *     source: string,
     *     source_as_of: string|null
     * }
     */
    public function parse(string $html): array
    {
        $document = new DOMDocument;
        $previousUseInternalErrors = libxml_use_internal_errors(true);
        $loaded = $document->loadHTML($html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($previousUseInternalErrors);

        if (! $loaded) {
            throw new RuntimeException('AAA state gas price page could not be parsed.');
        }

        $xpath = new DOMXPath($document);
        $prices = [];

        foreach ($xpath->query('//table') ?: [] as $table) {
            $headers = [];
            $headerNodes = $xpath->query('.//tr[1]/*[self::th or self::td]', $table);

            foreach ($headerNodes ?: [] as $index => $headerNode) {
                $headers[$this->normalizeText($headerNode->textContent)] = $index;
            }

            $stateIndex = $headers['state'] ?? null;
            $regularIndex = $headers['regular'] ?? null;

            if (! is_int($stateIndex) || ! is_int($regularIndex)) {
                continue;
            }

            foreach ($xpath->query('.//tr[position() > 1]', $table) ?: [] as $row) {
                $cells = $xpath->query('./*[self::th or self::td]', $row);

                if (! $cells || $cells->length <= max($stateIndex, $regularIndex)) {
                    continue;
                }

                $stateName = trim($cells->item($stateIndex)?->textContent ?? '');
                $stateCode = self::STATE_CODES[$stateName] ?? null;
                $regularPrice = $this->parsePrice($cells->item($regularIndex)?->textContent ?? '');

                if ($stateCode !== null && $regularPrice !== null) {
                    $prices[$stateCode] = $regularPrice;
                }
            }
        }

        if (count($prices) !== count(self::STATE_CODES)) {
            throw new RuntimeException(sprintf(
                'AAA state gas price page returned %d of %d expected jurisdictions.',
                count($prices),
                count(self::STATE_CODES),
            ));
        }

        ksort($prices);

        return [
            'fuel' => 'regular',
            'prices' => $prices,
            'retrieved_at' => now()->toIso8601String(),
            'source' => self::SOURCE_URL,
            'source_as_of' => $this->parseSourceAsOf($document->textContent),
        ];
    }

    private function normalizeText(string $value): string
    {
        return strtolower(trim((string) preg_replace('/\s+/', ' ', $value)));
    }

    private function parsePrice(string $value): ?float
    {
        if (! preg_match('/(?:\$\s*)?(\d+(?:\.\d{1,3})?)/', $value, $matches)) {
            return null;
        }

        $price = (float) $matches[1];

        return $price > 0 && $price < 20 ? $price : null;
    }

    private function parseSourceAsOf(string $pageText): ?string
    {
        $pageText = trim((string) preg_replace('/\s+/', ' ', $pageText));

        if (! preg_match(
            '/Prices? as of\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}(?:,?\s+\d{1,2}:\d{2}\s*[AP]M\s*[A-Z]{2,4})?)/i',
            $pageText,
            $matches,
        )) {
            return null;
        }

        return trim($matches[1]);
    }
}
