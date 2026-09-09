<?php

namespace App\Services\OpenStreetMap;

use App\Models\ModerationContribution;
use App\Models\ModerationFlag;
use App\Models\ModerationOutcome;
use App\Models\ModerationProcess;
use App\Models\ModerationRule;
use App\Models\OsmEditorProfile;
use App\Models\OsmNodeVersion;
use App\Models\WatchedArea;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class ModerationSummaries
{
    public function __construct(private ModerationReader $reader, private ModerationSummaryCache $cache) {}

    public function editor(int $uid): array
    {
        return $this->cache->remember('editor', ['uid' => $uid], function () use ($uid): array {
            $row = $this->reader->editors()->where('osm_uid', $uid)->first();
            abort_unless($row, 404);
            $row = $this->reader->normalize($row);
            $sets = $this->reader->listing('changesets', ['uid' => $uid])->orderBy('changed_at')->get(['id', 'osm_uid', 'total', 'changed_at']);
            $contributions = ModerationContribution::where('osm_uid', $uid)->with('outcomes')->get();
            $states = $this->states($sets, $contributions);
            $counts = array_count_values($states);
            $classified = count($states) - ($counts['unknown'] ?? 0);
            $events = $contributions->where('history_complete', true)->flatMap(fn ($c) => $c->outcomes->where('self_edit', false));
            $byContribution = $contributions->keyBy('id');
            $firstEvents = $events->sortBy('occurred_at')->unique(fn ($event) => $byContribution[$event->contribution_id]->changeset_id);
            $delays = $firstEvents->pluck('elapsed_seconds')->sort()->values();
            $reverters = $events->unique(fn ($e) => $e->later_osm_uid.':'.$byContribution[$e->contribution_id]->changeset_id)->groupBy('later_osm_uid')->sortByDesc->count();
            $top = $reverters->first();
            $weeks = collect(range(11, 0))->map(function (int $offset) use ($sets, $states): array {
                $start = now()->utc()->startOfWeek()->subWeeks($offset);
                $end = $start->copy()->addWeek();
                $week = $sets->filter(fn ($set) => CarbonImmutable::parse($set->changed_at)->between($start, $end, false) || CarbonImmutable::parse($set->changed_at)->equalTo($start));

                return ['week' => $start->toIso8601String(), 'total' => $week->count(), 'reverted' => $week->isNotEmpty() && $week->every(fn ($set) => ($states[$set->id] ?? 'unknown') === 'unknown') ? null : $week->filter(fn ($set) => ($states[$set->id] ?? 'unknown') === 'reverted')->count()];
            })->all();
            $mappingAreas = WatchedArea::orderBy('name')->get()->map(function (WatchedArea $area) use ($uid): array {
                $query = $this->reader->listing('changesets', ['uid' => $uid, 'area' => $area->id]);
                $activity = $query->selectRaw('count(*) as total, max(changed_at) as last_active')->first();

                return ['id' => $area->id, 'name' => $area->name, 'count' => (int) $activity->total, 'last_active' => $activity->last_active];
            })->filter(fn (array $area): bool => $area['count'] > 0)->values()->all();
            $profile = OsmEditorProfile::where('osm_uid', $uid)->first();
            $flags = $this->flagsForEditor($uid);

            return [...$row,
                'name' => $profile?->display_name ?: $row['name'], 'identity' => $profile?->toArray(),
                'flags_count' => $flags, 'area_count' => count($mappingAreas), 'mapping_areas' => $mappingAreas,
                'survival' => ['intact' => $classified ? ($counts['intact'] ?? 0) : null, 'edited' => $classified ? ($counts['edited'] ?? 0) : null, 'reverted' => $classified ? ($counts['reverted'] ?? 0) : null, 'unknown' => $counts['unknown'] ?? 0,
                    'classified' => $classified, 'percent' => $classified ? round(100 * ($classified - ($counts['reverted'] ?? 0)) / $classified, 1) : null],
                'revert_stats' => ['median_seconds' => $delays->isEmpty() ? null : $delays->median(),
                    'most_reverted_by' => $top ? ['uid' => $top->first()->later_osm_uid, 'name' => $top->first()->later_osm_user, 'count' => $top->count()] : null,
                    'last_revert' => $events->max('occurred_at')?->toIso8601String(),
                    'affected_nodes' => $classified ? $contributions->where('status', 'reverted')->pluck('node_id')->unique()->count() : null,
                    'performed' => $contributions->where('history_complete', true)->isEmpty() ? null : ModerationOutcome::where('later_osm_uid', $uid)->where('self_edit', false)->whereIn('contribution_id', ModerationContribution::where('history_complete', true)->select('id'))->distinct('later_changeset_id')->count('later_changeset_id')],
                'weeks' => $weeks,
            ];
        });
    }

    public function states(Collection $sets, Collection $contributions): array
    {
        $grouped = $contributions->groupBy('changeset_id');
        $nodeIds = $contributions->pluck('node_id')->unique();
        $latest = OsmNodeVersion::whereIntegerInRaw('node_id', $nodeIds)->selectRaw('node_id, max(osm_version) as version')->groupBy('node_id')->get()->pluck('version', 'node_id');
        $processed = ModerationContribution::whereIntegerInRaw('node_id', $nodeIds)->selectRaw('node_id, max(node_version) as version')->groupBy('node_id')->get()->pluck('version', 'node_id');
        $pendingNodes = $latest->filter(fn ($version, $id) => $processed->get($id) !== $version)->keys()->flip();

        return $sets->mapWithKeys(function ($set) use ($grouped, $pendingNodes): array {
            $id = $set->id;
            $items = $grouped->get($id, collect());
            $state = $items->count() < $set->total || $items->isEmpty() || $items->contains('history_complete', false) || $items->contains(fn ($item) => $pendingNodes->has($item->node_id)) ? 'unknown'
                : ($items->contains('status', 'reverted') ? 'reverted' : ($items->contains('status', 'edited') ? 'edited' : 'intact'));

            return [$id => $state];
        })->all();
    }

    public function flagsForEditor(int $uid): ?int
    {
        if (! $this->rulesReady()) {
            return null;
        }
        $nodes = OsmNodeVersion::where('osm_uid', $uid)->distinct()->pluck('node_id');
        $flags = ModerationFlag::active()->where(fn ($q) => $q->whereIntegerInRaw('node_id', $nodes)->orWhereIntegerInRaw('related_node_id', $nodes))->get();

        return $flags->flatMap(fn ($flag) => [$flag->node_id, $flag->related_node_id])->filter()->unique()->intersect($nodes)->count();
    }

    public function rulesReady(): bool
    {
        $rules = ModerationRule::where('enabled', true)->get(['id', 'version']);
        $names = $rules->map(fn ($rule) => 'rule:'.$rule->id.':'.$rule->version);

        return $names->isEmpty()
            ? ModerationProcess::where('name', 'rules')->whereNotNull('last_success_at')->exists()
            : ModerationProcess::whereIn('name', $names)->whereNotNull('last_success_at')->count() === $names->count();
    }

    public function area(WatchedArea $area): array
    {
        return $this->cache->remember('area', ['id' => $area->id, 'geometry' => $area->geometry], function () use ($area): array {
            $sets = $this->reader->listing('changesets', ['area' => $area->id])->get(['id', 'osm_uid', 'total', 'changed_at', 'status']);
            $ids = $sets->pluck('id');
            $states = $this->states($sets, ModerationContribution::whereIntegerInRaw('changeset_id', $ids)->get());
            $nodes = $this->reader->listing('nodes', ['area' => $area->id])->pluck('id');
            $flags = ModerationFlag::active()->where(fn ($q) => $q->whereIntegerInRaw('node_id', $nodes)->orWhereIntegerInRaw('related_node_id', $nodes))->get();
            $flaggedNodes = $flags->flatMap(fn ($flag) => [$flag->node_id, $flag->related_node_id])->filter()->unique()->intersect($nodes);

            return [
                'changesets_7d' => $sets->filter(fn ($set) => CarbonImmutable::parse($set->changed_at)->gte(now()->subDays(7)))->count(),
                'changesets_count' => $sets->count(), 'active_editors' => $sets->pluck('osm_uid')->filter()->unique()->count(),
                'affected_nodes' => $this->reader->locatedVersions($area)->distinct()->count('node_id'),
                'flagged_changesets' => $sets->where('status', 'Flagged')->count(),
                'reverted_changesets' => $sets->isNotEmpty() && ! array_filter($states, fn ($state) => $state !== 'unknown') ? null : count(array_filter($states, fn ($state) => $state === 'reverted')),
                'open_flags' => $this->rulesReady() ? $flaggedNodes->count() : null,
                'open_violations' => $this->rulesReady() ? $flags->count() : null,
                'nodes' => $this->reader->listing('nodes', ['area' => $area->id])->limit(100)->get(['id', 'latitude', 'longitude'])->map(fn ($node) => (array) $node)->all(),
            ];
        });
    }

    public function timeline(Collection $records): Collection
    {
        $contributions = ModerationContribution::whereIntegerInRaw('changeset_id', $records->pluck('id'))->with('outcomes')->get()->groupBy('changeset_id');

        return $records->map(function (array $record) use ($contributions): array {
            $items = $contributions->get($record['id'], collect());
            $record['outcomes'] = $items->flatMap(function ($item) {
                return $item->outcomes->where('self_edit', false)->map(fn ($outcome) => [...$outcome->toArray(), 'node_id' => $item->node_id, 'history_complete' => $item->history_complete]);
            })->values()->all();

            return $record;
        });
    }
}
