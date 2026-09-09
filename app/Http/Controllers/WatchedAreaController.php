<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreWatchedAreaRequest;
use App\Models\ModerationActivity;
use App\Models\WatchedArea;
use Illuminate\Http\Client\HttpClientException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class WatchedAreaController extends Controller
{
    public function store(StoreWatchedAreaRequest $request): RedirectResponse
    {
        $values = $request->validated();
        $extent = DB::selectOne('SELECT ST_XMin(g) as west, ST_YMin(g) as south, ST_XMax(g) as east, ST_YMax(g) as north FROM (SELECT ST_GeomFromGeoJSON(?) as g) boundary', [json_encode($values['geometry'])]);
        DB::transaction(function () use ($request, $values, $extent): void {
            $area = WatchedArea::create([...$values, 'bounds' => [$extent->west, $extent->south, $extent->east, $extent->north], 'user_id' => $request->user()->id]);
            $area->watchers()->attach($request->user());
            $this->audit($request, $area, 'area.created');
        });

        return to_route('moderation.index', ['view' => 'areas']);
    }

    private function audit(Request $request, WatchedArea $area, string $action): void
    {
        ModerationActivity::create(['user_id' => $request->user()->id, 'actor' => $request->user()->name, 'action' => $action, 'subject_type' => 'area', 'subject_id' => $area->id, 'details' => ['name' => $area->name]]);
    }

    public function destroy(Request $request, WatchedArea $area): RedirectResponse
    {
        DB::transaction(function () use ($request, $area): void {
            $this->audit($request, $area, 'area.removed');
            $area->delete();
        });

        return back();
    }

    public function subscribe(Request $request, WatchedArea $area): RedirectResponse
    {
        DB::transaction(function () use ($request, $area): void {
            $changes = $area->watchers()->syncWithoutDetaching([$request->user()->id]);
            if ($changes['attached']) {
                $this->audit($request, $area, 'area.subscribed');
            }
        });

        return back();
    }

    public function unsubscribe(Request $request, WatchedArea $area): RedirectResponse
    {
        DB::transaction(function () use ($request, $area): void {
            if ($area->watchers()->detach($request->user()->id)) {
                $this->audit($request, $area, 'area.unsubscribed');
            }
        });

        return back();
    }

    public function search(Request $request): JsonResponse
    {
        $values = $request->validate(['query' => ['required', 'string', 'min:2', 'max:180'], 'kind' => ['required', 'in:zip,county']]);
        $key = 'moderation-area:'.hash('sha256', json_encode($values));
        if ($cached = Cache::get($key)) {
            return response()->json($cached);
        }
        if (! Cache::add('moderation-nominatim-rate', true, 1)) {
            return response()->json(['message' => 'Please wait a moment before searching again.'], 429);
        }
        try {
            $results = Http::acceptJson()->withUserAgent('DriversAgainstFlock moderation area lookup')->connectTimeout(3)->timeout(10)
                ->get('https://nominatim.openstreetmap.org/search', ['q' => $values['query'], 'format' => 'jsonv2', 'polygon_geojson' => 1, 'polygon_threshold' => 0.001, 'limit' => 5, ...($values['kind'] === 'zip' ? ['countrycodes' => 'us'] : [])])->throw()->json();
            $areas = collect(is_array($results) ? $results : [])->filter(fn (array $row): bool => in_array($row['geojson']['type'] ?? '', ['Polygon', 'MultiPolygon'], true))
                ->map(fn (array $row): array => ['name' => $row['display_name'], 'geometry' => $row['geojson']])->values()->all();
            Cache::put($key, $areas, now()->addDay());

            return response()->json($areas);
        } catch (HttpClientException) {
            return response()->json(['message' => 'The boundary search is unavailable. Try again or draw a boundary.'], 503);
        }
    }
}
