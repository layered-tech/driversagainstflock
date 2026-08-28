<?php

namespace App\Services\ElectronicHorizon;

use App\Models\OsmNode;
use App\Services\Directions\DirectionsException;
use App\Services\Directions\GeometryService;
use Illuminate\Support\Facades\Cache;

class ElectronicHorizonAlprLookup
{
    public function __construct(private readonly GeometryService $geometry) {}

    /**
     * @param  array<int, array{0: float, 1: float}>  $coordinates
     * @return array<int, array{camera_direction: string|null, coordinate: array{0: float, 1: float}, direction: string|null, id: string, osm_id: int, tags: array<string, mixed>}>
     */
    public function find(array $coordinates): array
    {
        $this->ensurePathLengthIsAllowed($coordinates);

        return Cache::remember(
            $this->cacheKey($coordinates),
            now()->addSeconds((int) config('electronic-horizon.alpr_cache_seconds')),
            fn (): array => $this->findUncached($coordinates),
        );
    }

    /**
     * @param  array<int, array{0: float, 1: float}>  $coordinates
     * @return array<int, array{camera_direction: string|null, coordinate: array{0: float, 1: float}, direction: string|null, id: string, osm_id: int, tags: array<string, mixed>}>
     */
    private function findUncached(array $coordinates): array
    {
        return OsmNode::query()
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
            ->nearRoute(
                $coordinates,
                (float) config('electronic-horizon.alpr_path_buffer_meters'),
            )
            ->orderBy('id')
            ->limit((int) config('electronic-horizon.alpr_maximum_results'))
            ->get()
            ->map(fn (OsmNode $node): array => [
                'camera_direction' => $node->camera_direction,
                'coordinate' => [(float) $node->longitude, (float) $node->latitude],
                'direction' => $node->direction,
                'id' => 'osm-node-'.$node->id,
                'osm_id' => (int) $node->osm_id,
                'tags' => $node->tags ?? [],
            ])
            ->all();
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
     * @param  array<int, array{0: float, 1: float}>  $coordinates
     */
    private function cacheKey(array $coordinates): string
    {
        $normalizedCoordinates = array_map(
            fn (array $coordinate): array => [
                round($coordinate[0], 5),
                round($coordinate[1], 5),
            ],
            $coordinates,
        );

        return 'electronic-horizon:alpr:'.hash(
            'sha256',
            json_encode($normalizedCoordinates, JSON_THROW_ON_ERROR),
        );
    }
}
