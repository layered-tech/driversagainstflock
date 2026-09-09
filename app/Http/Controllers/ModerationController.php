<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationIndexRequest;
use App\Models\ModerationActivity;
use App\Models\ModerationContribution;
use App\Models\ModerationEditorSummary;
use App\Models\ModerationFlag;
use App\Models\ModerationProcess;
use App\Models\ModerationRule;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\ModerationReader;
use App\Services\OpenStreetMap\ModerationSummaries;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\Paginator;
use Inertia\Inertia;
use Inertia\Response;

class ModerationController extends Controller
{
    public function index(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries): Response
    {
        $filters = $request->validated();
        $view = $filters['view'] ?? 'nodes';
        $profile = null;
        $weeks = [];
        $areas = WatchedArea::orderBy('name')->get(['id', 'name']);
        $counts = ['nodes' => null, 'areas' => $areas->count()];
        $source = ['state' => 'ready', 'observed_at' => null];
        $records = new Paginator([], 200, $request->integer('page', 1), ['path' => $request->url()]);
        if ($view === 'areas') {
            $records = WatchedArea::with(['creator:id,name', 'watchers:id,name'])
                ->when($filters['search'] ?? null, fn ($query, string $search) => $query->whereLike('name', '%'.$search.'%'))
                ->latest()->simplePaginate(200)->withQueryString();
        } elseif ($view === 'audit') {
            $records = ModerationActivity::latest('id')->simplePaginate(200)->withQueryString();
        }
        try {
            if ($view === 'editors') {
                $records = $this->editorRecords($request, $filters, $source);
            } else {
                $reader->query()->getConnection()->transaction(function () use ($reader, $summaries, $filters, $view, &$counts, &$source, &$records, &$profile, &$weeks): void {
                    if ($view === 'areas') {
                        $records->through(function (WatchedArea $area) use ($summaries): array {
                            $result = $summaries->area($area);

                            return [...$area->toArray(), ...$result['data'], 'calculated_at' => $result['calculated_at']];
                        });
                    }
                    if (! in_array($view, ['areas', 'audit', 'editors'], true)) {
                        $query = $reader->listing($view, $filters);
                        if (($filters['outcome'] ?? null) === 'reverted') {
                            $query->whereIn('id', ModerationContribution::where('status', 'reverted')->distinct()->pluck('changeset_id')->all());
                        }
                        $sorts = match ($view) {
                            'nodes', 'flagged' => ['id', 'changed_at', 'osm_user', 'direction', 'operator'],
                            'editors' => ['name', 'tracked_changesets', 'last_active', 'added', 'modified', 'deleted'],
                            default => ['id', 'changed_at', 'osm_user', 'added', 'modified', 'deleted', 'total', 'status'],
                        };
                        $sort = ($filters['sort'] ?? null) === 'changesets_count' ? 'tracked_changesets' : ($filters['sort'] ?? '');
                        if (! in_array($sort, $sorts, true)) {
                            $sort = $view === 'editors' ? 'tracked_changesets' : 'changed_at';
                        }
                        $order = $filters['order'] ?? 'desc';
                        $query->orderBy($sort, $order);
                        $records = $query->orderByDesc('id')->simplePaginate(200)->withQueryString()->through($reader->normalize(...));
                        if ($view === 'profile') {
                            $result = $summaries->editor((int) $filters['uid']);
                            $profile = $result['data'];
                            $profile['calculated_at'] = $result['calculated_at'];
                            $weeks = $profile['weeks'];
                            $source['calculated_at'] = $result['calculated_at'];
                        }
                        if (in_array($view, ['profile', 'changesets'], true)) {
                            $records->setCollection($summaries->timeline($records->getCollection()));
                        }
                        if (in_array($view, ['nodes', 'flagged'], true)) {
                            $ids = $records->getCollection()->pluck('id');
                            $flags = ModerationFlag::active()->with('rule:id,name,severity')->where(fn ($query) => $query->whereIn('node_id', $ids)->orWhereIn('related_node_id', $ids))->get();
                            $records->through(fn (array $row): array => [...$row, 'flags' => $flags->filter(fn ($flag) => $flag->node_id === $row['id'] || $flag->related_node_id === $row['id'])->values()->toArray()]);
                        }
                    }
                });
            }
        } catch (LockTimeoutException $exception) {
            $source['state'] = 'refreshing';
        } catch (QueryException $exception) {
            report($exception);
            $source['state'] = 'unavailable';
        }

        return Inertia::render('Moderation/Index', [
            'view' => $view, 'filters' => $filters, 'records' => $records, 'profile' => $profile, 'weeks' => $weeks,
            'areas' => $areas, 'counts' => $counts,
            'source' => $source,
            ...($view === 'flagged' ? ['ruleOptions' => ModerationRule::where('enabled', true)->orderBy('name')->get(['id', 'name'])] : []),
            'osmUrl' => rtrim(config('moderation.oauth.url'), '/'),
        ]);
    }

