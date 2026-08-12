<?php

namespace App\Console\Commands;

use App\Services\Directions\GraphHopperClient;
use App\Services\Directions\GraphHopperException;
use App\Services\Directions\OpenRouteServiceClient;
use Closure;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class VerifyDirectionsProvidersCommand extends Command
{
    private const EXPECTED_CONTRACT = 'keys:canonical,coordinates:numeric-pairs,distance:number,duration:number,maneuvers:canonical-array';

    protected $signature = 'directions:verify-providers';

    protected $description = 'Verify that ORS and GraphHopper return the normalized directions contract';

    public function handle(
        OpenRouteServiceClient $openRouteService,
        GraphHopperClient $graphHopper,
    ): int {
        $coordinates = [
            ['longitude' => -77.0365, 'latitude' => 38.8977],
            ['longitude' => -77.0091, 'latitude' => 38.8899],
        ];
        $exclusionZone = ['type' => 'MultiPolygon', 'coordinates' => []];

        $openRouteServiceRoute = $this->verifyRequest(
            'OpenRouteService request',
            fn (): array => $openRouteService->route($coordinates, $exclusionZone),
        );
        $graphHopperRoute = $this->verifyRequest(
            'GraphHopper request',
            fn (): array => $graphHopper->route($coordinates, $exclusionZone),
        );
        $graphHopperAvoidanceRoute = null;

        if ($graphHopperRoute !== null) {
            $graphHopperAvoidanceRoute = $this->verifyRequest(
                'GraphHopper Landmarks request',
                fn (): array => $graphHopper->route(
                    $coordinates,
                    $this->verificationExclusionZone(),
                ),
            );
        } else {
            $this->components->twoColumnDetail('GraphHopper Landmarks request', 'SKIPPED');
        }

        $openRouteServiceContract = $openRouteServiceRoute === null
            ? 'unavailable'
            : $this->contract($openRouteServiceRoute);
        $graphHopperContract = $graphHopperRoute === null
            ? 'unavailable'
            : $this->contract($graphHopperRoute);
        $contractsMatch = $openRouteServiceContract === self::EXPECTED_CONTRACT
            && $graphHopperContract === self::EXPECTED_CONTRACT;
        $landmarksCustomModelWorks = $graphHopperAvoidanceRoute !== null
            && $this->contract($graphHopperAvoidanceRoute) === self::EXPECTED_CONTRACT;

        $this->components->twoColumnDetail('OpenRouteService contract', $openRouteServiceContract);
        $this->components->twoColumnDetail('GraphHopper contract', $graphHopperContract);
        $this->components->twoColumnDetail('Normalized payload parity', $contractsMatch ? 'PASS' : 'FAIL');
        $this->components->twoColumnDetail(
            'GraphHopper Landmarks custom model',
            $landmarksCustomModelWorks ? 'PASS' : 'FAIL',
        );

        if (! $contractsMatch || ! $landmarksCustomModelWorks) {
            $this->components->error('Provider connectivity or payload verification failed.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @param  Closure(): array<string, mixed>  $request
     * @return array<string, mixed>|null
     */
    private function verifyRequest(string $check, Closure $request): ?array
    {
        try {
            $route = $request();
        } catch (GraphHopperException $exception) {
            Log::warning('Directions provider verification check failed.', [
                'check' => $check,
                'exception_type' => $exception::class,
                'diagnostic_code' => $exception->diagnosticCode,
            ]);

            $this->components->twoColumnDetail(
                $check,
                'FAIL ('.$exception->diagnosticCode.')',
            );

            return null;
        } catch (Throwable $exception) {
            Log::warning('Directions provider verification check failed.', [
                'check' => $check,
                'exception_type' => $exception::class,
            ]);

            $this->components->twoColumnDetail($check, 'FAIL');

            return null;
        }

        $this->components->twoColumnDetail($check, 'PASS');

        return $route;
    }

    /**
     * @param  array<string, mixed>  $route
     */
    private function contract(array $route): string
    {
        $coordinates = $route['coordinates'] ?? [];
        $hasExpectedKeys = array_keys($route) === ['coordinates', 'distance', 'duration', 'maneuvers'];
        $coordinatePairsAreNumeric = is_array($coordinates)
            && count($coordinates) >= 2
            && collect($coordinates)->every(
                fn ($coordinate): bool => is_array($coordinate)
                    && count($coordinate) >= 2
                    && is_numeric($coordinate[0])
                    && is_numeric($coordinate[1]),
            );
        $maneuvers = $route['maneuvers'] ?? null;
        $maneuversAreCanonical = is_array($maneuvers)
            && $maneuvers !== []
            && collect($maneuvers)->every(
                fn ($maneuver): bool => is_array($maneuver)
                    && is_string($maneuver['instruction'] ?? null)
                    && is_numeric($maneuver['distance'] ?? null)
                    && is_numeric($maneuver['duration'] ?? null)
                    && is_numeric($maneuver['type'] ?? null)
                    && is_array($maneuver['way_points'] ?? null),
            );

        return implode(',', [
            'keys:'.($hasExpectedKeys ? 'canonical' : 'invalid'),
            'coordinates:'.($coordinatePairsAreNumeric ? 'numeric-pairs' : 'invalid'),
            'distance:'.$this->valueType($route['distance'] ?? null),
            'duration:'.$this->valueType($route['duration'] ?? null),
            'maneuvers:'.($maneuversAreCanonical ? 'canonical-array' : 'invalid'),
        ]);
    }

    private function valueType(mixed $value): string
    {
        return is_int($value) || is_float($value) ? 'number' : get_debug_type($value);
    }

    /**
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    private function verificationExclusionZone(): array
    {
        return [
            'type' => 'MultiPolygon',
            'coordinates' => [[[
                [-87.6300, 41.8800],
                [-87.6299, 41.8800],
                [-87.6299, 41.8801],
                [-87.6300, 41.8801],
                [-87.6300, 41.8800],
            ]]],
        ];
    }
}
