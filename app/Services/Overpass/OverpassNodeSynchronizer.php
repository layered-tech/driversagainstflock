<?php

namespace App\Services\Overpass;

use App\Models\OsmNode;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

class OverpassNodeSynchronizer
{
    private const MAX_UPSERT_ROWS_PER_STATEMENT = 3000;

    /**
     * @param  array<int, array<string, mixed>>  $elements
     * @return array{synced: int, created: int, updated: int, restored: int}
     */
    public function syncMany(array $elements, ?string $syncImportId = null): array
    {
        $rows = [];

        foreach ($elements as $element) {
            $row = $this->rowFromElement($element, $syncImportId);

            if ($row === null) {
                continue;
            }

            $rows[] = $row;
        }

        if ($rows === []) {
            return [
                'synced' => 0,
                'created' => 0,
                'updated' => 0,
                'restored' => 0,
            ];
        }

        $osmIds = array_column($rows, 'osm_id');
        $existingCount = OsmNode::query()
            ->whereIntegerInRaw('osm_id', $osmIds)
            ->count();

        foreach (array_chunk($rows, self::MAX_UPSERT_ROWS_PER_STATEMENT) as $rowChunk) {
            $this->upsertRows($rowChunk);
        }

        return [
            'synced' => count($rows),
            'created' => count($rows) - $existingCount,
            'updated' => $existingCount,
            'restored' => 0,
        ];
    }

    /**
     * @param  array<string, mixed>  $element
     * @return 'created'|'updated'|null
     */
    public function syncNode(array $element, ?string $syncImportId = null): ?string
    {
        $row = $this->rowFromElement($element, $syncImportId);

        if ($row === null) {
            return null;
        }

        $exists = OsmNode::query()
            ->where('osm_id', $row['osm_id'])
            ->exists();

        $this->upsertRows([$row]);

        return $exists ? 'updated' : 'created';
    }

    /**
     * @param  array<string, mixed>  $element
     * @return array{osm_id: int, latitude: float, longitude: float, tags: array<string, string>, surveillance_type: string|null, direction: string|null, camera_direction: string|null, osm_updated_at: string|null, osm_version: int|null, osm_changeset_id: int|null, osm_user: string|null, osm_uid: int|null, sync_import_id: string|null, synced_at: string}|null
     */
    private function rowFromElement(array $element, ?string $syncImportId): ?array
    {
        $nodeId = $element['id'] ?? null;
        $lat = $element['lat'] ?? null;
        $lon = $element['lon'] ?? null;

        if (! is_numeric($nodeId) || ! is_numeric($lat) || ! is_numeric($lon)) {
            return null;
        }

        $tags = $this->tagsFromElement($element);

        return [
            'osm_id' => (int) $nodeId,
            'latitude' => (float) $lat,
            'longitude' => (float) $lon,
            'tags' => $tags,
            'surveillance_type' => Arr::get($tags, 'surveillance:type'),
            'direction' => Arr::get($tags, 'direction'),
            'camera_direction' => Arr::get($tags, 'camera:direction'),
            'osm_updated_at' => $this->timestampFromElement($element['timestamp'] ?? null),
            'osm_version' => $this->integerFromElement($element['version'] ?? null),
            'osm_changeset_id' => $this->integerFromElement($element['changeset'] ?? null),
            'osm_user' => $this->stringFromElement($element['user'] ?? null),
            'osm_uid' => $this->integerFromElement($element['uid'] ?? null),
            'sync_import_id' => $syncImportId,
            'synced_at' => now()->toDateTimeString(),
        ];
    }

    /**
     * @param  array<string, mixed>  $element
     * @return array<string, string>
     */
    private function tagsFromElement(array $element): array
    {
        if (! isset($element['tags']) || ! is_array($element['tags'])) {
            return [];
        }

        return array_map(
            fn (mixed $value): string => (string) $value,
            $element['tags'],
        );
    }

    private function timestampFromElement(mixed $value): ?string
    {
        if (! is_scalar($value) || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse((string) $value)->toDateTimeString();
        } catch (Throwable) {
            return null;
        }
    }

