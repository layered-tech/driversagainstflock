<?php

namespace App\Services\OpenStreetMap;

use App\Models\ModerationEvaluation;
use App\Models\ModerationFlag;
use App\Models\ModerationRule;
use App\Models\WatchedArea;
use Illuminate\Support\Facades\DB;
use Throwable;

class ModerationRuleEvaluator
{
    public function __construct(private ModerationReader $reader, private ModerationRoadLookup $roads) {}

    public function evaluate(ModerationRule $rule, array $node, bool $persist = true): array
    {
        try {
            $matches = $this->matches($rule, $node);
            $result = ['state' => $matches ? 'matched' : 'clear', 'matches' => $matches, 'error' => null];
        } catch (Throwable $exception) {
            report($exception);
            $result = ['state' => 'not_evaluated', 'matches' => [], 'error' => 'Required data is unavailable or incomplete. Evaluation will retry.'];
        }
        if ($persist) {
            $affectedNodes = $this->save($rule, $node, $result);
            if ($affectedNodes !== []) {
                app(ModerationEditorSummaries::class)->markEditorsForNodesDirty($affectedNodes);
            }
        }

        return ['node_id' => $node['id'], ...$result];
    }

    private function matches(ModerationRule $rule, array $node): array
    {
        if (! $this->eligible($rule, $node)) {
            return [];
        }
        $settings = $rule->settings;
        $tags = $node['tags'];
        if ($rule->type === 'missing_tags') {
            $missing = array_values(array_filter($settings['keys'], fn ($key) => ! array_key_exists($key, $tags) || (($settings['blank_is_missing'] ?? true) && trim($tags[$key]) === '')));

            return $missing ? [['related_node_id' => 0, 'missing_tags' => $missing]] : [];
        }
        if ($rule->type === 'invalid_tag') {
            $value = $tags[$settings['key']] ?? null;
            if ($value === null) {
                return [];
            }
            $valid = empty($settings['allowed_values']) || in_array($value, $settings['allowed_values'], true);
            $numeric = is_numeric($value);
            $valid = $valid && (! isset($settings['min']) || ($numeric && $value >= $settings['min']))
                && (! isset($settings['max']) || ($numeric && $value <= $settings['max']));
            $valid = $valid && match ($settings['format'] ?? null) {
                'integer' => preg_match('/^-?[0-9]+$/D', $value) === 1,
                'decimal' => $numeric,
                'direction' => ($numeric && $value >= 0 && $value <= 360) || in_array(strtoupper($value), ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], true),
                'url' => filter_var($value, FILTER_VALIDATE_URL) !== false && in_array(parse_url($value, PHP_URL_SCHEME), ['https', 'http'], true),
                default => true,
            };

            return $valid ? [] : [['related_node_id' => 0, 'tag' => $settings['key'], 'value' => $value, 'expected' => $settings]];
        }
        if ($node['longitude'] === null || $node['latitude'] === null) {
            throw new \RuntimeException('Node coordinates are missing.');
        }
        if ($rule->type === 'road_distance') {
            $road = $this->roads->nearest($node['latitude'], $node['longitude'], $settings['distance_meters'], $settings['road_types']);

            return $road['distance_meters'] === null || $road['distance_meters'] > $settings['distance_meters']
                ? [['related_node_id' => 0, ...$road, 'distance_meters' => $road['distance_meters'] === null ? null : round($road['distance_meters'], 2), 'maximum_meters' => $settings['distance_meters']]] : [];
        }
        $query = $this->reader->query()->fromSub($this->reader->nodes(), 'neighbors')->where('id', '!=', $node['id'])->where('visible', true)
            ->whereRaw('ST_DWithin(ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography,ST_SetSRID(ST_MakePoint(?,?),4326)::geography,?)', [$node['longitude'], $node['latitude'], $settings['distance_meters']]);
        foreach ($settings['match_tags'] as $key) {
            if (! array_key_exists($key, $tags)) {
                return [];
            }
            $query->whereRaw('tags->>? = ?', [$key, $tags[$key]]);
        }
        $candidates = $query->limit(501)->get();
        if ($candidates->count() > 500) {
            throw new \RuntimeException('Too many nearby nodes to evaluate completely.');
        }

