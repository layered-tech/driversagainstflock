<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class LocalityBoundaryController extends Controller
{
    private const LOCALITY_ADDRESS_KEYS = [
        'city',
        'town',
        'village',
        'municipality',
        'hamlet',
        'borough',
        'suburb',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'zip' => ['required', 'string', 'regex:/^\d{5}(?:-\d{4})?$/'],
        ]);

        $zipCode = substr($validated['zip'], 0, 5);
        $cacheKey = "locality-boundary:us:{$zipCode}";
        $cachedBoundary = Cache::get($cacheKey);

        if (is_array($cachedBoundary)) {
            return response()->json($cachedBoundary);
        }

        $boundary = $this->lookupBoundary($zipCode);

        if (! $boundary) {
            return response()->json([
                'message' => 'No locality boundary was found for that ZIP code.',
            ], 404);
        }

        Cache::put($cacheKey, $boundary, now()->addDays(30));

        return response()->json($boundary);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lookupBoundary(string $zipCode): ?array
    {
        $postalCodeResult = $this->searchPostalCode($zipCode);
        $address = $postalCodeResult['address'] ?? [];
        $localityName = $this->localityName($address);
        $state = $address['state'] ?? null;

        if (! $localityName || ! $state) {
            return null;
        }

        $boundaryFeature = $this->searchLocalityBoundary($localityName, $state);
        $geometry = $boundaryFeature['geometry'] ?? null;

        if (! is_array($geometry)) {
            return null;
        }

        $bounds = $this->geometryBounds($geometry);

        if (! $bounds) {
            return null;
        }

        $name = $this->boundaryName($boundaryFeature, $localityName);

        return [
            'zip' => $zipCode,
            'name' => $name,
            'state' => $state,
            'source' => 'OpenStreetMap Nominatim',
            'bounds' => $bounds,
            'boundary' => [
                'type' => 'FeatureCollection',
                'features' => [[
                    'type' => 'Feature',
                    'geometry' => $geometry,
                    'properties' => [
                        'name' => $name,
                        'zip' => $zipCode,
                        'source' => 'OpenStreetMap Nominatim',
                        'osm_id' => $boundaryFeature['properties']['osm_id'] ?? null,
                        'osm_type' => $boundaryFeature['properties']['osm_type'] ?? null,
                    ],
                ]],
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function searchPostalCode(string $zipCode): ?array
    {
        try {
            $results = Http::acceptJson()
                ->withUserAgent($this->nominatimUserAgent())
                ->timeout(8)
                ->get('https://nominatim.openstreetmap.org/search', [
                    'addressdetails' => 1,
                    'countrycodes' => 'us',
                    'format' => 'jsonv2',
                    'limit' => 5,
                    'postalcode' => $zipCode,
                ])
                ->json();
        } catch (\Throwable) {
            return null;
        }

        if (! is_array($results)) {
            return null;
        }

        foreach ($results as $result) {
            if (is_array($result) && is_array($result['address'] ?? null)) {
                return $result;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function searchLocalityBoundary(string $localityName, string $state): ?array
    {
        try {
            $features = Http::acceptJson()
                ->withUserAgent($this->nominatimUserAgent())
                ->timeout(8)
                ->get('https://nominatim.openstreetmap.org/search', [
                    'addressdetails' => 1,
                    'city' => $localityName,
                    'country' => 'United States',
                    'countrycodes' => 'us',
                    'extratags' => 1,
                    'format' => 'geojson',
                    'limit' => 10,
                    'polygon_geojson' => 1,
                    'state' => $state,
                ])
                ->json('features');
        } catch (\Throwable) {
            return null;
        }

        if (! is_array($features)) {
            return null;
        }

        $boundaryFeatures = array_values(array_filter(
            $features,
            fn ($feature): bool => is_array($feature)
                && $this->hasBoundaryGeometry($feature)
        ));

        foreach ($boundaryFeatures as $feature) {
            if ($this->matchesLocality($feature, $localityName, $state)) {
                return $feature;
            }
        }

        return $boundaryFeatures[0] ?? null;
    }

    /**
     * @param  array<string, mixed>  $address
     */
    private function localityName(array $address): ?string
    {
        foreach (self::LOCALITY_ADDRESS_KEYS as $key) {
            $value = $address[$key] ?? null;

            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $feature
     */
    private function hasBoundaryGeometry(array $feature): bool
    {
        $geometry = $feature['geometry'] ?? null;
        $type = is_array($geometry) ? ($geometry['type'] ?? null) : null;

        return in_array($type, ['Polygon', 'MultiPolygon'], true)
            && ! empty($geometry['coordinates']);
    }

    /**
     * @param  array<string, mixed>  $feature
     */
    private function matchesLocality(
        array $feature,
        string $localityName,
        string $state
    ): bool {
        $properties = is_array($feature['properties'] ?? null)
            ? $feature['properties']
            : [];
        $address = is_array($properties['address'] ?? null)
            ? $properties['address']
            : [];
        $featureState = $address['state'] ?? null;

        if (
            is_string($featureState)
            && strcasecmp($featureState, $state) !== 0
        ) {
            return false;
        }

        return in_array(
            strtolower($localityName),
            array_map('strtolower', $this->localityCandidates($properties, $address)),
            true
        );
    }

    /**
     * @param  array<string, mixed>  $properties
     * @param  array<string, mixed>  $address
     * @return array<int, string>
     */
    private function localityCandidates(array $properties, array $address): array
    {
        $candidates = [];

        foreach (['name', 'display_name'] as $key) {
            if (is_string($properties[$key] ?? null)) {
                $candidates[] = trim($properties[$key]);
            }
        }

        foreach (self::LOCALITY_ADDRESS_KEYS as $key) {
            if (is_string($address[$key] ?? null)) {
                $candidates[] = trim($address[$key]);
            }
        }

        return array_values(array_filter($candidates));
    }

    /**
     * @param  array<string, mixed>  $feature
     */
    private function boundaryName(array $feature, string $fallback): string
    {
        $properties = is_array($feature['properties'] ?? null)
            ? $feature['properties']
            : [];
        $name = $properties['name'] ?? null;

        return is_string($name) && trim($name) !== ''
            ? trim($name)
            : $fallback;
    }

    /**
     * @param  array<string, mixed>  $geometry
     * @return array{sw: array{0: float, 1: float}, ne: array{0: float, 1: float}}|null
     */
    private function geometryBounds(array $geometry): ?array
    {
        $points = [];
        $this->collectCoordinatePairs($geometry['coordinates'] ?? [], $points);

        if ($points === []) {
            return null;
        }

        $longitudes = array_column($points, 0);
        $latitudes = array_column($points, 1);

        return [
            'sw' => [min($longitudes), min($latitudes)],
            'ne' => [max($longitudes), max($latitudes)],
        ];
    }

    /**
     * @param  array<int, array{0: float, 1: float}>  $points
     */
    private function collectCoordinatePairs(mixed $coordinates, array &$points): void
    {
        if (! is_array($coordinates)) {
            return;
        }

        if (
            count($coordinates) >= 2
            && is_numeric($coordinates[0])
            && is_numeric($coordinates[1])
        ) {
            $points[] = [(float) $coordinates[0], (float) $coordinates[1]];

            return;
        }

        foreach ($coordinates as $coordinate) {
            $this->collectCoordinatePairs($coordinate, $points);
        }
    }

    private function nominatimUserAgent(): string
    {
        return sprintf(
            '%s locality boundary lookup (%s)',
            config('app.name', 'Drivers Against Flock'),
            config('app.url', 'https://driversagainstflock.com')
        );
    }
}