    /** @param array<string, mixed> $filters */
    private function editorRecords(ModerationIndexRequest $request, array $filters, array &$source): Paginator
    {
        $query = ModerationEditorSummary::query()->whereNotNull('calculated_at');
        if (! empty($filters['user'])) {
            ctype_digit($filters['user'])
                ? $query->where('osm_uid', $filters['user'])
                : $query->whereLike('name', '%'.$filters['user'].'%');
        }
        if (! empty($filters['window'])) {
            $query->where('last_active', '>=', match ($filters['window']) {
                '24h' => now()->subDay(), '7d' => now()->subDays(7), default => now()->subDays(30),
            });
        }
        if (! empty($filters['area'])) {
            $query->whereHas('areas', fn ($areas) => $areas->whereKey($filters['area']));
        }

        $sort = match ($filters['sort'] ?? null) {
            'name' => 'name',
            'added' => 'added',
            'modified' => 'modified',
            'deleted' => 'deleted',
            'flags_count' => 'flags_count',
            'survival' => 'survival_percent',
            'area_count' => 'areas_count',
            'last_active' => 'last_active',
            default => 'tracked_changesets',
        };
        $order = $filters['order'] ?? 'desc';
        $records = $query->orderByRaw($sort.' '.$order.' NULLS LAST')->orderByDesc('osm_uid')
            ->simplePaginate(200)->withQueryString()->through(fn (ModerationEditorSummary $summary): array => [
                ...$summary->toArray(),
                'id' => $summary->osm_uid,
                'area_count' => $summary->areas_count,
                'status' => null,
                'survival' => ['percent' => $summary->survival_percent, 'reverted' => $summary->survival_reverted],
            ]);

        $process = ModerationProcess::whereIn('name', ['summaries', 'summaries:rebuild'])->latest('updated_at')->first();
        $refreshing = ! ModerationEditorSummary::whereNotNull('calculated_at')->exists()
            || ModerationEditorSummary::whereNotNull('dirty_at')->exists()
            || ModerationEditorSummary::whereNull('calculated_at')->exists()
            || ($process && in_array($process->state, ['dispatching', 'queued', 'running'], true));
        $source['state'] = $refreshing ? 'refreshing' : 'ready';
        $source['calculated_at'] = ModerationEditorSummary::max('calculated_at');
        $source['summary_progress'] = $process && in_array($process->state, ['dispatching', 'queued', 'running', 'failed'], true) ? [
            'completed' => max(0, $process->total_jobs - $process->pending_jobs),
            'total' => $process->total_jobs,
            'failed' => $process->failed_jobs,
        ] : null;

        return $records;
    }

    public function area(WatchedArea $area, ModerationReader $reader, ModerationSummaries $summaries): JsonResponse
    {
        try {
            $result = $summaries->area($area);

            return response()->json([...$result['data'], 'calculated_at' => $result['calculated_at']]);
        } catch (QueryException|LockTimeoutException $exception) {
            report($exception);

            return response()->json(['message' => 'Area activity is unavailable. Please try again.'], 503);
        }
    }

    public function changeset(int $changeset, ModerationReader $reader): JsonResponse
    {
        try {
            return response()->json($reader->changesetDetail($changeset));
        } catch (QueryException|LockTimeoutException $exception) {
            report($exception);

            return response()->json(['message' => 'OpenStreetMap data is unavailable. Please try again.'], 503);
        }
    }

    public function node(int $node, Request $request, ModerationReader $reader): Response
    {
        try {
            $detail = $reader->query()->getConnection()->transaction(
                fn (): array => $reader->nodeDetail($node),
            );
            $source = ['state' => 'ready'];
        } catch (QueryException|LockTimeoutException $exception) {
            report($exception);
            $detail = ['node' => ['id' => $node], 'versions' => [], 'flags' => []];
            $source = ['state' => 'unavailable'];
        }

        return Inertia::render('Moderation/Node', [
            ...$detail,
            'from' => $request->query('from') === 'flagged' ? 'flagged' : 'nodes',
            'counts' => ['nodes' => null, 'areas' => WatchedArea::count()],
            'source' => $source,
            'osmUrl' => rtrim(config('moderation.oauth.url'), '/'),
        ]);
    }
}
