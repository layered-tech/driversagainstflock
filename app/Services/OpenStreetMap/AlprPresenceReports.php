<?php

namespace App\Services\OpenStreetMap;

use App\Models\AlprPresenceReport;
use App\Models\ModerationFlag;
use App\Models\OsmNodeVersion;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AlprPresenceReports
{
    public function __construct(private ModerationReader $reader, private ModerationSummaryCache $cache) {}

    /** @param array<string, mixed> $payload */
    public function accept(array $payload): AlprPresenceReport
    {
        $payload['osm_node_id'] = (int) $payload['osm_node_id'];
        foreach (['passed_at', 'occurred_at', 'submitted_at'] as $key) {
            $payload[$key] = CarbonImmutable::parse($payload[$key])->utc()->toISOString();
        }
        $payload['observed'] = $payload['observed'] ?? null;
        if (is_array($payload['observed'])) {
            ksort($payload['observed']);
        }
        ksort($payload);
        $hash = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($payload, $hash): AlprPresenceReport {
            DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ['presence-event:'.$payload['event_key']]);
            $existing = AlprPresenceReport::where('event_key', $payload['event_key'])->first();
            if ($existing) {
                abort_unless(hash_equals($existing->payload_hash, $hash), 409, 'This report key already belongs to different evidence.');

                return $existing;
            }
            $this->lockNode($payload['osm_node_id']);
            $node = $this->currentNode($payload['osm_node_id']);
            if (! $node || ! $node->visible || ($node->tags['surveillance:type'] ?? null) !== 'ALPR') {
                throw ValidationException::withMessages(['osm_node_id' => 'A current ALPR node could not be verified.']);
            }
            $report = AlprPresenceReport::create([...$payload, 'payload_hash' => $hash,
                'received_at' => now(), 'server_node_version' => $node->osm_version,
                'server_latitude' => $node->latitude, 'server_longitude' => $node->longitude]);
            $this->project($payload['osm_node_id'], $node);
            DB::afterCommit(fn () => $this->cache->invalidate());

            return $report;
        }, 3);
    }

    private function lockNode(int $nodeId): void
    {
        DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ['presence-node:'.$nodeId]);
    }

    private function currentNode(int $nodeId): ?OsmNodeVersion
    {
        return OsmNodeVersion::where('node_id', $nodeId)->latest('osm_version')->first();
    }

    private function project(int $nodeId, ?OsmNodeVersion $node): void
    {
        $reports = AlprPresenceReport::where('osm_node_id', $nodeId);
        $aggregate = (clone $reports)->selectRaw('count(*) as report_count, min(occurred_at) as first_report_at, max(occurred_at) as latest_report_at, max(received_at) as latest_received_at, max(id) as latest_report_id')->first();
        if (! $aggregate->report_count) {
            return;
        }
        $flag = ModerationFlag::where('source', 'alpr_presence')->where('node_id', $nodeId)->lockForUpdate()->first();
        if (! $flag && (! $node || ! $node->visible || ! $this->reader->nodeIsWithinArea($node->toArray()))) {
            return;
        }
        $flag ??= new ModerationFlag(['source' => 'alpr_presence', 'node_id' => $nodeId, 'related_node_id' => 0,
            'rule_id' => null, 'rule_version' => null, 'node_version' => $node?->osm_version ?? 1, 'status' => 'open']);
        $evidence = [
            'label' => 'Unverified user report', 'report_count' => (int) $aggregate->report_count,
            'first_report_at' => $aggregate->first_report_at, 'latest_report_at' => $aggregate->latest_report_at,
            'latest_received_at' => $aggregate->latest_received_at, 'latest_report_id' => (int) $aggregate->latest_report_id,
        ];
        if ($flag->dismissed_at && CarbonImmutable::parse($aggregate->latest_report_at)->gt($flag->dismissed_at)) {
            $flag->status = 'open';
        }
        $flag->fill(['evidence' => $evidence, 'evidence_hash' => hash('sha256', json_encode($evidence, JSON_THROW_ON_ERROR)),
            'evaluated_at' => now(), 'stale' => false])->save();
        (clone $reports)->whereNull('moderation_flag_id')->update(['moderation_flag_id' => $flag->id]);
    }

    public function reconcile(int $nodeId): void
    {
        DB::transaction(function () use ($nodeId): void {
            $this->lockNode($nodeId);
            $this->project($nodeId, $this->currentNode($nodeId));
            DB::afterCommit(fn () => $this->cache->invalidate());
        }, 3);
    }

    /** @return list<int> */
    public function coveredFlagNodeIds(): array
    {
        $ids = [];
        ModerationFlag::where('source', 'alpr_presence')->select(['id', 'node_id'])->chunkById(200, function ($flags) use (&$ids): void {
            $covered = $this->reader->nodesWithinAreas()->where('source.visible', true)
                ->whereIntegerInRaw('source.id', $flags->pluck('node_id'))->pluck('source.id')->all();
            array_push($ids, ...$covered);
        });

        return $ids;
    }
}
