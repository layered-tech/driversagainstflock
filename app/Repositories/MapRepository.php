<?php

namespace App\Repositories;

use App\Models\Marker;
use App\Models\OsmNode;
use App\Support\Bearing;
use Illuminate\Database\Eloquent\Builder;

class MapRepository
{
    private array $markerTypes = [
        'falcon-sr' => [
            'name' => 'Falcon (SR)',
            'icon' => 'falcon-sr',
        ],
        'falcon-lr' => [
            'name' => 'Falcon (LR)',
            'icon' => 'falcon-lr',
        ],
        'condor' => [
            'name' => 'Condor',
            'icon' => 'condor',
        ],
        'raven' => [
            'name' => 'Raven',
            'icon' => 'raven',
        ],
        'flock-trailer' => [
            'name' => 'Flock Trailer',
            'icon' => 'flock-trailer',
        ],
    ];

    private array $defaultStyle = [
        'circle_color' => '#59FF89',
        'stroke_color' => '#032E32',
        'cluster_circle_color' => '#59FF89',
        'cluster_stroke_color' => '#032E32',
    ];

    public function getEagerLoadedRelationships(): array
    {
        return [];
    }

    public function getEagerLoadedRelationshipsWithConfirmations(): array
    {
        return [
            'confirmations:id,marker_id,user_id',
            'confirmations.user:id,name',
        ];
    }

    public function getMarkerFileRelationships(): array
    {
        return [];
    }

    public function lazyMarkerFilePoints(): iterable
    {
        $markers = Marker::query()
            ->select(['id', 'bearing', 'point', 'type'])
            ->whereNotNull('point')
            ->where(function ($query) {
                $query
                    ->whereNull('type')
                    ->orWhere('type', '<>', 'overpass-node');
            })
            ->whereNull('deleted_at')
            ->lazyById(5000);

        foreach ($markers as $marker) {
            yield $this->transformMarkerForFile($marker);
        }

        foreach ($this->osmNodeQuery()->lazyById(5000) as $node) {
            yield $this->transformOsmNode($node);
        }
    }

    public function transformMarkerForFile(Marker $marker): array
    {
        $markerType = $this->markerTypes[$marker->type] ?? $this->markerTypes['falcon-sr'];

        $properties = [
            'id' => $marker->id,
            'bearing' => $marker->bearing,
            'icon' => $markerType['icon'],
            'type' => $markerType['name'],
            'heading' => $marker->bearing,
            'style' => $this->defaultStyle,
            'osm_nodes' => [],
        ];

        return [
            'location' => [
                $marker->point->longitude,
                $marker->point->latitude,
            ],
            'properties' => $properties,
        ];
    }

    public function transformMarker(Marker $marker): array
    {
        $point = $this->transformMarkerForFile($marker);

        $point['properties']['user_id'] = $marker->user_id;
        $point['properties']['created_at'] = $marker->created_at;
        $point['properties']['updated_at'] = $marker->updated_at;

        return $point;
    }

    public function transformOsmNode(OsmNode $node): array
    {
        $tags = $node->tags ?? [];
        $heading = Bearing::normalize(
            $node->direction
                ?? $node->camera_direction
                ?? $tags['direction']
                ?? $tags['camera:direction']
                ?? null
        );

        return [
            'location' => [
                (float) $node->longitude,
                (float) $node->latitude,
            ],
            'properties' => [
                'id' => 'osm-node-'.$node->id,
                'osm_id' => $node->osm_id,
                'bearing' => $heading,
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

        $query = Marker::query()
            ->select(['id', 'bearing', 'type', 'user_id', 'created_at', 'updated_at'])
            ->addSelect('point')
            ->whereNotNull('point')
            ->where(function ($query) {
                $query
                    ->whereNull('type')
                    ->orWhere('type', '<>', 'overpass-node');
            })
            ->whereNull('deleted_at');

        if ($swLng !== null && $swLat !== null && $neLng !== null && $neLat !== null) {
            $this->applyPointBounds($query, $swLng, $swLat, $neLng, $neLat);
        }

        $query->chunk(30 * 1000, function ($markers) use (&$points) {
            foreach ($markers as $marker) {
                $points[] = $this->transformMarker($marker);
            }
        });

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

    private function applyPointBounds(
        Builder $query,
        float $west,
        float $south,
        float $east,
        float $north,
    ): void {
        if ($west <= $east) {
            $this->applyEnvelope($query, $west, $south, $east, $north);

            return;
        }

        $query->where(function (Builder $query) use ($west, $south, $east, $north) {
            $this->applyEnvelope($query, $west, $south, 180.0, $north);
            $query->orWhere(function (Builder $query) use ($south, $east, $north) {
                $this->applyEnvelope($query, -180.0, $south, $east, $north);
            });
        });
    }

    private function applyEnvelope(
        Builder $query,
        float $west,
        float $south,
        float $east,
        float $north,
    ): void {
        $bindings = [$west, $south, $east, $north];

        $query
            ->whereRaw('point && ST_MakeEnvelope(?, ?, ?, ?, 4326)', $bindings)
            ->whereRaw('ST_Intersects(point, ST_MakeEnvelope(?, ?, ?, ?, 4326))', $bindings);
    }
}
