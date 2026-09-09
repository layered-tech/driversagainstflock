<?php

namespace App\Services\OpenStreetMap;

use App\Models\ModerationFlag;
use App\Models\ModerationReview;
use App\Models\OsmChangeset;
use App\Models\OsmChangesetComment;
use App\Models\OsmNode;
use App\Models\OsmNodeVersion;
use App\Models\WatchedArea;
use Illuminate\Database\Query\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class ModerationReader
{
    /** @return array{node: array<string, mixed>, versions: array<int, array<string, mixed>>, flags: array<int, array<string, mixed>>} */
    public function nodeDetail(int $id): array
    {
        $node = $this->query()->fromSub($this->nodes(), 'records')->where('id', $id)->first();
        abort_unless($node, 404);

        $versions = OsmNodeVersion::query()
            ->where('node_id', $id)
            ->orderBy('osm_version')
            ->get([
                'id', 'node_id', 'osm_version', 'visible', 'latitude', 'longitude', 'tags',
                'osm_updated_at', 'changeset_id', 'osm_uid', 'osm_user',
            ]);
        $changesetComments = OsmChangeset::query()
            ->whereIn('osm_changeset_id', $versions->pluck('changeset_id')->filter()->unique())
            ->get(['osm_changeset_id', 'tags'])
            ->mapWithKeys(fn (OsmChangeset $changeset): array => [
                (string) $changeset->osm_changeset_id => $changeset->tags['comment'] ?? null,
            ]);
        $lastLocation = null;
        $normalizedVersions = $versions->map(function (OsmNodeVersion $version) use ($changesetComments, &$lastLocation): array {
            $data = $version->toArray();
            $hasLocation = $version->latitude !== null && $version->longitude !== null;
            $data['location_is_historical'] = ! $hasLocation && $lastLocation !== null;
            if (! $hasLocation && $lastLocation !== null) {
                [$data['latitude'], $data['longitude']] = $lastLocation;
            }
            if ($hasLocation) {
                $lastLocation = [(float) $version->latitude, (float) $version->longitude];
            }
            $data['comment'] = $changesetComments->get((string) $version->changeset_id);

            return $data;
        })->all();
        $flags = ModerationFlag::query()
            ->with('rule:id,name,severity,enabled')
            ->where(fn ($query) => $query->where('node_id', $id)->orWhere('related_node_id', $id))
            ->latest('evaluated_at')
            ->get()
            ->toArray();

        return [
            'node' => $this->normalize($node),
            'versions' => $normalizedVersions,
            'flags' => $flags,
        ];
    }

    public function query(): Builder
    {
        return DB::connection((new OsmNode)->getConnectionName())->query();
    }

    public function nodes(): Builder
    {
        $latest = OsmNodeVersion::query()->selectRaw('DISTINCT ON (node_id) *')->orderBy('node_id')->orderByDesc('osm_version');
        $previous = OsmNodeVersion::query()->select(['tags', 'latitude', 'longitude', 'osm_version', 'osm_user', 'osm_uid'])
            ->whereColumn('node_id', 'latest.node_id')->whereColumn('osm_version', '<', 'latest.osm_version')->orderByDesc('osm_version')->limit(1);
        $base = $this->query()->fromSub($latest, 'latest')->leftJoinLateral($previous, 'previous')
            ->selectRaw("latest.node_id as id, latest.node_id as osm_node_id, latest.osm_version, latest.changeset_id as osm_changeset_id,
                latest.osm_uid, latest.osm_user, latest.osm_updated_at as changed_at, latest.visible,
                COALESCE(latest.latitude, previous.latitude) as latitude, COALESCE(latest.longitude, previous.longitude) as longitude,
                ((latest.latitude IS NULL OR latest.longitude IS NULL) AND previous.latitude IS NOT NULL AND previous.longitude IS NOT NULL) as location_is_historical,
                latest.tags, latest.tags->>'operator' as operator,
                CASE WHEN previous.osm_version IS NOT NULL THEN jsonb_build_object('tags',previous.tags,'osm_version',previous.osm_version,'latitude',previous.latitude,'longitude',previous.longitude,'osm_user',previous.osm_user) END as previous,
                md5(concat_ws('|', latest.node_id, latest.osm_version, latest.tags::text, latest.visible, latest.latitude, latest.longitude)) as revision,
                CASE WHEN trim(COALESCE(latest.tags->>'camera:direction',latest.tags->>'direction','')) ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN CASE WHEN COALESCE(latest.tags->>'camera:direction',latest.tags->>'direction')::numeric BETWEEN 0 AND 360
                    THEN round(COALESCE(latest.tags->>'camera:direction',latest.tags->>'direction')::numeric)::int % 360 END
                    ELSE CASE upper(COALESCE(latest.tags->>'camera:direction',latest.tags->>'direction')) WHEN 'N' THEN 0 WHEN 'NE' THEN 45 WHEN 'E' THEN 90 WHEN 'SE' THEN 135 WHEN 'S' THEN 180 WHEN 'SW' THEN 225 WHEN 'W' THEN 270 WHEN 'NW' THEN 315 END END as direction");
        $query = $this->query()->fromSub($base, 'source');
        $this->reviews($query, 'node');

        return $query->select('source.*')->selectRaw("COALESCE(review.status, 'Needs review') as status");
    }

    private function reviews(Builder $query, string $type): void
    {
        $reviews = ModerationReview::where('subject_type', $type)->get(['subject_id', 'revision', 'status'])->toJson();
        $query->leftJoin(DB::raw('jsonb_to_recordset(?::jsonb) as review(subject_id bigint, revision text, status text)'), function ($join): void {
            $join->on('review.subject_id', '=', 'source.id')->on('review.revision', '=', 'source.revision');
        })->addBinding($reviews, 'join');
    }

    /** @return array<string, mixed> */
    public function normalize(object $record): array
    {
        $data = (array) $record;
        foreach (['tags', 'bounds', 'previous'] as $key) {
            if (isset($data[$key]) && is_string($data[$key])) {
                $data[$key] = json_decode($data[$key], true, flags: JSON_THROW_ON_ERROR);
            }
        }

        return $data;
    }

    /** @return array<string, mixed> */
    public function changesetDetail(int $id): array
    {
        $changeset = $this->query()->fromSub($this->changesets(), 'records')->where('id', $id)->first();
        abort_unless($changeset, 404);

        return ['changeset' => $this->normalize($changeset),
            'versions' => $this->changesetVersions($id),
            'comments' => OsmChangesetComment::where('osm_changeset_id', $id)->where('visible', true)->orderBy('ordinal')->paginate(50, ['*'], 'comments_page'),
        ];
    }

    public function changesets(): Builder
    {
        $source = OsmChangeset::query()->select([
            'osm_changeset_id as id', 'osm_changeset_id', 'osm_uid', 'osm_user',
            'created_at as changed_at', 'closed_at', 'open', 'tags', 'observed_at',
            'alpr_nodes_created as added', 'alpr_nodes_modified as modified',
            'alpr_nodes_deleted as deleted', 'alpr_nodes_touched as total',
            'min_lon', 'min_lat', 'max_lon', 'max_lat', 'osm_num_changes', 'comments_count',
            'available_discussion_comments',
        ])->where('alpr_nodes_touched', '>', 0)
            ->selectRaw("tags->>'comment' as comment, CASE WHEN min_lon IS NOT NULL THEN jsonb_build_array(min_lon,min_lat,max_lon,max_lat) END as bounds")
            ->selectRaw("md5(concat_ws('|', osm_changeset_id, tags::text, open, alpr_nodes_created, alpr_nodes_modified, alpr_nodes_deleted)) as revision");
        $query = $this->query()->fromSub($source, 'source');
        $this->reviews($query, 'changeset');

        return $query->select('source.*')->selectRaw("COALESCE(review.status, 'Needs review') as status");
    }

    /** @return LengthAwarePaginator<int, OsmNodeVersion> */
    private function changesetVersions(int $id): LengthAwarePaginator
    {
        $currentVersions = OsmNodeVersion::query()->where('changeset_id', $id);
        $previousLocation = OsmNodeVersion::query()
            ->select(['latitude', 'longitude'])
            ->whereColumn('node_id', 'current.node_id')
            ->whereColumn('osm_version', '<', 'current.osm_version')
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->orderByDesc('osm_version')
            ->limit(1);

        return OsmNodeVersion::query()
            ->fromSub($currentVersions, 'current')
            ->leftJoinLateral($previousLocation, 'previous_location')
            ->select([
                'current.id', 'current.node_id', 'current.osm_version', 'current.visible', 'current.geom',
                'current.tags', 'current.osm_updated_at', 'current.changeset_id', 'current.osm_uid', 'current.osm_user',
            ])
            ->selectRaw('COALESCE(current.latitude, previous_location.latitude) as latitude')
            ->selectRaw('COALESCE(current.longitude, previous_location.longitude) as longitude')
            ->selectRaw('((current.latitude IS NULL OR current.longitude IS NULL) AND previous_location.latitude IS NOT NULL AND previous_location.longitude IS NOT NULL) as location_is_historical')
            ->orderBy('current.node_id')
            ->orderBy('current.osm_version')
            ->paginate(200);
    }

    /** @param array<string, mixed> $filters */
    public function listing(string $view, array $filters): Builder
    {
        $query = match ($view) {
            'nodes', 'flagged' => $this->query()->fromSub($this->nodes(), 'records'), 'editors' => $this->query()->fromSub($this->editors(), 'records'), default => $this->query()->fromSub($this->changesets(), 'records')
        };
        if ($view === 'flagged') {
            $flags = ModerationFlag::active()
                ->when($filters['rules'] ?? [], fn ($query, array $rules) => $query->whereIn('rule_id', $rules))
                ->when($filters['severities'] ?? [], fn ($query, array $severities) => $query->whereHas('rule', fn ($rule) => $rule->whereIn('severity', $severities)))
                ->get(['node_id', 'related_node_id']);
            $nodeIds = $flags->flatMap(fn (ModerationFlag $flag): array => [$flag->node_id, $flag->related_node_id])->filter()->unique()->values();
            $query->whereIntegerInRaw('id', $nodeIds);
        }
        $timeColumn = $view === 'editors' ? 'last_active' : 'changed_at';
        $userColumn = $view === 'editors' ? 'name' : 'osm_user';
        if (! empty($filters['user'])) {
            ctype_digit($filters['user']) ? $query->where('osm_uid', $filters['user']) : $query->whereLike($userColumn, '%'.$filters['user'].'%');
        }
        if (! empty($filters['uid'])) {
            $query->where('osm_uid', $filters['uid']);
        }
        if (! empty($filters['changeset']) && $view !== 'editors') {
            $query->where('osm_changeset_id', $filters['changeset']);
        }
        if (! empty($filters['window'])) {
            $query->where($timeColumn, '>=', match ($filters['window']) {
                '24h' => now()->subDay(), '7d' => now()->subDays(7), default => now()->subDays(30)
            });
        }
        if (! empty($filters['statuses'])) {
            $query->whereIn('status', $filters['statuses']);
        }
        if (! empty($filters['area'])) {
            $area = WatchedArea::findOrFail($filters['area']);
            if ($view === 'editors') {
                $query->whereIn('osm_uid', $this->inArea($this->query()->fromSub($this->changesets(), 'located')->select('osm_uid'), $area, false));
            } else {
                $this->inArea($query, $area, in_array($view, ['nodes', 'flagged'], true));
            }
        }
        if (in_array($view, ['nodes', 'flagged'], true)) {
            if (! empty($filters['osm_id'])) {
                $query->where('id', $filters['osm_id']);
            }
            if (! empty($filters['operator'])) {
                $query->whereLike('operator', '%'.$filters['operator'].'%');
            }
            if (! empty($filters['missing_direction'])) {
                $query->whereRaw("trim(COALESCE(tags->>'camera:direction',tags->>'direction','')) = ''");
            }
            $from = $filters['direction_from'] ?? null;
            $to = $filters['direction_to'] ?? null;
            if ($from !== null && $to !== null && $from > $to) {
                $query->where(fn (Builder $q): Builder => $q->where('direction', '>=', $from)->orWhere('direction', '<=', $to));
            } else {
                if ($from !== null) {
                    $query->where('direction', '>=', $from);
                }
                if ($to !== null) {
                    $query->where('direction', '<=', $to);
                }
            }
        } elseif ($view !== 'editors' && ! empty($filters['kinds'])) {
            $query->where(function (Builder $q) use ($filters): void {
                foreach ($filters['kinds'] as $kind) {
                    $q->orWhere($kind, '>', 0);
                }
            });
        }

        return $query;
    }

    public function editors(): Builder
    {
        $changesets = $this->query()->fromSub($this->changesets(), 'edits')->whereNotNull('osm_uid')->groupBy('osm_uid')->selectRaw("osm_uid as id, osm_uid, (array_agg(osm_user ORDER BY changed_at DESC))[1] as name, min(changed_at) as first_active, max(changed_at) as last_active, count(*) as tracked_changesets, sum(added) as added, sum(modified) as modified, sum(deleted) as deleted, count(*) FILTER (WHERE status = 'Flagged') as flagged_changesets, count(*) FILTER (WHERE status = 'Reviewed') as reviewed_changesets");

        return $this->query()->fromSub($changesets, 'editors')->select('editors.*')
            ->selectRaw('NULL::bigint as flags_count, NULL::text as status');
    }

    public function inArea(Builder $query, WatchedArea $area, bool $node): Builder
    {
        if (! $node) {
            return $query->whereIn('osm_changeset_id', $this->locatedVersions($area)->select('changeset_id'));
        }

        return $query->whereRaw('ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), ST_SetSRID(ST_MakePoint(longitude,latitude),4326))', [json_encode($area->geometry, JSON_THROW_ON_ERROR)]);
    }

    public function locatedVersions(WatchedArea $area): Builder
    {
        $versions = OsmNodeVersion::query()->select(['node_id', 'changeset_id', 'longitude', 'latitude'])
            ->selectRaw('lag(longitude) over (partition by node_id order by osm_version) as before_lon, lag(latitude) over (partition by node_id order by osm_version) as before_lat');

        return $this->query()->fromSub($versions, 'positions')->where(function (Builder $query) use ($area): void {
            $geometry = json_encode($area->geometry, JSON_THROW_ON_ERROR);
            $query->whereRaw('ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), ST_SetSRID(ST_MakePoint(longitude,latitude),4326))', [$geometry])
                ->orWhereRaw('ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), ST_SetSRID(ST_MakePoint(before_lon,before_lat),4326))', [$geometry]);
        });
    }
}
