<?php

namespace App\Http\Controllers;

use App\Models\OsmNode;
use App\Support\SearchMetadata;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

class HotlistController extends Controller
{
    public function __construct(private SearchMetadata $searchMetadata) {}

    private const PER_PAGE = 25;

    /**
     * @var array<int, string>
     */
    private const WINDOW_KEYS = ['24', '7', '30'];

    /**
     * @var array<int, string>
     */
    private const MANUFACTURER_FILTERS = ['all', 'flock', 'other'];

    /**
     * @var array<int, string>
     */
    private const SORT_KEYS = ['updated', 'added', 'type', 'city'];

    /**
     * @var array<int, string>
     */
    private const SORT_DIRECTIONS = ['asc', 'desc'];

    public function __invoke(Request $request): Response
    {
        $payload = $this->payload($request);
        $seo = $this->searchMetadata->forRequest($request, $payload['latestUpdatedAt']);

        return Inertia::render('Hotlist', [
            'user' => auth()->user(),
            'canLogin' => Route::has('login'),
            'canRegister' => Route::has('register'),
            ...$payload,
            'seo' => $seo,
        ]);
    }

    public function json(Request $request): JsonResponse
    {
        return response()->json($this->payload($request));
    }

    /**
     * @return array{
     *     nodes: array{
     *         data: array<int, array<string, mixed>>,
     *         currentPage: int,
     *         lastPage: int,
     *         perPage: int,
     *         total: int,
     *         from: int|null,
     *         to: int|null
     *     },
     *     filters: array{window: string, manufacturer: string, query: string, sort: string, direction: string},
     *     stats: array<int, array{icon: string, label: string, value: string, sub: string, tone: string, isUp: bool}>,
     *     manufacturerCounts: array{all: int, flock: int, other: int},
     *     latestSyncedAt: string|null,
     *     latestUpdatedAt: string|null
     * }
     */
    private function payload(Request $request): array
    {
        $filters = $this->filters($request);
        $windowStartsAt = $this->windowStartsAt($filters['window']);
        $windowQuery = $this->windowedQuery($windowStartsAt);
        $manufacturerCounts = $this->manufacturerCounts(clone $windowQuery);

        if ($filters['manufacturer'] !== 'all' && ($manufacturerCounts[$filters['manufacturer']] ?? 0) === 0) {
            $filters['manufacturer'] = 'all';
        }

        $nodes = $this->sortedQuery(
            $this->filteredQuery(clone $windowQuery, $filters),
            $filters,
        )
            ->paginate(self::PER_PAGE)
            ->withQueryString()
            ->through(fn (OsmNode $node): array => $this->formatNode($node));

        return [
            'nodes' => $this->paginationPayload($nodes),
            'filters' => $filters,
            'stats' => $this->stats($filters['window'], $manufacturerCounts),
            'manufacturerCounts' => $manufacturerCounts,
            'latestSyncedAt' => $this->latestSyncedAt(),
            'latestUpdatedAt' => $this->searchMetadata->latestHotlistUpdatedAt(),
        ];
    }

    /**
     * @return array{window: string, manufacturer: string, query: string, sort: string, direction: string}
     */
    private function filters(Request $request): array
    {
        $window = $this->allowedValue($request->string('window')->toString(), self::WINDOW_KEYS, '7');
        $manufacturer = $this->allowedValue($request->string('manufacturer')->toString(), self::MANUFACTURER_FILTERS, 'all');
        $sort = $this->allowedValue($request->string('sort')->toString(), self::SORT_KEYS, 'updated');
        $direction = $this->allowedValue($request->string('direction')->toString(), self::SORT_DIRECTIONS, 'desc');

        return [
            'window' => $window,
            'manufacturer' => $manufacturer,
            'query' => trim($request->string('query')->toString()),
            'sort' => $sort === 'added' ? 'updated' : $sort,
            'direction' => $direction,
        ];
    }

    /**
     * @param  array<int, string>  $allowedValues
     */
    private function allowedValue(string $value, array $allowedValues, string $default): string
    {
        return in_array($value, $allowedValues, true) ? $value : $default;
    }

    private function windowStartsAt(string $window): Carbon
    {
        return match ($window) {
            '24' => now()->subDay(),
            '30' => now()->subDays(30),
            default => now()->subDays(7),
        };
    }

    private function windowedQuery(Carbon $windowStartsAt): Builder
    {
        return $this->baseQuery()
            ->whereRaw($this->freshnessExpression().' >= ?', [$windowStartsAt->toDateTimeString()]);
    }

