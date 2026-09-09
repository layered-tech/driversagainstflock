<?php

namespace App\Services\OpenStreetMap;

use App\Models\ModerationContribution;
use App\Models\ModerationEditorArea;
use App\Models\ModerationEditorSummary;
use App\Models\OsmEditorProfile;
use App\Models\OsmNodeVersion;
use App\Models\WatchedArea;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ModerationEditorSummaries
{
    public function __construct(
        private ModerationReader $reader,
        private ModerationSummaries $summaries,
    ) {}

    /** @param iterable<int> $nodeIds */
    public function markEditorsForNodesDirty(iterable $nodeIds): void
    {
        $ids = collect($nodeIds)->filter()->map(fn (mixed $id): int => (int) $id)->unique();
        if ($ids->isEmpty()) {
            return;
        }

        $this->markEditorsDirty(OsmNodeVersion::whereIntegerInRaw('node_id', $ids)->whereNotNull('osm_uid')->distinct()->pluck('osm_uid'));
    }

    /** @param iterable<int> $uids */
    public function markEditorsDirty(iterable $uids): void
    {
        $now = now();
        collect($uids)->filter()->map(fn (mixed $uid): int => (int) $uid)->unique()->chunk(500)->each(function (Collection $chunk) use ($now): void {
            ModerationEditorSummary::upsert(
                $chunk->map(fn (int $uid): array => ['osm_uid' => $uid, 'dirty_at' => $now, 'created_at' => $now, 'updated_at' => $now])->all(),
                ['osm_uid'],
                ['dirty_at', 'updated_at'],
            );
        });
    }

    public function markAllEditorsDirty(): void
    {
        ModerationEditorSummary::query()->update(['dirty_at' => now()]);
    }

    public function markAreasDirty(): void
    {
        WatchedArea::query()->update(['summary_dirty_at' => now()]);
    }

    public function refreshEditor(int $uid, ?int $rebuildRun = null): void
    {
        $summary = ModerationEditorSummary::firstOrCreate(['osm_uid' => $uid], ['dirty_at' => now()]);
        $dirtyAt = $summary->dirty_at;
        $row = $this->reader->editors()->where('osm_uid', $uid)->first();
        if (! $row) {
            $summary->delete();

            return;
        }

        $row = $this->reader->normalize($row);
        $sets = $this->reader->listing('changesets', ['uid' => $uid])->get(['id', 'osm_uid', 'total']);
        $contributions = ModerationContribution::where('osm_uid', $uid)->get();
        $states = $this->summaries->states($sets, $contributions);
        $counts = array_count_values($states);
        $classified = count($states) - ($counts['unknown'] ?? 0);
        $reverted = $counts['reverted'] ?? 0;
        $profile = OsmEditorProfile::where('osm_uid', $uid)->first();
        $flagsCount = $this->summaries->flagsForEditor($uid);

        DB::transaction(function () use ($summary, $dirtyAt, $row, $profile, $classified, $reverted, $flagsCount, $rebuildRun): void {
            $current = ModerationEditorSummary::whereKey($summary)->lockForUpdate()->firstOrFail();
            $unchanged = ($current->dirty_at === null && $dirtyAt === null)
                || ($current->dirty_at !== null && $dirtyAt !== null && $current->dirty_at->equalTo($dirtyAt));
            $current->fill([
                'name' => $profile?->display_name ?: $row['name'],
                'first_active' => $row['first_active'],
                'last_active' => $row['last_active'],
                'tracked_changesets' => (int) $row['tracked_changesets'],
                'added' => (int) $row['added'],
                'modified' => (int) $row['modified'],
                'deleted' => (int) $row['deleted'],
                'flagged_changesets' => (int) $row['flagged_changesets'],
                'reviewed_changesets' => (int) $row['reviewed_changesets'],
                'flags_count' => $flagsCount,
                'survival_percent' => $classified ? round(100 * ($classified - $reverted) / $classified, 1) : null,
                'survival_reverted' => $classified ? $reverted : null,
                'calculated_at' => now(),
                'rebuild_run' => $rebuildRun ?? $current->rebuild_run,
                'dirty_at' => $unchanged ? null : $current->dirty_at,
            ])->save();
        });
    }

    public function refreshArea(WatchedArea $area): void
    {
        $area->refresh();
        $dirtyAt = $area->summary_dirty_at;
        $token = Str::random(24);
        $query = $this->reader->listing('changesets', ['area' => $area->id])
            ->whereNotNull('osm_uid')->select('osm_uid')->distinct()->orderBy('osm_uid');

        $query->chunkById(500, function (Collection $rows) use ($area, $token): void {
            $uids = $rows->pluck('osm_uid')->map(fn (mixed $uid): int => (int) $uid)->unique();
            $now = now();
            ModerationEditorSummary::insertOrIgnore($uids->map(fn (int $uid): array => [
                'osm_uid' => $uid,
                'dirty_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all());
            $summaries = ModerationEditorSummary::whereIntegerInRaw('osm_uid', $uids)->get(['id']);
            ModerationEditorArea::upsert(
                $summaries->map(fn (ModerationEditorSummary $summary): array => [
                    'moderation_editor_summary_id' => $summary->id,
                    'watched_area_id' => $area->id,
                    'refresh_token' => $token,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all(),
                ['moderation_editor_summary_id', 'watched_area_id'],
                ['refresh_token', 'updated_at'],
            );
        }, column: 'osm_uid', alias: 'osm_uid');

        DB::transaction(function () use ($area, $dirtyAt, $token): void {
            $current = WatchedArea::whereKey($area)->lockForUpdate()->first();
            if (! $current) {
                return;
            }
            $affectedSummaryIds = ModerationEditorArea::where('watched_area_id', $area->id)
                ->pluck('moderation_editor_summary_id');
            ModerationEditorArea::where('watched_area_id', $area->id)->where('refresh_token', '!=', $token)->delete();
            $this->recountAreas($affectedSummaryIds);
            $unchanged = ($current->summary_dirty_at === null && $dirtyAt === null)
                || ($current->summary_dirty_at !== null && $dirtyAt !== null && CarbonImmutable::parse($current->summary_dirty_at)->equalTo($dirtyAt));
            WatchedArea::whereKey($current)->toBase()->update([
                'summary_refreshed_at' => now(),
                'summary_dirty_at' => $unchanged ? null : $current->summary_dirty_at,
            ]);
        });
    }

    /** @param iterable<int> $summaryIds */
    public function recountAreas(iterable $summaryIds): void
    {
        collect($summaryIds)->filter()->map(fn (mixed $id): int => (int) $id)->unique()->chunk(500)->each(function (Collection $ids): void {
            ModerationEditorSummary::whereIntegerInRaw('id', $ids)->update([
                'areas_count' => ModerationEditorArea::query()->selectRaw('COUNT(*)')
                    ->whereColumn('moderation_editor_summary_id', 'moderation_editor_summaries.id'),
                'updated_at' => now(),
            ]);
        });
    }
}
