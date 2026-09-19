<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationIndexRequest;
use App\Models\AlprPresenceReport;
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
use Illuminate\Http\RedirectResponse;
use Illuminate\Pagination\Paginator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ModerationController extends Controller
{
    public function index(ModerationIndexRequest $request): RedirectResponse
    {
        $navigation = $request->validate([
            'view' => ['sometimes', Rule::in(['changesets', 'nodes', 'flagged', 'editors', 'profile', 'areas', 'audit'])],
            'uid' => ['required_if:view,profile', 'nullable', 'integer', 'min:1'],
        ]);
        $view = $navigation['view'] ?? 'nodes';
        $route = $view === 'profile' ? 'moderation.editors.show' : 'moderation.'.$view.'.index';

        return to_route($route, $request->validated());
    }

    public function nodes(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries): Response
    {
        return $this->listing($request, $reader, $summaries, 'nodes', 'Moderation/Nodes');
    }

    public function changesets(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries): Response
    {
        return $this->listing($request, $reader, $summaries, 'changesets', 'Moderation/Changesets');
    }

    public function flagged(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries): Response
    {
        return $this->listing($request, $reader, $summaries, 'flagged', 'Moderation/Flagged');
    }

    public function editors(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries): Response
    {
        return $this->listing($request, $reader, $summaries, 'editors', 'Moderation/Editors');
    }

    public function areas(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries): Response
    {
        return $this->listing($request, $reader, $summaries, 'areas', 'Moderation/Areas');
    }

    public function audit(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries): Response
    {
        return $this->listing($request, $reader, $summaries, 'audit', 'Moderation/Audit');
    }

    public function profile(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries, int $uid): Response
    {
        return $this->listing($request, $reader, $summaries, 'profile', 'Moderation/Profile', $uid);
    }

    private function listing(ModerationIndexRequest $request, ModerationReader $reader, ModerationSummaries $summaries, string $view, string $component, ?int $uid = null): Response
    {
        $filters = $request->validated();
        if ($uid !== null) {
            $filters['uid'] = $uid;
        }
        if (($filters['area_scope'] ?? null) === 'my') {
            $filters['area_ids'] = WatchedArea::where('user_id', $request->user()->id)
                ->orWhereHas('watchers', fn ($query) => $query->where('users.id', $request->user()->id))->pluck('id')->all();
        }
        $profile = null;
        $weeks = [];
        $areas = WatchedArea::orderBy('name')->get(['id', 'name']);
        $counts = ['nodes' => null, 'areas' => $areas->count()];
        $source = ['state' => 'ready', 'observed_at' => null];
        $records = new Paginator([], 200, $request->integer('page', 1), ['path' => $request->url()]);
        if ($view === 'areas') {
            $records = WatchedArea::with(['creator:id,name', 'watchers:id,name'])
                ->when(isset($filters['area_ids']), fn ($query) => $query->whereIn('id', $filters['area_ids']))
                ->when($filters['search'] ?? null, fn ($query, string $search) => $query->whereLike('name', '%'.$search.'%'))
                ->latest()->simplePaginate(200)->appends($request->safe()->except($uid !== null ? ['uid'] : []));
        } elseif ($view === 'audit') {
            $records = ModerationActivity::latest('id')->simplePaginate(200)->appends($request->safe()->except($uid !== null ? ['uid'] : []));
        }
        try {
            if ($view === 'editors') {
                $records = $this->editorRecords($request, $filters, $source);
            } else {
                $reader->query()->getConnection()->transaction(function () use ($request, $uid, $reader, $summaries, $filters, $view, &$counts, &$source, &$records, &$profile, &$weeks): void {
                    if ($view === 'areas') {
                        $records->through(function (WatchedArea $area) use ($summaries): array {
                            $result = $summaries->area($area);

                            return [...$area->toArray(), ...$result['data'], 'calculated_at' => $result['calculated_at']];
                        });
                    }
                    if (! in_array($view, ['areas', 'audit', 'editors'], true)) {
                        $query = $reader->listing($view, $filters, forPagination: true);
                        if (($filters['outcome'] ?? null) === 'reverted') {
                            $query->whereIn('id', ModerationContribution::where('status', 'reverted')->distinct()->pluck('changeset_id')->all());
                        }
                        $sorts = match ($view) {
                            'nodes', 'flagged' => ['reported_at', 'id', 'changed_at', 'osm_user', 'direction', 'operator'],
                            'editors' => ['name', 'tracked_changesets', 'last_active', 'added', 'modified', 'deleted'],
                            default => ['id', 'changed_at', 'osm_user', 'added', 'modified', 'deleted', 'total', 'status'],
                        };
                        $sort = ($filters['sort'] ?? null) === 'changesets_count' ? 'tracked_changesets' : ($filters['sort'] ?? '');
                        if (! in_array($sort, $sorts, true)) {
                            $sort = ($view === 'flagged' && ($filters['flag_source'] ?? null) === 'alpr_presence') ? 'reported_at' : ($view === 'editors' ? 'tracked_changesets' : 'changed_at');
                        }
                        $order = $filters['order'] ?? 'desc';
                        $query->orderBy($sort, $order);
                        $records = $reader->paginateListing($query->orderByDesc('id'), $view)->appends($request->safe()->except($uid !== null ? ['uid'] : []))->through($reader->normalize(...));
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
                            $flags = ModerationFlag::forListing($view === 'flagged' ? array_intersect_key($filters, array_flip(['flag_source', 'report_state'])) : [])->with('rule:id,name,severity')->where(fn ($query) => $query->whereIn('node_id', $ids)->orWhereIn('related_node_id', $ids))->get();
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

        return Inertia::render($component, [
            'filters' => array_diff_key($filters, ['area_ids' => true]), 'records' => $records, 'profile' => $profile, 'weeks' => $weeks,
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
            ->simplePaginate(200)->appends($request->validated())->through(fn (ModerationEditorSummary $summary): array => [
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

    public function node(int $node, ModerationIndexRequest $request, ModerationReader $reader): Response
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

        $reports = AlprPresenceReport::where('osm_node_id', $node)->orderByDesc('occurred_at')->orderByDesc('id')->paginate(25, ['*'], 'reports_page')->withQueryString();
        $flagIds = ModerationFlag::where('source', 'alpr_presence')->where('node_id', $node)->pluck('id');
        $reportReviews = ModerationActivity::where('subject_type', 'flag')->whereIn('subject_id', $flagIds)->latest('id')->paginate(25, ['*'], 'reviews_page')->withQueryString();

        return Inertia::render('Moderation/Node', [
            'reports' => $reports, 'reportReviews' => $reportReviews,
            'listingFilters' => $request->safe()->except(['reports_page', 'page']),
            ...$detail,
            'from' => $request->query('from') === 'flagged' ? 'flagged' : 'nodes',
            'counts' => ['nodes' => null, 'areas' => WatchedArea::count()],
            'source' => $source,
            'osmUrl' => rtrim(config('moderation.oauth.url'), '/'),
        ]);
    }
}