    private function integerFromElement(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }

        return (int) $value;
    }

    private function stringFromElement(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    /**
     * @param  array<int, array{osm_id: int, latitude: float, longitude: float, tags: array<string, string>, surveillance_type: string|null, direction: string|null, camera_direction: string|null, osm_updated_at: string|null, osm_version: int|null, osm_changeset_id: int|null, osm_user: string|null, osm_uid: int|null, sync_import_id: string|null, synced_at: string}>  $rows
     */
    private function upsertRows(array $rows): void
    {
        $table = (new OsmNode)->getTable();
        $values = [];
        $bindings = [];

        foreach ($rows as $row) {
            $values[] = '(?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

            array_push(
                $bindings,
                $row['osm_id'],
                $row['latitude'],
                $row['longitude'],
                $row['longitude'],
                $row['latitude'],
                json_encode($row['tags'], JSON_THROW_ON_ERROR),
                $row['surveillance_type'],
                $row['direction'],
                $row['camera_direction'],
                $row['osm_updated_at'],
                $row['osm_version'],
                $row['osm_changeset_id'],
                $row['osm_user'],
                $row['osm_uid'],
                $row['sync_import_id'],
                $row['synced_at'],
                $row['synced_at'],
                $row['synced_at'],
            );
        }

        DB::statement(
            sprintf(
                <<<'SQL'
                INSERT INTO %s (
                    osm_id,
                    latitude,
                    longitude,
                    location,
                    tags,
                    surveillance_type,
                    direction,
                    camera_direction,
                    osm_updated_at,
                    osm_version,
                    osm_changeset_id,
                    osm_user,
                    osm_uid,
                    sync_import_id,
                    last_synced_at,
                    created_at,
                    updated_at
                ) VALUES %s
                ON CONFLICT (osm_id) DO UPDATE SET
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    location = EXCLUDED.location,
                    tags = EXCLUDED.tags,
                    surveillance_type = EXCLUDED.surveillance_type,
                    direction = EXCLUDED.direction,
                    camera_direction = EXCLUDED.camera_direction,
                    osm_updated_at = EXCLUDED.osm_updated_at,
                    osm_version = EXCLUDED.osm_version,
                    osm_changeset_id = EXCLUDED.osm_changeset_id,
                    osm_user = EXCLUDED.osm_user,
                    osm_uid = EXCLUDED.osm_uid,
                    sync_import_id = EXCLUDED.sync_import_id,
                    last_synced_at = EXCLUDED.last_synced_at,
                    updated_at = EXCLUDED.updated_at
                SQL,
                $table,
                implode(', ', $values),
            ),
            $bindings,
        );
    }

    /**
     * @param  array{south: string, west: string, north: string, east: string}|null  $bbox
     */
    public function deleteMissingNodes(?string $syncImportId, ?array $bbox): int
    {
        if (! is_string($syncImportId) || $syncImportId === '') {
            return 0;
        }

        $query = OsmNode::query()
            ->where(function ($query) use ($syncImportId) {
                $query
                    ->whereNull('sync_import_id')
                    ->orWhere('sync_import_id', '<>', $syncImportId);
            });

        if ($bbox) {
            $query->withinBounds([
                'west' => (float) $bbox['west'],
                'south' => (float) $bbox['south'],
                'east' => (float) $bbox['east'],
                'north' => (float) $bbox['north'],
            ]);
        }

        return (int) $query->delete();
    }

    /**
     * @param  array<int, int>  $nodeIds
     */
    public function deleteMany(array $nodeIds): int
    {
        $nodeIds = array_values(array_unique(array_map('intval', $nodeIds)));

        if ($nodeIds === []) {
            return 0;
        }

        return OsmNode::query()
            ->whereIntegerInRaw('osm_id', $nodeIds)
            ->delete();
    }

    public function deleteNode(int $nodeId): bool
    {
        return (bool) OsmNode::query()
            ->where('osm_id', $nodeId)
            ->delete();
    }
}
