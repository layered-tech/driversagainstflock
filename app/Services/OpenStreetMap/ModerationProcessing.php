<?php

namespace App\Services\OpenStreetMap;

use App\Jobs\DrainModerationSummaries;
use App\Jobs\ProcessModeration;
use App\Models\AlprPresenceReport;
use App\Models\ModerationContribution;
use App\Models\ModerationEditorSummary;
use App\Models\ModerationProcess;
use App\Models\ModerationRule;
use App\Models\OsmChangeset;
use App\Models\OsmNodeVersion;
use App\Models\WatchedArea;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

class ModerationProcessing
{
    public function __construct(private ModerationReader $reader) {}

    /**
     * @param  Closure(ProcessModeration): void|null  $execute
     * @return array{jobs: int, nodes?: int, processes: int, skipped: list<string>}
     */
    public function dispatch(
        string $kind,
        ?int $node = null,
        ?int $user = null,
        bool $rebuild = false,
        ?int $limit = null,
        ?int $rule = null,
        ?Closure $execute = null,
    ): array {
        $this->validateTargets($kind, $node, $user, $rule);
        if ($kind === 'rules') {
            return $this->dispatchRules($node, $user, $rule, $limit, $execute);
        }

        $scoped = $node !== null || $user !== null || $limit !== null;
        $name = $kind.$this->scopeSuffix($node, $user, $limit);
        if ($rebuild && ($kind === 'summaries' || $scoped)) {
            $name .= ':rebuild';
        }
        $process = $kind === 'summaries'
            ? Cache::lock('moderation:summary-dispatch', 10)->block(5, function () use ($name): ?ModerationProcess {
                $active = ModerationProcess::where(fn (Builder $query): Builder => $query->where('name', 'summaries')->orWhere('name', 'like', 'summaries:%'))
                    ->where(fn (Builder $query): Builder => $query->whereIn('state', ['dispatching', 'queued', 'running'])->orWhere('pending_jobs', '>', 0))->exists();

                return $active ? null : $this->startRun($name);
            })
            : $this->startRun($name);
        if (! $process) {
            return ['jobs' => 0, 'processes' => 0, 'skipped' => [$name]];
        }

        try {
            $jobs = match ($kind) {
                'outcomes' => $this->dispatchOutcomes($process, $node, $user, $rebuild, $limit, $execute),
                'profiles' => $this->dispatchProfileJobs($process),
                'summaries' => $this->dispatchSummaryJobs($process, $rebuild, $user, $limit, $execute),
                'warm' => $this->dispatchWarmJobs($process),
                default => throw new RuntimeException('Unsupported moderation process: '.$kind),
            };
            $this->finishDispatch($process);

            return ['jobs' => $jobs, 'processes' => 1, 'skipped' => []];
        } catch (Throwable $exception) {
            $this->failDispatch($process, $exception);
            throw $exception;
        }
    }

    private function validateTargets(string $kind, ?int $node, ?int $user, ?int $rule): void
    {
        if ($node !== null && ! OsmNodeVersion::where('node_id', $node)->exists()) {
            throw new InvalidArgumentException('No tracked node found for --node='.$node.'.');
        }
        if ($user !== null) {
            $exists = $kind === 'summaries'
                ? OsmChangeset::where('osm_uid', $user)->where('alpr_nodes_touched', '>', 0)->exists()
                : OsmNodeVersion::where('osm_uid', $user)->exists();
            if (! $exists) {
                throw new InvalidArgumentException('No tracked data found for --user='.$user.'.');
            }
        }
        if ($rule !== null && ! ModerationRule::whereKey($rule)->where('enabled', true)->exists()) {
            throw new InvalidArgumentException('Rule '.$rule.' does not exist or is disabled.');
        }
    }

