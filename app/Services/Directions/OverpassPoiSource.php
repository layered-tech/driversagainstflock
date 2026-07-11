<?php

namespace App\Services\Directions;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class OverpassPoiSource implements PoiSource
{
    public function __construct(private readonly DirectionParser $directionParser) {}

    public function find(array $bounds, array $profiles): array
    {
        if ($profiles === []) {
            Log::info('Overpass POI lookup skipped because no profiles were requested.', [
                'bounds' => $bounds,
            ]);

            return [];
        }

        $startedAt = microtime(true);
        $query = $this->buildQuery($bounds, $profiles);

        Log::info('Overpass POI lookup request started.', [
            'bounds' => $bounds,
            'profile_count' => count($profiles),
            'query_length' => strlen($query),
            'timeout_seconds' => 180,
        ]);

        try {
            $response = Http::asForm()
                ->accept('*/*')
                ->withUserAgent('DriversAgainstFlock/1.0 (+https://driversagainstflock.com)')
                ->timeout(180)
                ->post(config('directions.overpass_url'), [
                    'data' => $query,
                ]);
        } catch (Throwable $exception) {
            Log::error('Overpass POI lookup request threw an exception.', [
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
                'exception' => $exception,
            ]);

            throw $exception;
        }

        if (! $response->successful()) {
            $context = [
                'status' => $response->status(),
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
            ];

            if ($response->serverError()) {
                Log::error('Overpass POI lookup response failed.', $context);
            } else {
                Log::warning('Overpass POI lookup response failed.', $context);
            }

            throw DirectionsException::upstream('Overpass could not load POIs for directions.');
        }

        $pois = collect($response->json('elements', []))
            ->flatMap(function (array $element) {
                $tags = $element['tags'] ?? [];
                $longitude = $element['lon'] ?? null;
                $latitude = $element['lat'] ?? null;

                if (! is_numeric($longitude) || ! is_numeric($latitude)) {
                    return [];
                }

                return [new PointOfInterest(
                    $element['id'] ?? null,
                    (float) $longitude,
                    (float) $latitude,
                    $this->directionParser->parseMany($tags['direction'] ?? $tags['camera:direction'] ?? null),
                    $tags,
                )];
            })
            ->values()
            ->all();

        Log::info('Overpass POI lookup completed.', [
            'status' => $response->status(),
            'poi_count' => count($pois),
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ]);

        return $pois;
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }

    /**
     * @param  array{west: float, south: float, east: float, north: float}  $bounds
     * @param  array<int, array<string, mixed>>  $profiles
     */
    private function buildQuery(array $bounds, array $profiles): string
    {
        $parts = ['[out:json];('];

        foreach ($profiles as $profile) {
            $parts[] = 'node';
            foreach (($profile['tags'] ?? []) as $key => $value) {
                $parts[] = sprintf('["%s"="%s"]', $this->escape($key), $this->escape((string) $value));
            }
            $parts[] = sprintf('(%F,%F,%F,%F);', $bounds['south'], $bounds['west'], $bounds['north'], $bounds['east']);
        }

        $parts[] = ');out geom;';

        return implode('', $parts);
    }

    private function escape(string $value): string
    {
        return addcslashes($value, '\\"');
    }
}
