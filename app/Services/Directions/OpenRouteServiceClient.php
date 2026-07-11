<?php

namespace App\Services\Directions;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class OpenRouteServiceClient
{
    private const DIRECTIONS_ENDPOINT = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';

    /**
     * @param  array<int, array{longitude: float, latitude: float}>  $coordinates
     * @param  array{type: string, coordinates: array<int, mixed>}  $exclusionZone
     * @return array{coordinates: array<int, array<int, float>>, distance: float|null, duration: float|null, maneuvers: array<int, array<string, mixed>>}
     */
    public function route(array $coordinates, array $exclusionZone, bool $continueStraight = true): array
    {
        $startedAt = microtime(true);
        $hasExclusionZone = ($exclusionZone['coordinates'] ?? []) !== [];
        $body = [
            'coordinates' => array_map(
                fn (array $coordinate): array => [$coordinate['longitude'], $coordinate['latitude']],
                $coordinates,
            ),
            'continue_straight' => $continueStraight,
            'instructions' => true,
            'instructions_format' => 'text',
            'maneuvers' => true,
        ];

        if ($hasExclusionZone) {
            $body['options'] = [
                'avoid_polygons' => $exclusionZone,
            ];
        }

        $headers = array_filter([
            'Authorization' => config('services.openrouteservice.api_key'),
        ]);

        Log::info('OpenRouteService directions request started.', [
            'waypoint_count' => max(0, count($coordinates) - 2),
            'has_exclusion_zone' => $hasExclusionZone,
            'avoid_polygon_count' => count($exclusionZone['coordinates'] ?? []),
            'continue_straight' => $continueStraight,
            'timeout_seconds' => 30,
        ]);

        try {
            $response = Http::accept('application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8')
                ->withHeaders($headers)
                ->timeout(30)
                ->retry(3, 200, throw: false)
                ->post(self::DIRECTIONS_ENDPOINT, $body);
        } catch (Throwable $exception) {
            Log::error('OpenRouteService directions request threw an exception.', [
                'has_exclusion_zone' => $hasExclusionZone,
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
                'exception' => $exception,
            ]);

            throw $exception;
        }

        $responseData = $response->json();
        $responseData = is_array($responseData) ? $responseData : [];
        $responseLogContext = [
            'status' => $response->status(),
            'successful' => $response->successful(),
            'has_exclusion_zone' => $hasExclusionZone,
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ];

        if (! $response->successful()) {
            $errorContext = array_merge($responseLogContext, [
                'error_code' => Arr::get($responseData, 'error.code'),
                'error_message' => Arr::get($responseData, 'error.message') ?? Arr::get($responseData, 'message'),
            ]);

            if ($response->serverError()) {
                Log::error('OpenRouteService directions response failed.', $errorContext);
            } else {
                Log::warning('OpenRouteService directions response failed.', $errorContext);
            }

            $this->throwForResponse($response->status(), $responseData);
        }

        $route = $this->normalize($responseData);

        Log::info('OpenRouteService directions response normalized.', array_merge($responseLogContext, [
            'coordinate_count' => count($route['coordinates']),
            'distance_meters' => $route['distance'],
            'duration_seconds' => $route['duration'],
        ]));

        return $route;
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function throwForResponse(int $status, array $data): never
    {
        $code = Arr::get($data, 'error.code');
        $message = Arr::get($data, 'error.message')
            ?? Arr::get($data, 'message')
            ?? 'Directions could not be loaded.';

        if (in_array($code, [2009, 2010, 2011], true) || in_array($status, [400, 404], true)) {
            throw DirectionsException::badRequest($message);
        }

        throw DirectionsException::upstream($message);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{coordinates: array<int, array<int, float>>, distance: float|null, duration: float|null, maneuvers: array<int, array<string, mixed>>}
     */
    private function normalize(array $data): array
    {
        $feature = Arr::get($data, 'features.0', []);
        $coordinates = Arr::get($feature, 'geometry.coordinates', []);

        if (! is_array($coordinates) || count($coordinates) < 2) {
            throw DirectionsException::badRequest('Could not find a route.');
        }

        $summary = Arr::get($feature, 'properties.summary', []);

        $coordinates = array_values(array_map(
            fn (array $coordinate) => [(float) $coordinate[0], (float) $coordinate[1]],
            array_filter($coordinates, fn ($coordinate) => is_array($coordinate) && count($coordinate) >= 2)
        ));

        if (count($coordinates) < 2) {
            throw DirectionsException::badRequest('Could not find a route.');
        }

        return [
            'coordinates' => $coordinates,
            'distance' => is_numeric($summary['distance'] ?? null) ? (float) $summary['distance'] : null,
            'duration' => is_numeric($summary['duration'] ?? null) ? (float) $summary['duration'] : null,
            'maneuvers' => $this->normalizeManeuvers(Arr::get($feature, 'properties.segments', [])),
        ];
    }

    /**
     * @param  array<int, mixed>  $segments
     * @return array<int, array<string, mixed>>
     */
    private function normalizeManeuvers(array $segments): array
    {
        $maneuvers = [];
        $preservedKeys = ['instruction', 'distance', 'duration', 'type', 'way_points', 'name', 'exit_number', 'maneuver'];

        foreach ($segments as $segment) {
            foreach (($segment['steps'] ?? []) as $step) {
                if (! is_array($step)) {
                    continue;
                }

                $maneuvers[] = Arr::only($step, $preservedKeys);
            }
        }

        return $maneuvers;
    }
}
