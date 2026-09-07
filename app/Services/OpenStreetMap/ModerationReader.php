<?php

namespace App\Services\OpenStreetMap;

use App\Models\ModerationReview;
use App\Models\OsmChangeset;
use App\Models\OsmChangesetComment;
use App\Models\OsmNode;
use App\Models\OsmNodeVersion;
use App\Models\WatchedArea;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ModerationReader
{
    /** @return array<string, mixed> */
    public function changesetDetail(int $id): array
    {
        $changeset = $this->query()->fromSub($this->changesets(), 'records')->where('id', $id)->first();
        abort_unless($changeset, 404);

        return ['changeset' => $this->normalize($changeset),
            'versions' => OsmNodeVersion::where('changeset_id', $id)->orderBy('node_id')->orderBy('osm_version')->paginate(200),
            'comments' => OsmChangesetComment::where('osm_changeset_id', $id)->where('visible', true)->orderBy('ordinal')->paginate(50, ['*'], 'comments_page'),
        ];
    }

    public function query(): Builder
    {
        return DB::connection((new OsmNode)->getConnectionName())->query();
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

    /** @param Collection<int, WatchedArea> $areas @return array<int, array<string, int|null>> */
    public function areaSummaries(Collection $areas): array
    {
        if ($areas->isEmpty()) {
            return [];
        }
        $json = $areas->map(fn (WatchedArea $area): array => ['id' => $area->id, 'geometry' => $area->geometry])->toJson();
        $areaRelation = DB::raw('jsonb_to_recordset(?::jsonb) as area(id bigint, geometry jsonb)');
        $changesets = $this->listing('changesets', [])->crossJoin($areaRelation)->addBinding($json, 'join')
            ->whereRaw('ST_Intersects(ST_SetSRID(ST_GeomFromGeoJSON(area.geometry::text),4326),ST_MakeEnvelope(min_lon,min_lat,max_lon,max_lat,4326))')
            ->selectRaw("area.id as area_id, count(*) FILTER (WHERE changed_at >= ?) as changesets_7d, count(*) FILTER (WHERE status = 'Flagged') as flagged_changesets", [now()->subDays(7)])
            ->groupBy('area.id')->get()->keyBy('area_id');

        return $areas->mapWithKeys(fn (WatchedArea $area): array => [$area->id => [
            'open_flags' => null,
            'changesets_7d' => (int) ($changesets->get($area->id)?->changesets_7d ?? 0),
            'flagged_changesets' => (int) ($changesets->get($area->id)?->flagged_changesets ?? 0),
        ]])->all();
    }

    /** @param array<string, mixed> $filters */
    public function listing(string $view, array $filters): Builder
    {
        $query = match ($view) {
            'nodes' => $this->query()->fromSub($this->nodes(), 'records'), 'editors' => $this->query()->fromSub($this->editors(), 'records'), default => $this->query()->fromSub($this->changesets(), 'records')
        };
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
                $this->inArea($query, $area, $view === 'nodes');
            }
        }
        if ($view === 'nodes') {
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

    public function nodes(): Builder
    {
        $latest = OsmNodeVersion::query()->selectRaw('DISTINCT ON (node_id) *')->orderBy('node_id')->orderByDesc('osm_version');
        $previous = OsmNodeVersion::query()->select(['tags', 'latitude', 'longitude', 'osm_version', 'osm_user', 'osm_uid'])
            ->whereColumn('node_id', 'latest.node_id')->whereColumn('osm_version', '<', 'latest.osm_version')->orderByDesc('osm_version')->limit(1);
        $base = $this->query()->fromSub($latest, 'latest')->leftJoinLateral($previous, 'previous')
            ->selectRaw("latest.node_id as id, latest.node_id as osm_node_id, latest.osm_version, latest.changeset_id as osm_changeset_id,
                latest.osm_uid, latest.osm_user, latest.osm_updated_at as changed_at, latest.visible,
                COALESCE(latest.latitude, previous.latitude) as latitude, COALESCE(latest.longitude, previous.longitude) as longitude,
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

    public function editors(): Builder
    {
        $changesets = $this->query()->fromSub($this->changesets(), 'edits')->whereNotNull('osm_uid')->groupBy('osm_uid')->selectRaw("osm_uid as id, osm_uid, (array_agg(osm_user ORDER BY changed_at DESC))[1] as name, min(changed_at) as first_active, max(changed_at) as last_active, count(*) as tracked_changesets, sum(added) as added, sum(modified) as modified, sum(deleted) as deleted, count(*) FILTER (WHERE status = 'Flagged') as flagged_changesets, count(*) FILTER (WHERE status = 'Reviewed') as reviewed_changesets");

        return $this->query()->fromSub($changesets, 'editors')->select('editors.*')
            ->selectRaw('NULL::bigint as flags_count, NULL::text as status');
    }

    public function inArea(Builder $query, WatchedArea $area, bool $node): Builder
    {
        return $query->whereRaw($node
            ? 'ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), ST_SetSRID(ST_MakePoint(longitude,latitude),4326))'
            : 'ST_Intersects(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), ST_MakeEnvelope(min_lon,min_lat,max_lon,max_lat,4326))', [json_encode($area->geometry, JSON_THROW_ON_ERROR)]);
    }
}
