<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreAreaSubscriptionRequest;
use App\Http\Requests\Api\V1\UpdateAreaSubscriptionRequest;
use App\Models\AreaDevice;
use App\Models\AreaSubscription;
use App\Services\Areas\AreaChanges;
use Illuminate\Http\Client\HttpClientException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class AreaSubscriptionController extends Controller
{
    public function __construct(private AreaChanges $changes) {}

    public function index(Request $request): JsonResponse
    {
        $values = $request->validate(['window' => ['sometimes', 'in:24h,7,30']]);

        return response()->json(['areas' => $this->device($request)->subscriptions()->orderBy('id')->get()->map(fn (AreaSubscription $area): array => $this->changes->summary($area, $values['window'] ?? '7'))]);
    }

    private function device(Request $request): AreaDevice
    {
        return $request->attributes->get('area_device');
    }

    public function store(StoreAreaSubscriptionRequest $request): JsonResponse
    {
        $values = $request->validated();
        $json = json_encode($values['geometry'], JSON_THROW_ON_ERROR);
        $extent = DB::selectOne('SELECT ST_XMin(g) as west, ST_YMin(g) as south, ST_XMax(g) as east, ST_YMax(g) as north FROM (SELECT ST_GeomFromGeoJSON(?) as g) boundary', [$json]);
        $area = DB::transaction(function () use ($request, $values, $json, $extent): AreaSubscription {
            $device = AreaDevice::whereKey($this->device($request)->id)->lockForUpdate()->firstOrFail();
            $existing = $device->subscriptions()->where('geometry_hash', hash('sha256', $json))->first();
            if ($existing) {
                return $existing;
            }
            abort_if($device->subscriptions()->count() >= 25, 422, 'You can watch up to 25 areas.');

            return $device->subscriptions()->create([...$values,
                'geometry_hash' => hash('sha256', $json),
                'bounds' => [$extent->west, $extent->south, $extent->east, $extent->north],
                'last_processed_version_id' => $this->changes->latestVersionId(),
            ])->refresh();
        });

        return response()->json(['area' => $this->changes->summary($area)], 201);
    }

    public function preview(StoreAreaSubscriptionRequest $request): JsonResponse
    {
        return response()->json(['camera_count' => $this->changes->cameraCount($request->validated('geometry')),
            'cameras' => $this->changes->cameras($request->validated('geometry'))->limit(500)->get(['osm_id', 'longitude', 'latitude'])->map(fn ($camera): array => ['id' => $camera->osm_id, 'kind' => 'added', 'longitude' => (float) $camera->longitude, 'latitude' => (float) $camera->latitude]),
        ]);
    }

    public function destroy(Request $request, int $area): JsonResponse
    {
        $this->owned($request, $area)->delete();

        return response()->json(['deleted' => true]);
    }

    private function owned(Request $request, int $id): AreaSubscription
    {
        return $this->device($request)->subscriptions()->findOrFail($id);
    }

    public function feed(Request $request, int $area): JsonResponse
    {
        $values = $request->validate(['window' => ['sometimes', 'in:24h,7,30'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $subscription = $this->owned($request, $area);
        $since = match ($values['window'] ?? '7') {
            '24h' => now()->subDay(), '30' => now()->subDays(30), default => now()->subDays(7)
        };
        $snapshot = $this->changes->latestVersionId();
        $query = $this->changes->query($subscription)->where('id', '<=', $snapshot)->where('osm_updated_at', '>=', $since);
        $counts = $this->changes->counts($query);
        $changes = $query->orderByDesc('osm_updated_at')->orderByDesc('id')->paginate(50)->through(fn (object $change): array => $this->changes->normalize($change));

        return response()->json(['area' => $this->changes->summary($subscription), 'counts' => $counts, 'changes' => $changes, 'read_through_id' => $snapshot]);
    }

    public function markRead(Request $request, int $area): JsonResponse
    {
        $values = $request->validate(['through_id' => ['required', 'integer', 'min:0']]);
        $subscription = $this->owned($request, $area);
        $through = min($this->changes->latestVersionId(), $values['through_id']);
        AreaSubscription::whereKey($subscription)->where('last_read_version_id', '<', $through)->update(['last_read_version_id' => $through]);

        return response()->json(['read' => true]);
    }

    public function update(UpdateAreaSubscriptionRequest $request, int $area): JsonResponse
    {
        $subscription = $this->owned($request, $area);
        DB::transaction(function () use ($subscription, $request): void {
            $subscription = AreaSubscription::whereKey($subscription)->lockForUpdate()->firstOrFail();
            $subscription->fill($request->validated());
            if ($subscription->isDirty(['alert_mode', 'notify_added', 'notify_removed', 'digest_time'])) {
                $subscription->fill(['preference_version' => $subscription->preference_version + 1,
                    'last_processed_version_id' => $this->changes->latestVersionId(),
                    'pending_added' => 0, 'pending_removed' => 0, 'next_digest_at' => null]);
            }
            $subscription->save();
        });

        return response()->json(['area' => $this->changes->summary($subscription->refresh())]);
    }

    public function change(Request $request, int $area, int $change): JsonResponse
    {
        $subscription = $this->owned($request, $area);
        $record = $this->changes->query($subscription)->where('id', $change)->first();
        abort_unless($record, 404);

        return response()->json(['area' => $subscription->only(['id', 'name', 'kind']), 'change' => $this->changes->normalize($record)]);
    }

    public function search(Request $request): JsonResponse
    {
        $values = $request->validate(['query' => ['required', 'string', 'min:2', 'max:180']]);
        $key = 'mobile-area-search:'.hash('sha256', $values['query']);
        if (($cached = Cache::get($key)) !== null) {
            return response()->json(['results' => $cached]);
        }
        abort_unless(Cache::add('moderation-nominatim-rate', true, 1), 429, 'Please wait a moment before searching again.');
        try {
            $rows = Http::acceptJson()->withUserAgent('DriversAgainstFlock area subscriptions')->connectTimeout(3)->timeout(10)
                ->get('https://nominatim.openstreetmap.org/search', ['q' => $values['query'], 'format' => 'jsonv2', 'addressdetails' => 1, 'polygon_geojson' => 1, 'polygon_threshold' => 0.001, 'limit' => 5])->throw()->json();
            $results = collect(is_array($rows) ? $rows : [])->filter(fn (array $row): bool => in_array($row['geojson']['type'] ?? '', ['Polygon', 'MultiPolygon'], true) && in_array($row['addresstype'] ?? $row['type'] ?? '', ['city', 'town', 'village', 'municipality', 'county', 'postcode'], true))
                ->map(function (array $row): array {
                    $kind = match ($row['addresstype'] ?? $row['type'] ?? '') {
                        'postcode' => 'zip', 'county' => 'county', default => 'city'
                    };

                    return ['name' => mb_substr($row['name'] ?? $row['display_name'], 0, 120), 'kind' => $kind,
                        'definition' => mb_substr($row['display_name'], 0, 255), 'geometry' => $row['geojson'],
                        'camera_count' => $this->changes->cameraCount($row['geojson'])];
                })->values()->all();
            Cache::put($key, $results, now()->addDay());

            return response()->json(['results' => $results]);
        } catch (HttpClientException) {
            return response()->json(['message' => 'Boundary search is unavailable. Try again or draw an area.'], 503);
        }
    }
}
