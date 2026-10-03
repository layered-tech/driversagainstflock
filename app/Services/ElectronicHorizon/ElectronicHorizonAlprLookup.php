<?php

namespace App\Services\ElectronicHorizon;

use App\Models\OsmNode;
use App\Services\Directions\DirectionsException;
use App\Services\Directions\GeometryService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;

class ElectronicHorizonAlprLookup
{
    private const CACHE_GRID_DEGREES = 0.01;

    public function __construct(private readonly GeometryService $geometry) {}

    /**
     * @param  array<int, array{0: float, 1: float}>  $coordinates
     * @return array<int, array{camera_direction: string|null, coordinate: array{0: float, 1: float}, direction: string|null, id: string, osm_id: int, tags: array<string, mixed>}>
     */
    public function find(array $coordinates): array
    {
        return $this->findWithCoverage($coordinates)['nodes'];
    }

    /**
     * @param  array<int, array{0: float, 1: float}>  $coordinates
     * @return array{coverage_complete: bool, coverage_radius_meters: float, nodes: array<int, array{camera_direction: string|null, coordinate: array{0: float, 1: float}, direction: string|null, id: string, osm_id: int, tags: array<string, mixed>}>}
     */
    public function findWithCoverage(array $coordinates, bool $presence = false): array
    {
        $this->ensurePathLengthIsAllowed($coordinates);

        $radius = $presence ? 750.0 : (float) config('electronic-horizon.alpr_path_buffer_meters');
        $cacheSeconds = (int) config('electronic-horizon.alpr_cache_seconds');
        $bounds = (new OsmNode)->routeSearchBounds($coordinates, $radius);

        if ($bounds === null || $cacheSeconds <= 0) {
            return $this->findUncached($coordinates, $radius);
        }

        $bounds = [
            'west' => max(-180.0, round(floor($bounds['west'] / self::CACHE_GRID_DEGREES) * self::CACHE_GRID_DEGREES, 2)),
            'south' => max(-90.0, round(floor($bounds['south'] / self::CACHE_GRID_DEGREES) * self::CACHE_GRID_DEGREES, 2)),
            'east' => min(180.0, round(ceil($bounds['east'] / self::CACHE_GRID_DEGREES) * self::CACHE_GRID_DEGREES, 2)),
            'north' => min(90.0, round(ceil($bounds['north'] / self::CACHE_GRID_DEGREES) * self::CACHE_GRID_DEGREES, 2)),
        ];
        $inventory = Cache::remember(
            $this->cacheKey(['bounds' => $bounds]),
            $cacheSeconds,
            function () use ($bounds, $cacheSeconds): array {
                $ids = OsmNode::query()
                    ->matchingProfiles([['tags' => ['surveillance:type' => 'ALPR']]])
                    ->withinSpatialBounds($bounds)
                    ->pluck('id')->all();

                return [
                    'expires_at' => now()->addSeconds($cacheSeconds)->getTimestamp(),
                    'ids' => $ids,
                ];
            },
        );

        return Cache::remember(
            $this->cacheKey(['coordinates' => $coordinates, 'radius' => $radius]),
            now()->setTimestamp($inventory['expires_at']),
            fn (): array => $this->findUncached($coordinates, $radius, $inventory['ids']),
        );
    }

    /**
     * @param  array<int, array{0: float, 1: float}>  $coordinates
     * @param  array<int, int>|null  $candidateIds
     * @return array{coverage_complete: bool, coverage_radius_meters: float, nodes: array<int, array{camera_direction: string|null, coordinate: array{0: float, 1: float}, direction: string|null, id: string, osm_id: int, tags: array<string, mixed>}>}
     */
    private function findUncached(array $coordinates, float $radius, ?array $candidateIds = null): array
    {
        if ($candidateIds === []) {
            return ['coverage_complete' => true, 'coverage_radius_meters' => $radius, 'nodes' => []];
        }

        $nodes = OsmNode::query()
            ->select([
                'id',
                'osm_id',
                'latitude',
                'longitude',
                'direction',
                'camera_direction',
                'tags',
            ])
            ->matchingProfiles([[
                'tags' => ['surveillance:type' => 'ALPR'],
            ]])
            ->when($candidateIds !== null, fn (Builder $query): Builder => $query->whereIntegerInRaw('id', $candidateIds))
            ->nearIndexedRoute(
                $coordinates,
                $radius,
            )
            ->orderBy('id')
            ->get();

        return [
            'coverage_complete' => true,
            'coverage_radius_meters' => $radius,
            'nodes' => $nodes
                ->map(fn (OsmNode $node): array => [
                    'camera_direction' => $node->camera_direction,
                    'coordinate' => [(float) $node->longitude, (float) $node->latitude],
                    'direction' => $node->direction,
                    'id' => 'osm-node-'.$node->id,
                    'osm_id' => (int) $node->osm_id,
                    'tags' => $node->tags ?? [],
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @param  array<int, array{0: float, 1: float}>  $coordinates
     */
    private function ensurePathLengthIsAllowed(array $coordinates): void
    {
        $pathDistanceMeters = $this->geometry->routeDistanceMeters(
            array_map(
                fn (array $coordinate): array => [
                    'latitude' => $coordinate[1],
                    'longitude' => $coordinate[0],
                ],
                $coordinates,
            ),
        );

        if (
            $pathDistanceMeters >
            (float) config('electronic-horizon.maximum_path_length_meters')
        ) {
            throw DirectionsException::badRequest(
                'The electronic horizon path is too long.',
            );
        }
    }

    /**
     * @param  array<string, mixed>  $lookup
     */
    private function cacheKey(array $lookup): string
    {
        $node = new OsmNode;

        return 'electronic-horizon:alpr:v3:'.hash(
            'sha256',
            json_encode([$node->getConnectionName(), $node->getTable(), $lookup], JSON_THROW_ON_ERROR),
        );
    }
}
