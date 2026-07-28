<?php

namespace App\Services\Roads;

use App\Services\Directions\DirectionsException;
use App\Services\SpeedLimits\MaxspeedParser;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use JsonException;

class OpenStreetMapRoadGraphLookup
{
    private const METERS_PER_LATITUDE_DEGREE = 111320;

    private const DRIVABLE_HIGHWAY_PATTERN = 'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|road';

    /** @var list<string> */
    private const RESTRICTED_ACCESS_VALUES = ['no', 'private'];

    /** @var list<string> */
    private const MOTORCAR_ACCESS_KEYS = ['motorcar', 'motor_vehicle', 'vehicle', 'access'];

    /** @var list<string> */
    private const MOTORCAR_ONEWAY_KEYS = ['oneway:motorcar', 'oneway:motor_vehicle', 'oneway:vehicle', 'oneway'];

    public function __construct(private readonly MaxspeedParser $maxspeedParser) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function find(float $latitude, float $longitude, int $radiusMeters): array
    {
        $cacheCell = $this->cacheCell($latitude, $longitude, $radiusMeters);
        $storedWays = $this->storedWays($cacheCell['cache_key']);

        if ($storedWays !== null) {
            return $storedWays;
        }

        try {
            return Cache::lock(
                $cacheCell['cache_key'].':lock',
                (int) config('road-corridor.lock_seconds'),
            )->block(
                (int) config('road-corridor.lock_wait_seconds'),
                function () use ($cacheCell): array {
                    $storedWays = $this->storedWays($cacheCell['cache_key']);

                    if ($storedWays !== null) {
                        return $storedWays;
                    }

                    if (Cache::get($cacheCell['failure_key']) === true) {
                        throw DirectionsException::upstream('Road corridor could not be loaded.');
                    }

                    return $this->fetchAndStore($cacheCell);
                },
            );
        } catch (LockTimeoutException) {
            $storedWays = $this->storedWays($cacheCell['cache_key']);

            if ($storedWays !== null) {
                return $storedWays;
            }

            throw DirectionsException::upstream('Road corridor could not be loaded.');
        }
    }

    /**
     * @param  array{
     *     cache_key: string,
     *     failure_key: string,
     *     latitude: float,
     *     longitude: float,
     *     query_radius_meters: int
     * }  $cacheCell
     */
    private function fetchAndStore(array $cacheCell): array
    {
        try {
            $ways = $this->fetch(
                $cacheCell['latitude'],
                $cacheCell['longitude'],
                $cacheCell['query_radius_meters'],
            );
        } catch (DirectionsException $exception) {
            Cache::put(
                $cacheCell['failure_key'],
                true,
                now()->addSeconds((int) config('road-corridor.failure_cache_seconds')),
            );

            throw $exception;
        }

        $this->storeWays($cacheCell['cache_key'], $ways);
        Cache::forget($cacheCell['failure_key']);

        return $ways;
    }

