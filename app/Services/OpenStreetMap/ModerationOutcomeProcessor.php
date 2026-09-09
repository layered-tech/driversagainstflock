<?php

namespace App\Services\OpenStreetMap;

use App\Models\ModerationContribution;
use App\Models\ModerationOutcome;
use App\Models\OsmNodeVersion;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ModerationOutcomeProcessor
{
    public function process(int $nodeId): void
    {
        Cache::lock('moderation:outcome-node:'.$nodeId, 120)->block(10, fn () => $this->processLocked($nodeId));
    }

    private function processLocked(int $nodeId): void
    {
        $versions = OsmNodeVersion::where('node_id', $nodeId)->orderBy('osm_version')->get();
        if ($versions->isEmpty()) {
            return;
        }
        $expected = 1;
        $complete = true;
        foreach ($versions as $version) {
            if ($version->osm_version !== $expected || $version->osm_uid === null) {
                $complete = false;
            }
            $expected = $version->osm_version + 1;
        }
        $finalVersions = $versions->groupBy('changeset_id')->map(fn ($group) => $group->last())->sortBy('osm_version');
        DB::transaction(function () use ($nodeId, $finalVersions, $complete): void {
            $previous = null;
            $owners = [];
            $contributions = [];
            $outcomeIds = [];
            foreach ($finalVersions as $version) {
                $tags = $version->visible ? $version->tags : [];
                $before = $previous?->visible ? $previous->tags : [];
                $changed = array_filter(array_unique([...array_keys($before), ...array_keys($tags)]), fn (string $key): bool => ($before[$key] ?? null) !== ($tags[$key] ?? null));
                $set = array_intersect_key($tags, array_flip($changed));
                $locations = [];
                foreach ([$previous, $version] as $location) {
                    if ($location?->longitude !== null && $location?->latitude !== null) {
                        $locations[] = [(float) $location->longitude, (float) $location->latitude];
                    }
                }
                $contribution = ModerationContribution::updateOrCreate(['node_id' => $nodeId, 'changeset_id' => $version->changeset_id], [
                    'osm_uid' => $version->osm_uid, 'osm_user' => $version->osm_user,
                    'node_version' => $version->osm_version, 'edited_at' => $version->osm_updated_at,
                    'status' => $complete ? 'intact' : 'unknown', 'history_complete' => $complete,
                    'visible' => $version->visible, 'tags_set' => $set, 'locations' => array_values(array_unique($locations, SORT_REGULAR)),
                ]);
                $meaningful = $changed !== [] || $version->visible !== $previous?->visible
                    || $version->latitude !== $previous?->latitude || $version->longitude !== $previous?->longitude;
                foreach ($contributions as $prior) {
                    if ($complete && $meaningful && $version->osm_uid !== $prior->osm_uid && $prior->status === 'intact') {
                        $prior->status = 'edited';
                    }
                }
                $events = [];
                if (! $version->visible && $previous?->visible) {
                    foreach ($contributions as $prior) {
                        if ($prior->visible && ! isset($events[$prior->id])) {
                            $events[$prior->id] = ['kind' => 'deleted', 'tags' => array_map(fn ($value): array => ['before' => $value, 'after' => null], $before)];
                        }
                    }
                    $owners = [];
                } else {
                    foreach ($changed as $key) {
                        if (isset($owners[$key])) {
                            $id = $owners[$key];
                            $events[$id] ??= ['kind' => 'tags_changed', 'tags' => []];
                            $events[$id]['tags'][$key] = ['before' => $before[$key] ?? null, 'after' => $tags[$key] ?? null];
                        }
                        unset($owners[$key]);
                        if (array_key_exists($key, $tags)) {
                            $owners[$key] = $contribution->id;
                        }
                    }
                }
                foreach ($events as $id => $evidence) {
                    $prior = $contributions[$id];
                    if ($prior->osm_uid === null || $version->osm_uid === null) {
                        continue;
                    }
                    $self = $prior->osm_uid === $version->osm_uid;
                    $event = ModerationOutcome::updateOrCreate([
                        'contribution_id' => $id, 'later_version' => $version->osm_version, 'kind' => $evidence['kind'],
                    ], [
                        'later_changeset_id' => $version->changeset_id, 'later_osm_uid' => $version->osm_uid,
                        'later_osm_user' => $version->osm_user, 'occurred_at' => $version->osm_updated_at,
                        'elapsed_seconds' => max(0, (int) $prior->edited_at->diffInSeconds(CarbonImmutable::parse($version->osm_updated_at))),
                        'self_edit' => $self, 'evidence' => $evidence,
                    ]);
                    $outcomeIds[] = $event->id;
                    if (! $self && $complete) {
                        $prior->status = 'reverted';
                    }
                }
                $contributions[$contribution->id] = $contribution;
                $previous = $version;
            }
            foreach ($contributions as $contribution) {
                $contribution->save();
            }
            ModerationOutcome::whereIn('contribution_id', array_keys($contributions))->whereNotIn('id', $outcomeIds)->delete();
            ModerationContribution::where('node_id', $nodeId)->whereNotIn('id', array_keys($contributions))->delete();
        });

        $summaries = app(ModerationEditorSummaries::class);
        $summaries->markEditorsForNodesDirty([$nodeId]);
        $summaries->markAreasDirty();
    }
}
