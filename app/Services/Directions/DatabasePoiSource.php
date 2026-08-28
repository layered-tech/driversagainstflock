<?php

namespace App\Services\Directions;

use App\Models\CurrentOsmNode;
use Illuminate\Support\Facades\Log;

class DatabasePoiSource implements RouteAwarePoiSource
{
    public function __construct(
        private readonly DirectionParser $directionParser,
    ) {}

    public function find(array $bounds, array $profiles): array
    {
        if ($profiles === []) {
            Log::info('Database POI lookup skipped because no profiles were requested.');

            return [];
        }

        $startedAt = microtime(true);

        Log::info('Database POI lookup started.', [
            'profile_count' => count($profiles),
        ]);

        $nodes = CurrentOsmNode::query()
            ->select(['id', 'osm_id', 'latitude', 'longitude', 'direction', 'camera_direction', 'tags'])
            ->withinBounds($bounds)
            ->matchingProfiles($profiles)
            ->get();

        $pois = $this->pointsOfInterest($nodes);

        Log::info('Database POI lookup completed.', [
            'node_count' => $nodes->count(),
            'poi_count' => count($pois),
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ]);

        return $pois;
    }

    public function findAlongRoute(array $coordinates, float $bufferMeters, array $profiles): array
    {
        if ($profiles === []) {
            Log::info('Database route POI lookup skipped because no profiles were requested.');

            return [];
        }

        $startedAt = microtime(true);

        Log::info('Database route POI lookup started.', [
            'coordinate_count' => count($coordinates),
            'buffer_meters' => $bufferMeters,
            'profile_count' => count($profiles),
        ]);

        $nodes = CurrentOsmNode::query()
            ->select(['id', 'osm_id', 'latitude', 'longitude', 'direction', 'camera_direction', 'tags'])
            ->matchingProfiles($profiles)
            ->nearRoute($coordinates, $bufferMeters)
            ->get()
            ->unique('osm_id')
            ->values();
        $pois = $this->pointsOfInterest($nodes);

        Log::info('Database route POI lookup completed.', [
            'node_count' => $nodes->count(),
            'poi_count' => count($pois),
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ]);

        return $pois;
    }

    /**
     * @param  iterable<int, CurrentOsmNode>  $nodes
     * @return array<int, PointOfInterest>
     */
    private function pointsOfInterest(iterable $nodes): array
    {
        $pois = [];

        foreach ($nodes as $node) {
            $pois[] = new PointOfInterest(
                $node->osm_id,
                (float) $node->longitude,
                (float) $node->latitude,
                $this->directionsForNode($node),
                $node->tags ?? [],
            );
        }

        return $pois;
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }

    /**
     * @return array<int, DirectionRange|null>
     */
    private function directionsForNode(CurrentOsmNode $node): array
    {
        return $this->directionParser->parseMany(
            $node->direction
                ?? $node->camera_direction
                ?? $node->tags['direction']
                ?? $node->tags['camera:direction']
                ?? null
        );
    }
}