    private function baseQuery(): Builder
    {
        return OsmNode::query()
            ->where('osm_version', 1)
            ->select([
                'id',
                'osm_id',
                'latitude',
                'longitude',
                'tags',
                'surveillance_type',
                'osm_updated_at',
                'osm_version',
                'osm_changeset_id',
                'osm_user',
                'osm_uid',
                'last_synced_at',
                'created_at',
            ]);
    }

    /**
     * @param  array{window: string, manufacturer: string, query: string, sort: string, direction: string}  $filters
     */
    private function filteredQuery(Builder $query, array $filters): Builder
    {
        if ($filters['manufacturer'] === 'flock') {
            $this->whereFlockManufacturer($query);
        } elseif ($filters['manufacturer'] === 'other') {
            $this->whereOtherManufacturer($query);
        }

        if ($filters['query'] !== '') {
            $this->whereSearch($query, $filters['query']);
        }

        return $query;
    }

    /**
     * @param  array{window: string, manufacturer: string, query: string, sort: string, direction: string}  $filters
     */
    private function sortedQuery(Builder $query, array $filters): Builder
    {
        $direction = $filters['direction'];

        return match ($filters['sort']) {
            'type' => $query
                ->orderByRaw($this->alprOrderExpression().' '.$direction)
                ->orderByRaw($this->freshnessExpression().' desc')
                ->orderByDesc('id'),
            'city' => $query
                ->orderByRaw($this->cityOrderExpression().' '.$direction)
                ->orderByRaw($this->freshnessExpression().' desc')
                ->orderByDesc('id'),
            default => $query
                ->orderByRaw($this->freshnessExpression().' '.$direction)
                ->orderBy('id', $direction),
        };
    }

    /**
     * @return array{all: int, flock: int, other: int}
     */
    private function manufacturerCounts(Builder $query): array
    {
        $all = (clone $query)->toBase()->count();
        $flock = (clone $query)
            ->where(function (Builder $query): void {
                $this->whereFlockManufacturer($query);
            })
            ->toBase()
            ->count();

        return [
            'all' => $all,
            'flock' => $flock,
            'other' => max(0, $all - $flock),
        ];
    }

    private function whereAlpr(Builder $query): Builder
    {
        return $query->where(function (Builder $query): void {
            $query
                ->where('surveillance_type', 'ALPR')
                ->orWhere(function (Builder $query): void {
                    $query
                        ->whereNull('surveillance_type')
                        ->whereRaw($this->tagTypeExpression()." LIKE '%ALPR%'");
                });
        });
    }

    private function whereFlockManufacturer(Builder $query): Builder
    {
        return $query->where(function (Builder $query): void {
            $query
                ->whereRaw("coalesce(tags->>'manufacturer', '') ILIKE ?", ['%flock%'])
                ->orWhereRaw("coalesce(tags->>'brand', '') ILIKE ?", ['%flock%'])
                ->orWhereRaw("coalesce(tags->>'operator', '') ILIKE ?", ['%flock%'])
                ->orWhereRaw("lower(coalesce(tags->>'manufacturer:wikidata', tags->>'brand:wikidata', '')) = 'q108485435'");
        });
    }

    private function whereOtherManufacturer(Builder $query): Builder
    {
        return $query->where(function (Builder $query): void {
            $query
                ->whereRaw("coalesce(tags->>'manufacturer', tags->>'brand', tags->>'operator', '') = ''")
                ->orWhere(function (Builder $query): void {
                    $query->whereNot(function (Builder $query): void {
                        $this->whereFlockManufacturer($query);
                    });
                });
        });
    }

    private function whereSearch(Builder $query, string $search): Builder
    {
        $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search).'%';

