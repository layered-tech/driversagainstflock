<?php

namespace App\Services\Roads;

use App\Services\Directions\DirectionsException;
use App\Services\SpeedLimits\MaxspeedParser;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class OpenStreetMapRoadGraphLookup
{
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
        $cacheKey = sprintf(
            'road-corridor:%0.5f:%0.5f:%d',
            round($latitude, 5),
            round($longitude, 5),
            $radiusMeters,
        );

        return Cache::remember(
            $cacheKey,
            now()->addSeconds((int) config('road-corridor.cache_seconds')),
            fn () => $this->fetch($latitude, $longitude, $radiusMeters),
        );
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
                ->retry(2, 150, $this->shouldRetry(...), throw: false)
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

        $ways = [];

        foreach ($elements as $element) {
            $way = $this->normalizeWay($element);

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
            '[out:json][timeout:%d];way(around:%d,%F,%F)["highway"~"^(%s)$"];out body geom;',
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
    private function normalizeWay(mixed $element): ?array
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

        $geometry = $this->normalizeGeometry(
            $element['geometry'] ?? null,
            $element['nodes'] ?? null,
        );

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

    private function shouldRetry(Throwable $exception): bool
    {
        return $exception instanceof ConnectionException
            || ($exception instanceof RequestException && $exception->response->serverError());
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
    private function normalizeGeometry(mixed $geometry, mixed $nodes): ?array
    {
        if (
            ! is_array($geometry)
            || ! is_array($nodes)
            || count($geometry) !== count($nodes)
            || count($geometry) < 2
        ) {
            return null;
        }

        $coordinates = [];
        $nodeIds = [];

        foreach ($geometry as $index => $point) {
            if (
                ! is_array($point)
                || ! is_numeric($point['lat'] ?? null)
                || ! is_numeric($point['lon'] ?? null)
            ) {
                return null;
            }

            $nodeId = filter_var($nodes[$index] ?? null, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1],
            ]);
            $latitude = (float) $point['lat'];
            $longitude = (float) $point['lon'];

            if (
                $nodeId === false
                || $latitude < -90
                || $latitude > 90
                || $longitude < -180
                || $longitude > 180
            ) {
                return null;
            }

            $coordinate = [$longitude, $latitude];

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
