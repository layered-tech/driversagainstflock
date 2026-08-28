<?php

namespace App\Repositories;

use App\Models\OsmNode;
use App\Support\Bearing;
use Illuminate\Database\Eloquent\Builder;

class MapRepository
{
    private array $defaultStyle = [
        'circle_color' => '#59FF89',
        'stroke_color' => '#032E32',
        'cluster_circle_color' => '#59FF89',
        'cluster_stroke_color' => '#032E32',
    ];

    public function lazyMarkerFilePoints(): iterable
    {
        foreach ($this->osmNodeQuery()->lazyById(5000) as $node) {
            yield $this->transformOsmNode($node);
        }
    }

    public function transformOsmNode(OsmNode $node): array
    {
        $tags = $node->tags ?? [];
        $direction = $node->direction
            ?? $node->camera_direction
            ?? $tags['direction']
            ?? $tags['camera:direction']
            ?? null;
        $heading = Bearing::normalize($direction);

        return [
            'location' => [
                (float) $node->longitude,
                (float) $node->latitude,
            ],
            'properties' => [
                'id' => 'osm-node-'.$node->id,
                'osm_id' => $node->osm_id,
                'bearing' => $heading,
                'direction' => $direction,
                'icon' => 'falcon-sr',
                'type' => 'OpenStreetMap ALPR',
                'heading' => $heading,
                'style' => $this->defaultStyle,
                'created_at' => $node->created_at,
                'updated_at' => $node->updated_at,
                'osm_nodes' => [[
                    'id' => $node->id,
                    'node_id' => $node->osm_id,
                    'tags' => $tags,
                ]],
            ],
        ];
    }

    public function getPoints(?float $swLng = null, ?float $swLat = null, ?float $neLng = null, ?float $neLat = null): array
    {
        $points = [];

        $nodeQuery = $this->osmNodeQuery();

        if ($swLng !== null && $swLat !== null && $neLng !== null && $neLat !== null) {
            $nodeQuery->withinBounds([
                'west' => $swLng,
                'south' => $swLat,
                'east' => $neLng,
                'north' => $neLat,
            ]);
        }

        $nodeQuery->chunkById(5000, function ($nodes) use (&$points) {
            foreach ($nodes as $node) {
                $points[] = $this->transformOsmNode($node);
            }
        });

        return [
            'points' => $points,
        ];
    }

    private function osmNodeQuery(): Builder
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
                'created_at',
                'updated_at',
            ]);
    }
}