        return $candidates->map($this->reader->normalize(...))->filter(fn ($neighbor) => $this->eligible($rule, $neighbor))->map(function ($neighbor) use ($node, $settings): array {
            $distance = DB::selectOne('SELECT ST_Distance(ST_SetSRID(ST_MakePoint(?,?),4326)::geography,ST_SetSRID(ST_MakePoint(?,?),4326)::geography) as meters', [$node['longitude'], $node['latitude'], $neighbor['longitude'], $neighbor['latitude']])->meters;

            $versions = [$node['id'] => $node['osm_version'], $neighbor['id'] => $neighbor['osm_version']];
            $locations = [$node['id'] => [(float) $node['longitude'], (float) $node['latitude']], $neighbor['id'] => [(float) $neighbor['longitude'], (float) $neighbor['latitude']]];
            ksort($versions);
            ksort($locations);

            return ['related_node_id' => $neighbor['id'], 'node_versions' => $versions, 'locations' => $locations, 'distance_meters' => round($distance, 2), 'radius_meters' => $settings['distance_meters'], 'matching_tags' => array_intersect_key($node['tags'], array_flip($settings['match_tags']))];
        })->values()->all();
    }

    private function eligible(ModerationRule $rule, array $node): bool
    {
        if (! $node['visible'] || ($node['tags']['surveillance:type'] ?? null) !== 'ALPR') {
            return false;
        }
        foreach ($rule->conditions as $condition) {
            if (! $this->condition($node['tags'], $condition)) {
                return false;
            }
        }
        foreach ($rule->exceptions as $condition) {
            if ($this->condition($node['tags'], $condition)) {
                return false;
            }
        }
        if ($rule->area_ids) {
            if ($node['longitude'] === null || $node['latitude'] === null) {
                throw new \RuntimeException('Node coordinates are missing.');
            }

            return WatchedArea::whereIn('id', $rule->area_ids)->get()->contains(function ($area) use ($node): bool {
                return (bool) DB::selectOne('SELECT ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(?),4326), ST_SetSRID(ST_MakePoint(?,?),4326)) as covered', [json_encode($area->geometry, JSON_THROW_ON_ERROR), $node['longitude'], $node['latitude']])->covered;
            });
        }

        return true;
    }

    private function condition(array $tags, array $condition): bool
    {
        $exists = array_key_exists($condition['key'], $tags);

        return match ($condition['operator']) {
            'exists' => $exists, 'missing' => ! $exists,
            'equals' => $exists && $tags[$condition['key']] === $condition['value'],
            'not_equals' => ! $exists || $tags[$condition['key']] !== $condition['value'],
        };
    }

    /** @return list<int> */
    private function save(ModerationRule $rule, array $node, array $result): array
    {
        return DB::transaction(function () use ($rule, $node, $result): array {
            $current = ModerationRule::whereKey($rule->id)->lockForUpdate()->first();
            if (! $current?->enabled || $current->version !== $rule->version) {
                return [];
            }
            $before = ModerationFlag::where('rule_id', $rule->id)->where(fn ($query) => $query->where('node_id', $node['id'])->orWhere('related_node_id', $node['id']))
                ->where('status', 'open')->get(['id', 'node_id', 'related_node_id', 'evidence_hash']);
            ModerationEvaluation::updateOrCreate(['rule_id' => $rule->id, 'node_id' => $node['id']], [
                'rule_version' => $rule->version, 'node_version' => $node['osm_version'], 'state' => $result['state'], 'error' => $result['error'], 'evaluated_at' => now(),
            ]);
            $existing = ModerationFlag::where('rule_id', $rule->id)->where(fn ($q) => $q->where('node_id', $node['id'])->orWhere('related_node_id', $node['id']));
            if ($result['state'] === 'not_evaluated') {
                $existing->update(['stale' => true]);

                return [];
            }
            $ids = [];
            foreach ($result['matches'] as $match) {
                $neighbor = $match['related_node_id'];
                $nodeId = $neighbor ? min($node['id'], $neighbor) : $node['id'];
                $related = $neighbor ? max($node['id'], $neighbor) : 0;
                $match['related_node_id'] = $related;
                $relevantEvidence = $match;
                unset($relevantEvidence['node_versions']);
                $hash = hash('sha256', json_encode([$rule->version, $relevantEvidence], JSON_THROW_ON_ERROR));
                $flag = ModerationFlag::firstOrNew(['rule_id' => $rule->id, 'node_id' => $nodeId, 'related_node_id' => $related]);
                $dismissed = $flag->status === 'dismissed' && $flag->evidence_hash === $hash;
                $flag->fill(['rule_version' => $rule->version, 'node_version' => $match['node_versions'][$nodeId] ?? $node['osm_version'], 'status' => $dismissed ? 'dismissed' : 'open',
                    'evidence' => $match, 'evidence_hash' => $hash, 'evaluated_at' => now(), 'stale' => false,
                    'dismissed_by' => $dismissed ? $flag->dismissed_by : null, 'dismissed_at' => $dismissed ? $flag->dismissed_at : null]);
                $flag->save();
                $ids[] = $flag->id;
            }
            $existing->whereNotIn('id', $ids)->update(['status' => 'resolved', 'stale' => false, 'evaluated_at' => now()]);
            $after = ModerationFlag::where('rule_id', $rule->id)->where(fn ($query) => $query->where('node_id', $node['id'])->orWhere('related_node_id', $node['id']))
                ->where('status', 'open')->get(['id', 'node_id', 'related_node_id', 'evidence_hash']);
            $signature = fn ($flags): array => $flags->map(fn (ModerationFlag $flag): array => [$flag->id, $flag->evidence_hash])->sort()->values()->all();
            if ($signature($before) === $signature($after)) {
                return [];
            }

            return $before->concat($after)->flatMap(fn (ModerationFlag $flag): array => [$flag->node_id, $flag->related_node_id])->filter()->unique()->values()->all();
        });
    }
}