    /**
     * @return list<array<string, mixed>>|null
     */
    private function storedWays(string $cacheKey): ?array
    {
        $ways = DB::table('road_corridor_caches')
            ->where('cache_key', $cacheKey)
            ->value('ways');

        if (is_array($ways)) {
            return $ways;
        }

        if (! is_string($ways)) {
            return null;
        }

        try {
            $ways = json_decode($ways, true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        return is_array($ways) ? $ways : null;
    }

    /**
     * @param  list<array<string, mixed>>  $ways
     */
    private function storeWays(string $cacheKey, array $ways): void
    {
        $now = now();

        DB::table('road_corridor_caches')->upsert(
            [[
                'cache_key' => $cacheKey,
                'ways' => json_encode($ways, JSON_THROW_ON_ERROR),
                'fetched_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['cache_key'],
            ['ways', 'fetched_at', 'updated_at'],
        );
    }

    /**
     * @return array{
     *     cache_key: string,
     *     failure_key: string,
     *     latitude: float,
     *     longitude: float,
     *     query_radius_meters: int
     * }
     */
    private function cacheCell(float $latitude, float $longitude, int $radiusMeters): array
    {
        $gridMeters = max(
            $radiusMeters,
            25,
            (int) config('road-corridor.cache_grid_meters'),
        );
        $latitudeStep = $gridMeters / self::METERS_PER_LATITUDE_DEGREE;
        $latitudeCell = (int) floor(($latitude + 90) / $latitudeStep);
        $cellLatitude = min(90, -90 + (($latitudeCell + 0.5) * $latitudeStep));
        $longitudeMetersPerDegree = self::METERS_PER_LATITUDE_DEGREE
            * max(abs(cos(deg2rad($cellLatitude))), 0.01);
        $longitudeStep = $gridMeters / $longitudeMetersPerDegree;
        $normalizedLongitude = $this->normalizeLongitude($longitude);
        $longitudeCell = (int) floor(($normalizedLongitude + 180) / $longitudeStep);
        $cellLongitude = $this->normalizeLongitude(
            -180 + (($longitudeCell + 0.5) * $longitudeStep),
        );
        $cellCoverageMeters = (int) ceil(($gridMeters / sqrt(2)) * 1.02);
        $cacheKey = sprintf(
            'road-corridor:v7:%d:%d:%d:%d',
            $gridMeters,
            $latitudeCell,
            $longitudeCell,
            $radiusMeters,
        );

        return [
            'cache_key' => $cacheKey,
            'failure_key' => $cacheKey.':failed',
            'latitude' => $cellLatitude,
            'longitude' => $cellLongitude,
            'query_radius_meters' => $radiusMeters + $cellCoverageMeters,
        ];
    }

    private function normalizeLongitude(float $longitude): float
    {
        $normalizedLongitude = fmod($longitude + 180, 360);

        if ($normalizedLongitude < 0) {
            $normalizedLongitude += 360;
        }

        return $normalizedLongitude - 180;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetch(float $latitude, float $longitude, int $radiusMeters): array
    {
        try {
            $response = Http::asForm()
                ->accept('application/json')
                ->withUserAgent('DriversAgainstFlock/1.0 (+https://driversagainstflock.com)')
                ->connectTimeout((int) config('road-corridor.connect_timeout_seconds'))
                ->timeout((int) config('road-corridor.timeout_seconds'))
                ->post((string) config('road-corridor.overpass_url'), [
                    'data' => $this->buildQuery($latitude, $longitude, $radiusMeters),
                ]);
        } catch (ConnectionException) {
            throw DirectionsException::upstream('Road corridor could not be loaded.');
        }

        if (! $response->successful()) {
            throw DirectionsException::upstream('Road corridor could not be loaded.');
        }

        $payload = $response->json();

        if (
            ! is_array($payload)
            || ! is_array($payload['elements'] ?? null)
            || $this->stringValue($payload['remark'] ?? null) !== null
        ) {
            throw DirectionsException::upstream('Road corridor could not be loaded.');
        }

        $elements = $payload['elements'];
        $nodeCoordinates = $this->normalizeNodeCoordinates($elements);

        $ways = [];

        foreach ($elements as $element) {
            $way = $this->normalizeWay($element, $nodeCoordinates);

            if ($way === null) {
                continue;
            }

            $ways[$way['id']] = $way;
        }

        return array_values($ways);
    }

    private function buildQuery(float $latitude, float $longitude, int $radiusMeters): string
    {
        return sprintf(
            '[out:json][timeout:%d];way(around:%d,%F,%F)["highway"~"^(%s)$"];out body qt;>;out skel qt;',
            (int) config('road-corridor.overpass_timeout_seconds'),
            $radiusMeters,
            $latitude,
            $longitude,
            self::DRIVABLE_HIGHWAY_PATTERN,
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private function normalizeWay(mixed $element, array $nodeCoordinates): ?array
    {
        if (! is_array($element) || ($element['type'] ?? null) !== 'way' || ! is_numeric($element['id'] ?? null)) {
            return null;
        }

        $osmWayId = (int) $element['id'];

        if ($osmWayId <= 0) {
            return null;
        }

        $tags = is_array($element['tags'] ?? null) ? $element['tags'] : [];
        $roadClass = $this->stringValue($tags['highway'] ?? null);

        if (
            $roadClass === null
            || ! $this->isDrivableRoadClass($roadClass)
            || $this->hasRestrictedAccess($tags)
            || $this->isTruthyOsmValue($tags['area'] ?? null)
        ) {
            return null;
        }

        $geometry = $this->normalizeGeometry($element['nodes'] ?? null, $nodeCoordinates);

        if ($geometry === null) {
            return null;
        }

        $direction = $this->direction($tags, $roadClass);
        $taggedMaxspeed = $this->scalarValue($tags['maxspeed:motorcar'] ?? $tags['maxspeed'] ?? null);
        $maxspeedForward = $this->scalarValue(
            $tags['maxspeed:motorcar:forward']
                ?? $tags['maxspeed:forward']
                ?? $taggedMaxspeed,
        );
        $maxspeedBackward = $this->scalarValue(
            $tags['maxspeed:motorcar:backward']
                ?? $tags['maxspeed:backward']
                ?? $taggedMaxspeed,
        );
        $maxspeed = match ($direction) {
            'forward' => $maxspeedForward,
            'backward' => $maxspeedBackward,
            default => $taggedMaxspeed,
        };
        $speedLimitMph = $this->maxspeedParser->toMph($maxspeed);

        return [
            'id' => 'osm-way-'.$osmWayId,
            'osm_way_id' => $osmWayId,
            'coordinates' => $geometry['coordinates'],
            'node_ids' => $geometry['node_ids'],
            'direction' => $direction,
            'name' => $this->stringValue($tags['name'] ?? null),
            'ref' => $this->stringValue($tags['ref'] ?? null),
            'road_class' => $roadClass,
            'tunnel' => $this->isTruthyOsmValue($tags['tunnel'] ?? null),
            'layer' => $this->layer($tags['layer'] ?? null),
            'maxspeed' => $maxspeed,
            'speed_limit_mph' => $speedLimitMph,
            'maxspeed_forward' => $maxspeedForward,
            'speed_limit_forward_mph' => $this->maxspeedParser->toMph($maxspeedForward),
            'maxspeed_backward' => $maxspeedBackward,
            'speed_limit_backward_mph' => $this->maxspeedParser->toMph($maxspeedBackward),
        ];
    }

    /**
     * @param  array<string, mixed>  $tags
     */
    private function hasRestrictedAccess(array $tags): bool
    {
        foreach (self::MOTORCAR_ACCESS_KEYS as $key) {
            $value = strtolower(trim((string) ($tags[$key] ?? '')));

            if ($value !== '') {
                return in_array($value, self::RESTRICTED_ACCESS_VALUES, true);
            }
        }

        return false;
    }

    private function isDrivableRoadClass(string $roadClass): bool
    {
        return in_array($roadClass, explode('|', self::DRIVABLE_HIGHWAY_PATTERN), true);
    }

    /**
     * @param  array<string, mixed>  $tags
     */
    private function direction(array $tags, string $roadClass): string
    {
        $oneway = '';

        foreach (self::MOTORCAR_ONEWAY_KEYS as $key) {
            $oneway = strtolower(trim((string) ($tags[$key] ?? '')));

            if ($oneway !== '') {
                break;
            }
        }

        if (in_array($oneway, ['-1', 'reverse'], true)) {
            return 'backward';
        }

        if (in_array($oneway, ['yes', 'true', '1'], true)) {
            return 'forward';
        }

        if (in_array($oneway, ['no', 'false', '0'], true)) {
            return 'both';
        }

        $junction = strtolower(trim((string) ($tags['junction'] ?? '')));

        if ($junction === 'roundabout' || in_array($roadClass, ['motorway', 'motorway_link'], true)) {
            return 'forward';
        }

        return 'both';
    }

    /**
     * @return array{coordinates: list<array{0: float, 1: float}>, node_ids: list<int>}|null
     */
    private function normalizeGeometry(mixed $nodes, array $nodeCoordinates): ?array
    {
        if (! is_array($nodes) || count($nodes) < 2) {
            return null;
        }

        $coordinates = [];
        $nodeIds = [];

        foreach ($nodes as $node) {
            $nodeId = filter_var($node, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1],
            ]);

            if ($nodeId === false || ! array_key_exists($nodeId, $nodeCoordinates)) {
                return null;
            }

            $coordinate = $nodeCoordinates[$nodeId];

            if ($coordinates !== [] && $coordinates[array_key_last($coordinates)] === $coordinate) {
                if ($nodeIds[array_key_last($nodeIds)] === $nodeId) {
                    continue;
                }

                return null;
            }

            $coordinates[] = $coordinate;
            $nodeIds[] = $nodeId;
        }

        if (count($coordinates) < 2) {
            return null;
        }

        return [
            'coordinates' => $coordinates,
            'node_ids' => $nodeIds,
        ];
    }

    /**
     * @param  list<mixed>  $elements
     * @return array<int, array{0: float, 1: float}>
     */
    private function normalizeNodeCoordinates(array $elements): array
    {
        $invalidNodeIds = [];
        $nodeCoordinates = [];

        foreach ($elements as $element) {
            if (
                ! is_array($element)
                || ($element['type'] ?? null) !== 'node'
                || ! is_numeric($element['lat'] ?? null)
                || ! is_numeric($element['lon'] ?? null)
            ) {
                continue;
            }

            $nodeId = filter_var($element['id'] ?? null, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1],
            ]);
            $latitude = (float) $element['lat'];
            $longitude = (float) $element['lon'];

            if (
                $nodeId === false
                || ! is_finite($latitude)
                || ! is_finite($longitude)
                || $latitude < -90
                || $latitude > 90
                || $longitude < -180
                || $longitude > 180
                || isset($invalidNodeIds[$nodeId])
            ) {
                continue;
            }

            $coordinate = [$longitude, $latitude];

            if (
                array_key_exists($nodeId, $nodeCoordinates)
                && $nodeCoordinates[$nodeId] !== $coordinate
            ) {
                unset($nodeCoordinates[$nodeId]);
                $invalidNodeIds[$nodeId] = true;

                continue;
            }

            $nodeCoordinates[$nodeId] = $coordinate;
        }

        return $nodeCoordinates;
    }

    private function isTruthyOsmValue(mixed $value): bool
    {
        $value = strtolower(trim((string) $value));

        return $value !== '' && ! in_array($value, ['no', 'false', '0'], true);
    }

    private function layer(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private function stringValue(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private function scalarValue(mixed $value): string|int|float|null
    {
        return is_string($value) || is_int($value) || is_float($value) ? $value : null;
    }
}
