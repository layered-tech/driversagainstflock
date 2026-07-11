<?php

namespace App\Services\Directions;

use App\Models\OsmNode;
use Illuminate\Support\Facades\Log;

class DatabasePoiSource implements RouteAwarePoiSource
{
    public function __construct(
        private readonly DirectionParser $directionParser,
    ) {}

    public function find(array $bounds, array $profiles): array
    {
        $startedAt = microtime(true);

        Log::info('Database POI lookup started.', [
            'bounds' => $bounds,
            'profile_count' => count($profiles),
        ]);

        $nodes = OsmNode::query()
            ->select(['id', 'osm_id', 'latitude', 'longitude', 'direction', 'camera_direction', 'tags'])
            ->withinBounds($bounds)
            ->matchingProfiles($profiles)
            ->get();

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

        Log::info('Database POI lookup completed.', [
            'node_count' => $nodes->count(),
            'poi_count' => count($pois),
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ]);

        return $pois;
    }

    public function countAlongRoute(array $coordinates, float $bufferMeters, array $profiles): int
    {
        $startedAt = microtime(true);

        Log::info('Database route POI count started.', [
            'coordinate_count' => count($coordinates),
            'buffer_meters' => $bufferMeters,
            'profile_count' => count($profiles),
        ]);

        $count = (int) OsmNode::query()
            ->matchingProfiles($profiles)
            ->nearRoute($coordinates, $bufferMeters)
            ->distinct('osm_id')
            ->count('osm_id');

        Log::info('Database route POI count completed.', [
            'node_count' => $count,
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ]);

        return $count;
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }

    /**
     * @return array<int, DirectionRange|null>
     */
    private function directionsForNode(OsmNode $node): array
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