    /**
     * @param  Closure(ProcessModeration): void|null  $execute
     * @return array{jobs: int, nodes?: int, processes: int, skipped: list<string>}
     */
    private function dispatchRules(?int $node, ?int $user, ?int $ruleId, ?int $limit, ?Closure $execute): array
    {
        $rules = ModerationRule::where('enabled', true)->when($ruleId !== null, fn (Builder $query): Builder => $query->whereKey($ruleId))->orderBy('id')->get(['id', 'version']);
        $scope = $this->scopeSuffix($node, $user, $limit);
        if ($rules->isEmpty()) {
            $process = $this->startRun('rules'.$scope);
            if (! $process) {
                return ['jobs' => 0, 'nodes' => 0, 'processes' => 0, 'skipped' => ['rules'.$scope]];
            }
            $this->finishDispatch($process);

            return ['jobs' => 0, 'nodes' => 0, 'processes' => 1, 'skipped' => []];
        }

        $query = $this->nodeQuery($user)
            ->whereIn('node_id', $this->reader->nodesWithinAreas()->select('source.id'))
            ->when($node !== null, fn (Builder $query): Builder => $query->where('node_id', $node));
        if ($limit !== null) {
            $selected = (clone $query)->limit($limit)->get()->pluck('node_id');
            $query->whereIntegerInRaw('node_id', $selected);
        }
        $nodes = 0;
        $jobs = 0;
        $processes = 0;
        $skipped = [];
        foreach ($rules as $rule) {
            $name = ($scope !== '' ? 'scoped-rule:' : 'rule:').$rule->id.':'.$rule->version.$scope;
            $process = $this->startRun($name);
            if (! $process) {
                $skipped[] = $name;
                if ($execute !== null) {
                    return ['jobs' => $jobs, 'nodes' => $nodes, 'processes' => $processes, 'skipped' => $skipped];
                }

                continue;
            }
            try {
                $count = $this->dispatchNodeJobs($process, 'rule', clone $query, $rule->id, $rule->version, execute: $execute);
                $nodes = max($nodes, $count);
                $jobs += $count;
                $this->finishDispatch($process);
                $processes++;
            } catch (Throwable $exception) {
                $this->failDispatch($process, $exception);
                throw $exception;
            }
        }

        return ['jobs' => $jobs, 'nodes' => $nodes, 'processes' => $processes, 'skipped' => $skipped];
    }

    private function scopeSuffix(?int $node, ?int $user, ?int $limit): string
    {
        return ($node !== null ? ':node:'.$node : '')
            .($user !== null ? ':user:'.$user : '')
            .($limit !== null ? ':limit:'.$limit : '');
    }

    private function startRun(string $name): ?ModerationProcess
    {
        ModerationProcess::firstOrCreate(['name' => $name]);

        return DB::transaction(function () use ($name): ?ModerationProcess {
            $process = ModerationProcess::where('name', $name)->lockForUpdate()->firstOrFail();
            if ($process->pending_jobs > 0 || in_array($process->state, ['dispatching', 'queued', 'running'], true)) {
                return null;
            }
            $process->update([
                'run_number' => $process->run_number + 1,
                'state' => 'dispatching',
                'total_jobs' => 0,
                'pending_jobs' => 0,
                'failed_jobs' => 0,
                'started_at' => now(),
                'last_error' => null,
            ]);

            return $process->fresh();
        });
    }

    private function finishDispatch(ModerationProcess $process): void
    {
        $completed = DB::transaction(function () use ($process): bool {
            $current = ModerationProcess::whereKey($process->id)->lockForUpdate()->firstOrFail();
            if ($current->run_number !== $process->run_number) {
                return false;
            }
            if ($current->pending_jobs === 0) {
                $current->update(['state' => $current->failed_jobs > 0 ? 'failed' : 'complete', 'last_success_at' => $current->failed_jobs > 0 ? $current->last_success_at : now()]);

                return true;
            }
            $current->update(['state' => 'queued']);

            return false;
        });
        if ($completed) {
            $this->finalizeCompletedProcess($process->fresh());
            app(ModerationSummaryCache::class)->invalidate();
        }
    }

    private function finalizeCompletedProcess(ModerationProcess $process): void
    {
        if ($process->state !== 'complete') {
            return;
        }
        if ($process->name === 'summaries:rebuild') {
            ModerationEditorSummary::where(fn (Builder $query): Builder => $query->whereNull('rebuild_run')->orWhere('rebuild_run', '!=', $process->run_number))->delete();
        }
        if (str_starts_with($process->name, 'rule:') && $process->run_number === 1 && app(ModerationSummaries::class)->rulesReady()) {
            app(ModerationEditorSummaries::class)->markAllEditorsDirty();
        }
        if ($this->shouldRequestSummaryDrain($process)) {
            $this->requestSummaryDrain();
        }
    }

    public function summariesNeedRefresh(): bool
    {
        return ModerationEditorSummary::whereNotNull('dirty_at')->exists()
            || WatchedArea::whereNotNull('summary_dirty_at')->exists();
    }

    public function hasRunningSummaryInvalidators(): bool
    {
        return ModerationProcess::query()
            ->where(function (Builder $query): void {
                $query->where('name', 'outcomes')
                    ->orWhere('name', 'profiles')
                    ->orWhere('name', 'like', 'rule:%');
            })
            ->where(function (Builder $query): void {
                $query->whereIn('state', ['dispatching', 'queued', 'running'])
                    ->orWhere('pending_jobs', '>', 0);
            })
            ->exists();
    }

