<?php

namespace App\Services\OpenStreetMap;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class ModerationRoadLookup
{
    public function nearest(float $latitude, float $longitude, float $distance, array $types): array
    {
        sort($types);
        $size = 0.02;
        $south = floor($latitude / $size) * $size;
        $west = floor($longitude / $size) * $size;
        $latMargin = $distance / 110000;
        $lonMargin = $latMargin / max(0.01, cos(deg2rad(max(abs($south), abs($south + $size)))));
        $bounds = [$south - $latMargin, $west - $lonMargin, $south + $size + $latMargin, $west + $size + $lonMargin];
        if ($bounds[0] < -90 || $bounds[2] > 90 || $bounds[1] < -180 || $bounds[3] > 180) {
            throw new RuntimeException('Road coverage crosses the supported geographic boundary.');
        }
        $key = 'moderation:roads:v1:'.hash('sha256', json_encode([$bounds, $types], JSON_THROW_ON_ERROR));
        $roads = Cache::remember($key, (int) config('moderation.roads.cache_seconds', 86400), function () use ($key, $bounds, $types): array {
            return Cache::lock($key.':fetch', 40)->block(5, function () use ($key, $bounds, $types): array {
                if (is_array($cached = Cache::get($key))) {
                    return $cached;
                }
                if (! Cache::add('moderation:overpass-rate', true, 1)) {
                    throw new RuntimeException('Road lookup rate limit reached; evaluation will retry.');
                }
                $filter = implode('|', $types);
                $query = '[out:json][timeout:20];way('.implode(',', $bounds).')["highway"~"^('.$filter.')$"];out tags geom;';
                $response = Http::asForm()->acceptJson()->withUserAgent('DriversAgainstFlock moderation')->connectTimeout(3)->timeout(25)
                    ->post(config('directions.overpass_url'), ['data' => $query])->throw()->json();
                if (! is_array($response) || ! isset($response['elements']) || ! is_array($response['elements']) || isset($response['remark']) || count($response['elements']) > 10000) {
                    throw new RuntimeException('Road lookup returned incomplete coverage.');
                }
                $roads = [];
                foreach ($response['elements'] as $way) {
                    if (($way['type'] ?? null) !== 'way' || ! isset($way['id'], $way['geometry']) || count($way['geometry']) < 2) {
                        throw new RuntimeException('Road lookup returned incomplete geometry.');
                    }
                    $points = [];
                    foreach ($way['geometry'] as $point) {
                        if (! isset($point['lon'], $point['lat']) || ! is_numeric($point['lon']) || ! is_numeric($point['lat']) || abs((float) $point['lat']) > 90 || abs((float) $point['lon']) > 180) {
                            throw new RuntimeException('Road lookup returned invalid coordinates.');
                        }
                        $points[] = [(float) $point['lon'], (float) $point['lat']];
                    }
                    $roads[] = ['id' => $way['id'], 'geometry' => ['type' => 'LineString', 'coordinates' => $points]];
                }
                Cache::put($key, $roads, (int) config('moderation.roads.cache_seconds', 86400));

                return $roads;
            });
        });
        if ($roads === []) {
            return ['road_id' => null, 'distance_meters' => null, 'coverage_meters' => $distance];
        }
        $closest = DB::selectOne('SELECT road.id, ST_Distance(ST_SetSRID(ST_GeomFromGeoJSON(road.geometry::text),4326)::geography, ST_SetSRID(ST_MakePoint(?,?),4326)::geography) as distance FROM jsonb_to_recordset(?::jsonb) as road(id bigint, geometry jsonb) ORDER BY distance LIMIT 1', [$longitude, $latitude, json_encode($roads, JSON_THROW_ON_ERROR)]);

        return ['road_id' => $closest->id, 'distance_meters' => (float) $closest->distance, 'coverage_meters' => $distance];
    }
}