        return $query->where(function (Builder $query) use ($like): void {
            $query
                ->whereRaw('osm_id::text ILIKE ? ESCAPE \'\\\'', [$like])
                ->orWhereRaw("tags->>'operator' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'brand' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'manufacturer' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'name' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'ref' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'addr:full' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'addr:housenumber' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'addr:street' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'addr:place' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'addr:city' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'addr:suburb' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'is_in:city' ILIKE ? ESCAPE '\\'", [$like])
                ->orWhereRaw("tags->>'is_in:county' ILIKE ? ESCAPE '\\'", [$like]);
        });
    }

    private function tagTypeExpression(): string
    {
        return "upper(coalesce(tags->>'surveillance:type', tags->>'camera:type', ''))";
    }

    private function alprOrderExpression(): string
    {
        return "case when surveillance_type = 'ALPR' or (surveillance_type is null and {$this->tagTypeExpression()} like '%ALPR%') then 0 else 1 end";
    }

    private function cityOrderExpression(): string
    {
        return "lower(coalesce(tags->>'addr:city', tags->>'addr:suburb', tags->>'is_in:city', tags->>'is_in:county', tags->>'county', 'OpenStreetMap node'))";
    }

    private function freshnessExpression(): string
    {
        return 'coalesce(osm_updated_at, created_at)';
    }

    /**
     * @return array{
     *     data: array<int, array<string, mixed>>,
     *     currentPage: int,
     *     lastPage: int,
     *     perPage: int,
     *     total: int,
     *     from: int|null,
     *     to: int|null
     * }
     */
    private function paginationPayload(LengthAwarePaginator $nodes): array
    {
        return [
            'data' => $nodes->items(),
            'currentPage' => $nodes->currentPage(),
            'lastPage' => $nodes->lastPage(),
            'perPage' => $nodes->perPage(),
            'total' => $nodes->total(),
            'from' => $nodes->firstItem(),
            'to' => $nodes->lastItem(),
        ];
    }

    /**
     * @param  array{all: int, flock: int, other: int}  $manufacturerCounts
     * @return array<int, array{icon: string, label: string, value: string, sub: string, tone: string, isUp: bool}>
     */
    private function stats(string $window, array $manufacturerCounts): array
    {
        $windowStartsAt = $this->windowStartsAt($window);
        $previousWindowStartsAt = $this->previousWindowStartsAt($window);
        $updatedInWindow = $manufacturerCounts['all'];
        $updatedInPreviousWindow = $this->baseQuery()
            ->whereRaw($this->freshnessExpression().' >= ? and '.$this->freshnessExpression().' < ?', [
                $previousWindowStartsAt->toDateTimeString(),
                $windowStartsAt->toDateTimeString(),
            ])
            ->toBase()
            ->count();
        $days = match ($window) {
            '24' => 1,
            '30' => 30,
            default => 7,
        };

        return [
            [
                'icon' => 'plus',
                'label' => 'Added '.$this->currentWindowLabel($window),
                'value' => number_format($updatedInWindow),
                'sub' => $this->percentageChangeLabel($updatedInWindow, $updatedInPreviousWindow).' vs '.$this->previousWindowLabel($window),
                'tone' => $updatedInWindow > $updatedInPreviousWindow ? 'up' : 'muted',
                'isUp' => $updatedInWindow > $updatedInPreviousWindow,
            ],
            [
                'icon' => 'camera',
                'label' => 'Flock readers',
                'value' => number_format($manufacturerCounts['flock']),
                'sub' => $this->percentageLabel($manufacturerCounts['flock'], $manufacturerCounts['all']),
                'tone' => 'muted',
                'isUp' => false,
            ],
            [
                'icon' => 'camera',
                'label' => 'Other vendors',
                'value' => number_format($manufacturerCounts['other']),
                'sub' => $this->percentageLabel($manufacturerCounts['other'], $manufacturerCounts['all']),
                'tone' => 'muted',
                'isUp' => false,
            ],
            [
                'icon' => 'clock',
                'label' => 'Avg / day',
                'value' => number_format($manufacturerCounts['all'] / $days, 1),
                'sub' => 'last '.$this->windowLabel($window),
                'tone' => 'muted',
                'isUp' => false,
            ],
        ];
    }

    private function percentageLabel(int $value, int $total): string
    {
        if ($total === 0) {
            return '0% of added';
        }

        return round(($value / $total) * 100).'% of added';
    }

    private function percentageChangeLabel(int $current, int $previous): string
    {
        if ($previous === 0) {
            return $current === 0 ? '0%' : '+100%';
        }

        $change = (int) round((($current - $previous) / $previous) * 100);

        return ($change > 0 ? '+' : '').$change.'%';
    }

    private function windowLabel(string $window): string
    {
        return match ($window) {
            '24' => '24 hours',
            '30' => '30 days',
            default => '7 days',
        };
    }

    private function currentWindowLabel(string $window): string
    {
        return 'last '.$this->windowLabel($window);
    }

    private function previousWindowLabel(string $window): string
    {
        return 'previous '.$this->windowLabel($window);
    }

    private function previousWindowStartsAt(string $window): Carbon
    {
        return match ($window) {
            '24' => now()->subDays(2),
            '30' => now()->subDays(60),
            default => now()->subDays(14),
        };
    }

    private function latestSyncedAt(): ?string
    {
        $latestSyncedAt = OsmNode::query()->max('last_synced_at');

        return $latestSyncedAt === null
            ? null
            : Carbon::parse($latestSyncedAt)->toJSON();
    }

    /**
     * @return array{
     *     id: int,
     *     osmId: int|string,
     *     osm: string,
     *     type: string,
     *     typeLabel: string,
     *     manufacturer: string,
     *     operator: string,
     *     street: string,
     *     city: string,
     *     contributor: string,
     *     coordinates: array{0: float, 1: float},
     *     updatedAt: string|null,
     *     osmUpdatedAt: string|null,
     *     osmVersion: int|null,
     *     osmChangesetId: int|null,
     *     osmUser: string|null,
     *     osmUid: int|null,
     *     syncedAt: string|null
     * }
     */
    private function formatNode(OsmNode $node): array
    {
        $tags = is_array($node->tags) ? $node->tags : [];
        $type = $this->nodeType($node, $tags);
        $latitude = (float) $node->latitude;
        $longitude = (float) $node->longitude;
        $manufacturer = $this->manufacturerLabel($tags);

        return [
            'id' => $node->id,
            'osmId' => $node->osm_id,
            'osm' => 'node/'.$node->osm_id,
            'type' => $type,
            'typeLabel' => $type === 'alpr' ? 'ALPR reader' : 'Traffic camera',
            'manufacturer' => $manufacturer,
            'operator' => $manufacturer,
            'street' => $this->locationLabel($tags, $latitude, $longitude),
            'city' => $this->localityLabel($tags),
            'contributor' => $this->contributorLabel($node),
            'coordinates' => [$longitude, $latitude],
            'updatedAt' => $this->freshnessTime($node)?->toJSON(),
            'osmUpdatedAt' => $node->osm_updated_at?->toJSON(),
            'osmVersion' => $node->osm_version,
            'osmChangesetId' => $node->osm_changeset_id,
            'osmUser' => $node->osm_user,
            'osmUid' => $node->osm_uid,
            'syncedAt' => $node->last_synced_at?->toJSON(),
        ];
    }

    private function freshnessTime(OsmNode $node): ?Carbon
    {
        return $node->osm_updated_at ?? $node->created_at;
    }

    private function contributorLabel(OsmNode $node): string
    {
        return $node->osm_user ?: 'OSM';
    }

    /**
     * @param  array<string, mixed>  $tags
     */
    private function manufacturerLabel(array $tags): string
    {
        return $this->tagValue($tags, ['manufacturer', 'brand', 'operator']) ?? 'Unknown';
    }

    /**
     * @param  array<string, mixed>  $tags
     */
    private function nodeType(OsmNode $node, array $tags): string
    {
        $rawType = strtoupper((string) ($node->surveillance_type ?? $tags['surveillance:type'] ?? $tags['camera:type'] ?? ''));

        return str_contains($rawType, 'ALPR') ? 'alpr' : 'camera';
    }

    /**
     * @param  array<string, mixed>  $tags
     */
    private function locationLabel(array $tags, float $latitude, float $longitude): string
    {
        return $this->tagValue($tags, ['addr:full'])
            ?? $this->addressLine($tags)
            ?? $this->tagValue($tags, ['name', 'ref', 'addr:place'])
            ?? sprintf('%.4f, %.4f', $latitude, $longitude);
    }

    /**
     * @param  array<string, mixed>  $tags
     */
    private function addressLine(array $tags): ?string
    {
        $street = $this->tagValue($tags, ['addr:street', 'street']);

        if ($street === null) {
            return null;
        }

        $houseNumber = $this->tagValue($tags, ['addr:housenumber']);

        return $houseNumber === null ? $street : $houseNumber.' '.$street;
    }

    /**
     * @param  array<string, mixed>  $tags
     */
    private function localityLabel(array $tags): string
    {
        return $this->tagValue($tags, [
            'addr:city',
            'addr:suburb',
            'is_in:city',
            'is_in:county',
            'county',
            'addr:state',
            'addr:country',
        ]) ?? 'OpenStreetMap node';
    }

    /**
     * @param  array<string, mixed>  $tags
     * @param  array<int, string>  $keys
     */
    private function tagValue(array $tags, array $keys): ?string
    {
        foreach ($keys as $key) {
            $value = $tags[$key] ?? null;

            if (! is_scalar($value)) {
                continue;
            }

            $value = trim((string) $value);

            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }
}