    private function shouldRequestSummaryDrain(ModerationProcess $process): bool
    {
        return in_array($process->name, ['outcomes', 'profiles', 'summaries', 'summaries:rebuild'], true)
            || str_starts_with($process->name, 'rule:');
    }

    private function requestSummaryDrain(): void
    {
        if (! $this->summariesNeedRefresh()) {
            return;
        }

        DrainModerationSummaries::dispatch();
    }

    private function nodeQuery(?int $user = null): Builder
    {
        return OsmNodeVersion::query()
            ->when($user !== null, fn (Builder $query): Builder => $query->where('osm_uid', $user))
            ->selectRaw('node_id, MAX(osm_version) AS source_version')
            ->groupBy('node_id')
            ->orderBy('node_id');
    }

    private function dispatchNodeJobs(
        ModerationProcess $process,
        string $kind,
        Builder $query,
        ?int $ruleId = null,
        ?int $ruleVersion = null,
        bool $onlyOutstanding = false,
        ?int $limit = null,
        ?Closure $execute = null,
    ): int {
        $jobs = 0;
        $query->chunkById($this->chunkSize(), function (Collection $rows) use ($process, $kind, $ruleId, $ruleVersion, $onlyOutstanding, $limit, $execute, &$jobs): bool {
            if ($onlyOutstanding) {
                $rows = $this->outstandingOutcomeRows($rows);
            }
            if ($limit !== null) {
                $rows = $rows->take($limit - $jobs);
            }
            $queued = $rows->map(fn (OsmNodeVersion $version): ProcessModeration => new ProcessModeration(
                $kind,
                (int) $version->node_id,
                $ruleId,
                $ruleVersion,
                $process->id,
                $process->run_number,
            ))->all();
            $jobs += $this->push($process, $queued, $execute);

            return $limit === null || $jobs < $limit;
        }, column: 'node_id', alias: 'node_id');

        return $jobs;
    }

    private function chunkSize(): int
    {
        return max(1, (int) config('moderation.processing.dispatch_chunk_size', 500));
    }

    private function outstandingOutcomeRows(Collection $rows): Collection
    {
        $contributions = ModerationContribution::whereIn('node_id', $rows->pluck('node_id'))
            ->get(['node_id', 'node_version', 'history_complete'])
            ->groupBy('node_id');

        return $rows->filter(function (OsmNodeVersion $version) use ($contributions): bool {
            $processed = $contributions->get($version->node_id);

            return ! $processed
                || $processed->max('node_version') < (int) $version->source_version
                || $processed->contains('history_complete', false);
        })->values();
    }

    /** @param list<ProcessModeration> $jobs */
    private function push(ModerationProcess $process, array $jobs, ?Closure $execute = null): int
    {
        $count = count($jobs);
        if ($count === 0) {
            return 0;
        }
        if ($execute !== null) {
            foreach ($jobs as $job) {
                ModerationProcess::whereKey($process->id)->where('run_number', $process->run_number)->incrementEach([
                    'total_jobs' => 1,
                    'pending_jobs' => 1,
                ]);
                try {
                    $execute($job);
                } catch (Throwable $exception) {
                    $job->failed($exception);
                    app(ModerationSummaryCache::class)->invalidate();
                    throw $exception;
                }
            }

            return $count;
        }
        ModerationProcess::whereKey($process->id)->where('run_number', $process->run_number)->incrementEach([
            'total_jobs' => $count,
            'pending_jobs' => $count,
        ]);
        try {
            Queue::connection((string) config('moderation.processing.connection', 'redis'))
                ->bulk($jobs, '', (string) config('moderation.processing.queue', 'moderation'));
        } catch (Throwable $exception) {
            ModerationProcess::whereKey($process->id)->where('run_number', $process->run_number)->incrementEach([
                'total_jobs' => -$count,
                'pending_jobs' => -$count,
            ]);
            throw $exception;
        }

        return $count;
    }

    private function failDispatch(ModerationProcess $process, Throwable $exception): void
    {
        ModerationProcess::whereKey($process->id)->where('run_number', $process->run_number)->update([
            'state' => 'failed',
            'last_error' => mb_substr('Dispatch failed: '.$exception->getMessage(), 0, 2000),
        ]);
    }

