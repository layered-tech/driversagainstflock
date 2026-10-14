<?php

namespace App\Services\Areas;

use App\Models\AreaSubscription;
use App\Models\OsmNode;
use App\Models\OsmNodeVersion;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class AreaChanges
{
    public function latestVersionId(): int
    {
        return (int) OsmNodeVersion::max('id');
    }

    /** @return array<string, mixed> */
    public function summary(AreaSubscription $area, string $window = '7'): array
    {
        $since = match ($window) {
            '24h' => now()->subDay(), '30' => now()->subDays(30), default => now()->subDays(7)
        };
        $query = $this->query($area)->where('osm_updated_at', '>=', $since);

        return [...$area->only(['id', 'name', 'kind', 'definition', 'geometry', 'bounds', 'alert_mode', 'notify_added', 'notify_removed', 'digest_time']),
            'camera_count' => $this->cameraCount($area->geometry),
            'counts' => $this->counts($query),
            'unread_count' => (clone $query)->where('id', '>', $area->last_read_version_id)->count(),
        ];
    }

    /**
     * A first observed historical version is not necessarily a new camera. Only
     * version one or an observed non-ALPR -> ALPR transition establishes an addition.
     */
    public function query(AreaSubscription $area): Builder
    {
        $previous = OsmNodeVersion::query()->select(['id', 'visible', 'tags', 'latitude', 'longitude'])
            ->whereColumn('node_id', 'current.node_id')->whereColumn('osm_version', '<', 'current.osm_version')
            ->orderByDesc('osm_version')->limit(1);
        $currentIsAlpr = "(current.visible AND current.tags->>'surveillance:type' = 'ALPR')";
        $previousIsAlpr = "COALESCE(previous.visible AND previous.tags->>'surveillance:type' = 'ALPR', false)";
        $source = OsmNodeVersion::query()->from((new OsmNodeVersion)->getTable(), 'current')
            ->leftJoinLateral($previous, 'previous')
            ->select(['current.id', 'current.node_id', 'current.osm_version', 'current.osm_updated_at', 'current.osm_user'])
            ->selectRaw("CASE WHEN {$currentIsAlpr} THEN 'added' ELSE 'removed' END as kind")
            ->selectRaw("CASE WHEN {$currentIsAlpr} THEN current.tags ELSE previous.tags END as tags")
            ->selectRaw("CASE WHEN {$currentIsAlpr} THEN current.longitude ELSE previous.longitude END as longitude")
            ->selectRaw("CASE WHEN {$currentIsAlpr} THEN current.latitude ELSE previous.latitude END as latitude")
            ->whereRaw("(({$currentIsAlpr} AND NOT {$previousIsAlpr} AND (current.osm_version = 1 OR previous.id IS NOT NULL)) OR (NOT COALESCE({$currentIsAlpr}, false) AND {$previousIsAlpr}))");

        return DB::connection(config('osm.reader.connection'))->query()->fromSub($source, 'changes')
            ->whereRaw('ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), ST_SetSRID(ST_MakePoint(longitude,latitude),4326))', [json_encode($area->geometry, JSON_THROW_ON_ERROR)]);
    }

    /** @param array<string, mixed> $geometry */
    public function cameraCount(array $geometry): int
    {
        return $this->cameras($geometry)->count();
    }

    /** @param array<string, mixed> $geometry */
    public function cameras(array $geometry): EloquentBuilder
    {
        return OsmNode::whereRaw('ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), location)', [json_encode($geometry, JSON_THROW_ON_ERROR)]);
    }

    /** @return array{added: int, removed: int} */
    public function counts(Builder $query): array
    {
        $counts = (clone $query)->selectRaw('kind, count(*) as total')->groupBy('kind')->pluck('total', 'kind');

        return ['added' => (int) ($counts['added'] ?? 0), 'removed' => (int) ($counts['removed'] ?? 0)];
    }

    /** @return array<string, mixed> */
    public function normalize(object $change): array
    {
        $tags = is_string($change->tags) ? json_decode($change->tags, true, flags: JSON_THROW_ON_ERROR) : $change->tags;

        return ['id' => (int) $change->id, 'node_id' => (int) $change->node_id, 'version' => (int) $change->osm_version,
            'kind' => $change->kind, 'changed_at' => CarbonImmutable::parse($change->osm_updated_at)->toIso8601String(),
            'longitude' => (float) $change->longitude, 'latitude' => (float) $change->latitude,
            'street' => $tags['name'] ?? $tags['addr:street'] ?? $tags['description'] ?? 'OpenStreetMap camera',
            'operator' => $tags['operator'] ?? $tags['manufacturer'] ?? $tags['brand'] ?? 'Unknown operator',
            'direction' => $tags['camera:direction'] ?? $tags['direction'] ?? null,
            'mapped_by' => $change->osm_user,
        ];
    }
}
