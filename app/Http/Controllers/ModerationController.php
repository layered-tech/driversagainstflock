<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationIndexRequest;
use App\Models\ModerationActivity;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\ModerationReader;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Pagination\Paginator;
use Inertia\Inertia;
use Inertia\Response;

class ModerationController extends Controller
{
    public function index(ModerationIndexRequest $request, ModerationReader $reader): Response
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
            $reader->query()->getConnection()->transaction(function () use ($reader, $filters, $view, &$counts, &$source, &$records, &$profile, &$weeks): void {
                if ($view === 'areas') {
                    $summaries = $reader->areaSummaries($records->getCollection());
                    $records->through(fn (WatchedArea $area): array => [...$area->toArray(), ...$summaries[$area->id]]);
                }
                if (! in_array($view, ['areas', 'audit'], true)) {
                    $query = $reader->listing($view, $filters);
                    $sorts = match ($view) {
                        'nodes' => ['id', 'changed_at', 'osm_user', 'direction', 'operator'],
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
                        $record = $reader->query()->fromSub($reader->editors(), 'profile')->where('osm_uid', $filters['uid'])->first();
                        abort_unless($record, 404);
                        $profile = $reader->normalize($record);
                        $weeks = $reader->listing('changesets', ['uid' => $filters['uid']])->where('changed_at', '>=', now()->utc()->startOfWeek()->subWeeks(11))
                            ->selectRaw("date_trunc('week',changed_at AT TIME ZONE 'UTC') as week, count(*) as total")->groupByRaw("date_trunc('week',changed_at AT TIME ZONE 'UTC')")->orderBy('week')->get()->keyBy(fn (object $week): string => substr($week->week, 0, 10));
                        $weeks = collect(range(11, 0))->map(function (int $offset) use ($weeks): array {
                            $date = now()->utc()->startOfWeek()->subWeeks($offset);

                            return ['week' => $date->toIso8601String(), 'total' => (int) ($weeks->get($date->toDateString())?->total ?? 0)];
                        })->all();
                    }
                }
            });
        } catch (QueryException $exception) {
            report($exception);
            $source['state'] = 'unavailable';
        }

        return Inertia::render('Moderation/Index', [
            'view' => $view, 'filters' => $filters, 'records' => $records, 'profile' => $profile, 'weeks' => $weeks,
            'areas' => $areas, 'counts' => $counts,
            'source' => $source,
            'osmUrl' => rtrim(config('moderation.oauth.url'), '/'),
        ]);
    }

    public function changeset(int $changeset, ModerationReader $reader): JsonResponse
    {
        try {
            return response()->json($reader->changesetDetail($changeset));
        } catch (QueryException $exception) {
            report($exception);

            return response()->json(['message' => 'OpenStreetMap data is unavailable. Please try again.'], 503);
        }
    }

    public function area(WatchedArea $area, ModerationReader $reader): JsonResponse
    {
        try {
            $nodes = $reader->listing('nodes', ['area' => $area->id]);
            $changesets = $reader->listing('changesets', ['area' => $area->id]);

            return response()->json(['open_flags' => null,
                'changesets_7d' => (clone $changesets)->where('changed_at', '>=', now()->subDays(7))->count(),
                'flagged_changesets' => (clone $changesets)->where('status', 'Flagged')->count(),
                'nodes' => $nodes->limit(100)->get(['id', 'latitude', 'longitude']),
            ]);
        } catch (QueryException $exception) {
            report($exception);

            return response()->json(['message' => 'Area activity is unavailable. Please try again.'], 503);
        }
    }
}
