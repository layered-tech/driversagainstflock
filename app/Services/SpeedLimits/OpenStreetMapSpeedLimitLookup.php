<?php

namespace App\Services\SpeedLimits;

use App\Services\Directions\DirectionsException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class OpenStreetMapSpeedLimitLookup
{
    private const METERS_PER_DEGREE_LATITUDE = 111320.0;

    public function __construct(private readonly MaxspeedParser $maxspeedParser) {}

    /**
     * @return array<string, mixed>|null
     */
    public function find(float $latitude, float $longitude): ?array
    {
        $cacheKey = sprintf(
            'speed-limit:%0.4f:%0.4f',
            round($latitude, 4),
            round($longitude, 4),
        );

        return Cache::remember(
            $cacheKey,
            now()->addSeconds((int) config('directions.speed_limit_cache_seconds')),
            fn () => $this->fetch($latitude, $longitude),
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetch(float $latitude, float $longitude): ?array
    {
        $response = Http::asForm()
            ->accept('application/json')
            ->withUserAgent('DriversAgainstFlock/1.0 (+https://driversagainstflock.com)')
            ->timeout(10)
            ->retry(1, 150, throw: false)
            ->post(config('directions.overpass_url'), [
                'data' => $this->buildQuery($latitude, $longitude),
            ]);

        if (! $response->successful()) {
            throw DirectionsException::upstream('Speed limit could not be loaded.');
        }

        $closestWay = null;
        $radius = (float) config('directions.speed_limit_radius_meters');

        foreach ($response->json('elements', []) as $element) {
            if (($element['type'] ?? null) !== 'way') {
                continue;
            }

            $maxspeed = $element['tags']['maxspeed'] ?? null;
            $speedLimitMph = $this->maxspeedParser->toMph($maxspeed);

            if ($speedLimitMph === null) {
                continue;
            }

            $distance = $this->distanceToGeometryMeters(
                $latitude,
                $longitude,
                $element['geometry'] ?? [],
            );

            if ($distance === null || $distance > $radius) {
                continue;
            }

            if ($closestWay === null || $distance < $closestWay['distance_meters']) {
                $closestWay = [
                    'distance_meters' => $distance,
                    'maxspeed' => $maxspeed,
                    'osm_way_id' => $element['id'] ?? null,
                    'speed_limit_mph' => $speedLimitMph,
                    'unit' => 'mph',
                ];
            }
        }

        if ($closestWay === null) {
            return null;
        }

        $closestWay['distance_meters'] = round($closestWay['distance_meters'], 1);

        return $closestWay;
    }

    private function buildQuery(float $latitude, float $longitude): string
    {
        return sprintf(
            '[out:json][timeout:8];way(around:%d,%F,%F)["highway"]["maxspeed"];out tags geom;',
            (int) config('directions.speed_limit_radius_meters'),
            $latitude,
            $longitude,
        );
    }

    private function distanceToGeometryMeters(float $latitude, float $longitude, mixed $geometry): ?float
    {
        if (! is_array($geometry) || count($geometry) < 2) {
            return null;
        }

        $closestDistance = null;

        for ($index = 0; $index < count($geometry) - 1; $index++) {
            $segmentDistance = $this->distanceToSegmentMeters(
                $latitude,
                $longitude,
                $geometry[$index],
                $geometry[$index + 1],
            );

            if ($segmentDistance === null) {
                continue;
            }

            if ($closestDistance === null || $segmentDistance < $closestDistance) {
                $closestDistance = $segmentDistance;
            }
        }

        return $closestDistance;
    }

    /**
     * @param  array<string, mixed>  $start
     * @param  array<string, mixed>  $end
     */
    private function distanceToSegmentMeters(
        float $latitude,
        float $longitude,
        array $start,
        array $end,
    ): ?float {
        if (
            ! is_numeric($start['lat'] ?? null) ||
            ! is_numeric($start['lon'] ?? null) ||
            ! is_numeric($end['lat'] ?? null) ||
            ! is_numeric($end['lon'] ?? null)
        ) {
            return null;
        }

        $originLatitudeRadians = (($latitude + (float) $start['lat'] + (float) $end['lat']) / 3) * (M_PI / 180);
        $metersPerDegreeLongitude = self::METERS_PER_DEGREE_LATITUDE * cos($originLatitudeRadians);
        $endX = (((float) $end['lon'] - (float) $start['lon']) * $metersPerDegreeLongitude);
        $endY = (((float) $end['lat'] - (float) $start['lat']) * self::METERS_PER_DEGREE_LATITUDE);
        $pointX = (($longitude - (float) $start['lon']) * $metersPerDegreeLongitude);
        $pointY = (($latitude - (float) $start['lat']) * self::METERS_PER_DEGREE_LATITUDE);
        $segmentLengthSquared = ($endX ** 2) + ($endY ** 2);

        if ($segmentLengthSquared < 0.000001) {
            return sqrt($pointX ** 2 + $pointY ** 2);
        }

        $segmentFraction = max(0, min(1, (($pointX * $endX) + ($pointY * $endY)) / $segmentLengthSquared));
        $projectedX = $endX * $segmentFraction;
        $projectedY = $endY * $segmentFraction;

        return sqrt(($pointX - $projectedX) ** 2 + ($pointY - $projectedY) ** 2);
    }
}
