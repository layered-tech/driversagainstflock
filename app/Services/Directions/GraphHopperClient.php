<?php

namespace App\Services\Directions;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class GraphHopperClient implements DirectionsProvider
{
    public function name(): string
    {
        return 'graphhopper';
    }

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
            'points' => array_map(
                fn (array $coordinate): array => [$coordinate['longitude'], $coordinate['latitude']],
                $coordinates,
            ),
            'profile' => config('services.graphhopper.profile'),
            'locale' => 'en',
            'instructions' => true,
            'calc_points' => true,
            'points_encoded' => false,
            'pass_through' => $continueStraight,
            'timeout_ms' => (int) config('services.graphhopper.route_timeout_milliseconds'),
        ];

        if ($hasExclusionZone) {
            $body['ch.disable'] = true;
            $body['custom_model'] = $this->customModel($exclusionZone);
        }

        Log::info('GraphHopper directions request started.', [
            'waypoint_count' => max(0, count($coordinates) - 2),
            'has_exclusion_zone' => $hasExclusionZone,
            'avoid_polygon_count' => count($exclusionZone['coordinates'] ?? []),
            'continue_straight' => $continueStraight,
            'timeout_seconds' => (int) config('services.graphhopper.timeout_seconds'),
        ]);

        try {
            $response = Http::acceptJson()
                ->withToken((string) config('services.graphhopper.token'))
                ->connectTimeout((int) config('services.graphhopper.connect_timeout_seconds'))
                ->timeout((int) config('services.graphhopper.timeout_seconds'))
                ->retry(
                    [100, 300],
                    when: fn (Throwable $exception): bool => $exception instanceof ConnectionException
                        || ($exception instanceof RequestException && $exception->response->serverError()),
                    throw: false,
                )
                ->post(rtrim((string) config('services.graphhopper.url'), '/').'/route', $body);
        } catch (Throwable $exception) {
            Log::error('GraphHopper directions request threw an exception.', [
                'has_exclusion_zone' => $hasExclusionZone,
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
                'exception_type' => $exception::class,
            ]);

            if ($exception instanceof ConnectionException) {
                throw GraphHopperException::connection();
            }

            throw GraphHopperException::requestException();
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
                'hint_count' => count(Arr::get($responseData, 'hints', [])),
            ]);

            if ($response->serverError()) {
                Log::error('GraphHopper directions response failed.', $errorContext);
            } else {
                Log::warning('GraphHopper directions response failed.', $errorContext);
            }

            throw GraphHopperException::response($response->status());
        }

        $route = $this->normalize($responseData);

        Log::info('GraphHopper directions response normalized.', array_merge($responseLogContext, [
            'coordinate_count' => count($route['coordinates']),
            'distance_meters' => $route['distance'],
            'duration_seconds' => $route['duration'],
        ]));

        return $route;
    }

    /**
     * @param  array{type: string, coordinates: array<int, mixed>}  $exclusionZone
     * @return array{priority: array<int, array{if: string, multiply_by: string}>, areas: array{type: string, features: array<int, array<string, mixed>>}}
     */
    private function customModel(array $exclusionZone): array
    {
        $polygons = $exclusionZone['coordinates'] ?? [];
        $maxPolygons = (int) config('services.graphhopper.max_avoid_polygons');
        $maxCoordinates = (int) config('services.graphhopper.max_avoid_coordinates');
        $coordinateCount = array_sum(array_map(
            fn (array $polygon): int => array_sum(array_map('count', $polygon)),
            $polygons,
        ));

        if (count($polygons) > $maxPolygons || $coordinateCount > $maxCoordinates) {
            throw GraphHopperException::avoidanceLimits();
        }

        $features = array_map(
            fn (array $polygon, int $index): array => [
                'type' => 'Feature',
                'id' => 'avoid_area_'.$index,
                'properties' => (object) [],
                'geometry' => [
                    'type' => 'Polygon',
                    'coordinates' => $polygon,
                ],
            ],
            $polygons,
            array_keys($polygons),
        );

        return [
            'priority' => [[
                'if' => collect(array_keys($polygons))
                    ->map(fn (int $index): string => 'in_avoid_area_'.$index)
                    ->implode(' || '),
                'multiply_by' => '0',
            ]],
            'areas' => [
                'type' => 'FeatureCollection',
                'features' => $features,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{coordinates: array<int, array<int, float>>, distance: float|null, duration: float|null, maneuvers: array<int, array<string, mixed>>}
     */
    private function normalize(array $data): array
    {
        $path = Arr::get($data, 'paths.0', []);
        $coordinates = Arr::get($path, 'points.coordinates', []);

        if (! is_array($coordinates)) {
            throw GraphHopperException::invalidResponse();
        }

        $coordinates = array_values(array_map(
            fn (array $coordinate): array => [(float) $coordinate[0], (float) $coordinate[1]],
            array_filter($coordinates, fn ($coordinate): bool => is_array($coordinate) && count($coordinate) >= 2),
        ));

        if (count($coordinates) < 2) {
            throw GraphHopperException::invalidResponse();
        }

        return [
            'coordinates' => $coordinates,
            'distance' => is_numeric($path['distance'] ?? null) ? (float) $path['distance'] : null,
            'duration' => is_numeric($path['time'] ?? null) ? (float) $path['time'] / 1000 : null,
            'maneuvers' => $this->normalizeManeuvers($path['instructions'] ?? [], $coordinates),
        ];
    }

    /**
     * @param  array<int, mixed>  $instructions
     * @param  array<int, array<int, float>>  $coordinates
     * @return array<int, array<string, mixed>>
     */
    private function normalizeManeuvers(array $instructions, array $coordinates): array
    {
        $maneuvers = [];

        foreach ($instructions as $index => $instruction) {
            if (! is_array($instruction)) {
                continue;
            }

            $wayPoints = array_values(array_map(
                fn ($wayPoint): int => (int) $wayPoint,
                array_filter(
                    Arr::wrap($instruction['interval'] ?? []),
                    fn ($wayPoint): bool => is_numeric($wayPoint),
                ),
            ));
            $coordinateIndex = $wayPoints[0] ?? 0;

            $maneuvers[] = array_filter([
                'instruction' => (string) ($instruction['text'] ?? ''),
                'distance' => is_numeric($instruction['distance'] ?? null)
                    ? (float) $instruction['distance']
                    : null,
                'duration' => is_numeric($instruction['time'] ?? null)
                    ? (float) $instruction['time'] / 1000
                    : null,
                'type' => $this->maneuverType($instruction, $index),
                'way_points' => $wayPoints,
                'name' => isset($instruction['street_name']) ? (string) $instruction['street_name'] : null,
                'exit_number' => is_numeric($instruction['exit_number'] ?? null)
                    ? (int) $instruction['exit_number']
                    : null,
                'maneuver' => isset($coordinates[$coordinateIndex])
                    ? ['location' => $coordinates[$coordinateIndex]]
                    : null,
            ], fn ($value): bool => $value !== null);
        }

        return $maneuvers;
    }

    /**
     * @param  array<string, mixed>  $instruction
     */
    private function maneuverType(array $instruction, int $index): int
    {
        if ($index === 0) {
            return 11;
        }

        if ((int) ($instruction['sign'] ?? 0) === 6 && ($instruction['exited'] ?? false)) {
            return 8;
        }

        return match ((int) ($instruction['sign'] ?? 0)) {
            -7 => 12,
            -3 => 2,
            -2 => 0,
            -1 => 4,
            1 => 5,
            2 => 1,
            3 => 3,
            4, 5 => 10,
            6 => 7,
            7 => 13,
            default => 6,
        };
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }
}