    private function dispatchOutcomes(ModerationProcess $process, ?int $node, ?int $user, bool $rebuild, ?int $limit, ?Closure $execute): int
    {
        if ($node !== null) {
            return $this->push($process, [new ProcessModeration('outcome', $node, processId: $process->id, runNumber: $process->run_number)], $execute);
        }

        return $this->dispatchNodeJobs($process, 'outcome', $this->nodeQuery($user), onlyOutstanding: $user === null && ! $rebuild, limit: $limit, execute: $execute);
    }

    private function dispatchProfileJobs(ModerationProcess $process): int
    {
        $jobs = 0;
        OsmChangeset::query()->whereNotNull('osm_uid')->where('alpr_nodes_touched', '>', 0)
            ->select('osm_uid')->distinct()->orderBy('osm_uid')
            ->chunkById($this->chunkSize(), function (Collection $rows) use ($process, &$jobs): void {
                $queued = $rows->map(fn (OsmChangeset $changeset): ProcessModeration => new ProcessModeration(
                    'profile',
                    (int) $changeset->osm_uid,
                    processId: $process->id,
                    runNumber: $process->run_number,
                ))->all();
                $jobs += $this->push($process, $queued);
            }, column: 'osm_uid', alias: 'osm_uid');

        return $jobs;
    }

