<?php

namespace App\Http\Middleware;

use App\Models\ModerationFlag;
use App\Models\ModerationRule;
use App\Models\OsmNode;
use App\Models\WatchedArea;
use App\Support\SearchMetadata;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    public function __construct(private SearchMetadata $searchMetadata) {}

    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user(),
            ],
            'seo' => $this->searchMetadata->forRequest($request),
            ...($request->routeIs('moderation.*') ? [
                'moderationNavigation' => Inertia::always(fn (): array => $this->moderationCounts()),
            ] : []),
        ];
    }

    /** @return array{nodes: ?int, flagged: ?int, areas: int, rules: int} */
    private function moderationCounts(): array
    {
        $counts = ['nodes' => null, 'flagged' => null, 'areas' => WatchedArea::count(), 'rules' => ModerationRule::where('enabled', true)->count()];
        try {
            $counts['flagged'] = ModerationFlag::active()->distinct()->count('node_id');
            $counts['nodes'] = Cache::remember('moderation:navigation:nodes', 300, fn (): int => OsmNode::where('surveillance_type', 'ALPR')->count());
        } catch (QueryException $exception) {
            report($exception);
        }

        return $counts;
    }
}