    private function dispatchSummaryJobs(ModerationProcess $process, bool $rebuild, ?int $user, ?int $limit, ?Closure $execute): int
    {
        $jobs = 0;
        $scoped = $user !== null || $limit !== null;
        $generation = $rebuild && ! $scoped ? $process->run_number : null;
        if (! $rebuild && ! $scoped) {
            ModerationEditorSummary::query()->whereNotNull('dirty_at')->select(['id', 'osm_uid'])->orderBy('id')
                ->chunkById($this->chunkSize(), function (Collection $summaries) use ($process, $execute, &$jobs): void {
                    $jobs += $this->push($process, $this->summaryEditorJobs($process, $summaries->pluck('osm_uid'), null), $execute);
                });
        }
        OsmChangeset::query()->whereNotNull('osm_uid')->where('alpr_nodes_touched', '>', 0)
            ->when($user !== null, fn (Builder $query): Builder => $query->where('osm_uid', $user))
            ->select('osm_uid')->distinct()->orderBy('osm_uid')
            ->chunkById($this->chunkSize(), function (Collection $rows) use ($process, $rebuild, $scoped, $user, $limit, $generation, $execute, &$jobs): bool {
                $uids = $rows->pluck('osm_uid')->map(fn (mixed $uid): int => (int) $uid)->unique()->values();
                $existing = ModerationEditorSummary::whereIntegerInRaw('osm_uid', $uids)->get(['osm_uid', 'dirty_at'])->keyBy('osm_uid');
                $uids = $uids->filter(fn (int $uid): bool => $rebuild || $user !== null || ! $existing->has($uid) || ($scoped && $existing[$uid]->dirty_at !== null))->values();
                if ($limit !== null) {
                    $uids = $uids->take($limit - $jobs);
                }
                $now = now();
                ModerationEditorSummary::insertOrIgnore($uids->map(fn (int $uid): array => [
                    'osm_uid' => $uid,
                    'dirty_at' => $now,
                    'rebuild_run' => $generation,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
                if ($generation !== null) {
                    ModerationEditorSummary::whereIntegerInRaw('osm_uid', $uids)->update(['rebuild_run' => $generation]);
                }
                $jobs += $this->push($process, $this->summaryEditorJobs($process, $uids, $generation), $execute);

                return $limit === null || $jobs < $limit;
            }, column: 'osm_uid', alias: 'osm_uid');

        if ($scoped) {
            return $jobs;
        }

        $areas = WatchedArea::query()->when(! $rebuild, fn (Builder $query): Builder => $query->whereNotNull('summary_dirty_at'))->get(['id']);
        $jobs += $this->push($process, $areas->map(fn (WatchedArea $area): ProcessModeration => new ProcessModeration(
            'summary-area',
            $area->id,
            processId: $process->id,
            runNumber: $process->run_number,
        ))->all());

        return $jobs;
    }

    /** @return list<ProcessModeration> */
    private function summaryEditorJobs(ModerationProcess $process, Collection $uids, ?int $generation): array
    {
        return $uids->map(fn (mixed $uid): ProcessModeration => new ProcessModeration(
            'summary-editor',
            (int) $uid,
            ruleVersion: $generation,
            processId: $process->id,
            runNumber: $process->run_number,
        ))->all();
    }

    private function dispatchWarmJobs(ModerationProcess $process): int
    {
        $jobs = 0;
        WatchedArea::query()->select('id')->chunkById($this->chunkSize(), function (Collection $areas) use ($process, &$jobs): void {
            $queued = $areas->map(fn (WatchedArea $area): ProcessModeration => new ProcessModeration(
                'warm-area',
                $area->id,
                processId: $process->id,
                runNumber: $process->run_number,
            ))->all();
            $jobs += $this->push($process, $queued);
        });
        $editors = OsmChangeset::whereNotNull('osm_uid')->where('alpr_nodes_touched', '>', 0)
            ->orderByDesc('created_at')->limit(100)->pluck('osm_uid')->unique();
        $queued = $editors->map(fn (int $uid): ProcessModeration => new ProcessModeration(
            'warm-editor',
            $uid,
            processId: $process->id,
            runNumber: $process->run_number,
        ))->all();

        return $jobs + $this->push($process, $queued);
    }

    public function process(string $kind, ?int $target = null, ?int $ruleId = null, ?int $ruleVersion = null): void
    {
        if ($kind === 'outcome' && $target !== null) {
            app(ModerationOutcomeProcessor::class)->process($target);
            if (AlprPresenceReport::where('osm_node_id', $target)->exists()) {
                app(AlprPresenceReports::class)->reconcile($target);
            }

            return;
        }
        if ($kind === 'profile' && $target !== null) {
            app(ModerationProfileRefresh::class)->refresh($target);

            return;
        }
        if ($kind === 'summary-editor' && $target !== null) {
            app(ModerationEditorSummaries::class)->refreshEditor($target, $ruleVersion);

            return;
        }
        if ($kind === 'summary-area' && $target !== null && $area = WatchedArea::find($target)) {
            app(ModerationEditorSummaries::class)->refreshArea($area);

            return;
        }
        if ($kind === 'rule' && $target !== null && $ruleId !== null && $ruleVersion !== null) {
            $rule = ModerationRule::whereKey($ruleId)->where('version', $ruleVersion)->where('enabled', true)->first();
            if (! $rule) {
                return;
            }
            $reader = app(ModerationReader::class);
            $record = $reader->nodes()->where('source.id', $target)->first();
            if (! $record) {
                return;
            }
            $result = app(ModerationRuleEvaluator::class)->evaluate($rule, $reader->normalize($record));
            if ($result['state'] === 'not_evaluated') {
                throw new RuntimeException('Rule '.$rule->id.' on node '.$target.': '.$result['error']);
            }

            return;
        }
        if ($kind === 'warm-editor' && $target !== null) {
            app(ModerationSummaries::class)->editor($target);

            return;
        }
        if ($kind === 'warm-area' && $target !== null && $area = WatchedArea::find($target)) {
            app(ModerationSummaries::class)->area($area);

            return;
        }

        throw new RuntimeException('Invalid moderation job target.');
    }

    public function markRunning(int $processId, int $runNumber): void
    {
        ModerationProcess::whereKey($processId)
            ->where('run_number', $runNumber)
            ->where('state', 'queued')
            ->update(['state' => 'running']);
    }

    public function markJobComplete(int $processId, int $runNumber): void
    {
        if ($this->finishJob($processId, $runNumber)) {
            app(ModerationSummaryCache::class)->invalidate();
        }
    }

    private function finishJob(int $processId, int $runNumber, ?Throwable $exception = null): bool
    {
        $completed = DB::transaction(function () use ($processId, $runNumber, $exception): bool {
            $process = ModerationProcess::whereKey($processId)->lockForUpdate()->first();
            if (! $process || $process->run_number !== $runNumber || $process->pending_jobs === 0) {
                return false;
            }
            $process->pending_jobs--;
            if ($exception) {
                $process->failed_jobs++;
                $process->last_error = mb_substr($exception->getMessage(), 0, 2000);
            }
            if ($process->pending_jobs === 0 && $process->state !== 'dispatching') {
                $failed = $process->state === 'failed' || $process->failed_jobs > 0;
                $process->state = $failed ? 'failed' : 'complete';
                if (! $failed) {
                    $process->last_success_at = now();
                    $process->last_error = null;
                }
            }
            $process->save();

            return $process->pending_jobs === 0 && $process->state !== 'dispatching';
        });
        if ($completed && $process = ModerationProcess::find($processId)) {
            $this->finalizeCompletedProcess($process);
        }

        return $completed;
    }

    public function markJobFailed(int $processId, int $runNumber, ?Throwable $exception): void
    {
        if ($this->finishJob($processId, $runNumber, $exception)) {
            app(ModerationSummaryCache::class)->invalidate();
        }
    }
}
