<?php

namespace App\Services\Directions;

use Illuminate\Support\Facades\DB;
use Throwable;

class GeometryService
{
    private const EARTH_RADIUS_METERS = 6371008.8;

    /**
     * @param  array{longitude: float, latitude: float}  $start
     * @param  array{longitude: float, latitude: float}  $end
     */
    public function distanceMeters(array $start, array $end): float
    {
        $lat1 = deg2rad($start['latitude']);
        $lat2 = deg2rad($end['latitude']);
        $deltaLat = deg2rad($end['latitude'] - $start['latitude']);
        $deltaLon = deg2rad($end['longitude'] - $start['longitude']);

        $a = sin($deltaLat / 2) ** 2
            + cos($lat1) * cos($lat2) * sin($deltaLon / 2) ** 2;

        return 2 * self::EARTH_RADIUS_METERS * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * @param  array<int, array{longitude: float, latitude: float}>  $coordinates
     */
    public function routeDistanceMeters(array $coordinates): float
    {
        $distance = 0.0;

        for ($index = 1; $index < count($coordinates); $index++) {
            $distance += $this->distanceMeters($coordinates[$index - 1], $coordinates[$index]);
        }

        return $distance;
    }

    /**
     * @param  array{longitude: float, latitude: float}  $start
     * @param  array{longitude: float, latitude: float}  $end
     * @return array{west: float, south: float, east: float, north: float}
     */
    public function searchBounds(array $start, array $end, float $paddingMeters): array
    {
        $averageLatitude = ($start['latitude'] + $end['latitude']) / 2;
        $latitudePadding = $paddingMeters / 111320;
        $longitudePadding = $paddingMeters / max(1, 111320 * cos(deg2rad($averageLatitude)));

        return [
            'west' => max(-180, min($start['longitude'], $end['longitude']) - $longitudePadding),
            'south' => max(-90, min($start['latitude'], $end['latitude']) - $latitudePadding),
            'east' => min(180, max($start['longitude'], $end['longitude']) + $longitudePadding),
            'north' => min(90, max($start['latitude'], $end['latitude']) + $latitudePadding),
        ];
    }

    /**
     * @param  array<int, array{longitude: float, latitude: float}>  $coordinates
     * @return array{west: float, south: float, east: float, north: float}
     */
    public function searchBoundsForCoordinates(array $coordinates, float $paddingMeters): array
    {
        if (count($coordinates) < 2) {
            return $this->searchBounds($coordinates[0], $coordinates[0], $paddingMeters);
        }

        $averageLatitude = array_sum(array_column($coordinates, 'latitude')) / count($coordinates);
        $latitudePadding = $paddingMeters / 111320;
        $longitudePadding = $paddingMeters / max(1, 111320 * cos(deg2rad($averageLatitude)));

        return [
            'west' => max(-180, min(array_column($coordinates, 'longitude')) - $longitudePadding),
            'south' => max(-90, min(array_column($coordinates, 'latitude')) - $latitudePadding),
            'east' => min(180, max(array_column($coordinates, 'longitude')) + $longitudePadding),
            'north' => min(90, max(array_column($coordinates, 'latitude')) + $latitudePadding),
        ];
    }

    /**
     * @param  array<int, PointOfInterest>  $pois
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    public function exclusionZone(array $pois, float $avoidBufferMeters, float $coneAngleDegrees, int $coneSegments): array
    {
        $polygons = [];

        foreach ($pois as $poi) {
            foreach ($poi->directions ?: [null] as $direction) {
                $polygons[] = $direction instanceof DirectionRange
                    ? [$this->coneRing($poi, $direction, $avoidBufferMeters, $coneAngleDegrees, $coneSegments)]
                    : [$this->circleRing($poi->longitude, $poi->latitude, $avoidBufferMeters)];
            }
        }

        return [
            'type' => 'MultiPolygon',
            'coordinates' => $polygons,
        ];
    }

    /**
     * @param  array{longitude: float, latitude: float}  $start
     * @param  array{longitude: float, latitude: float}  $end
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    public function endpointBufferZone(array $start, array $end, float $clearanceMeters): array
    {
        return $this->waypointBufferZone([$start, $end], $clearanceMeters);
    }

    /**
     * @param  array<int, array{longitude: float, latitude: float}>  $coordinates
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    public function waypointBufferZone(array $coordinates, float $clearanceMeters): array
    {
        return [
            'type' => 'MultiPolygon',
            'coordinates' => array_map(
                fn (array $coordinate): array => [$this->circleRing($coordinate['longitude'], $coordinate['latitude'], $clearanceMeters)],
                $coordinates,
            ),
        ];
    }

    /**
     * @param  array{type: string, coordinates: array<int, mixed>}  $geometry
     * @param  array{longitude: float, latitude: float}  $start
     * @param  array{longitude: float, latitude: float}  $end
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    public function clearEndpointBuffers(array $geometry, array $start, array $end, float $clearanceMeters): array
    {
        return $this->clearWaypointBuffers($geometry, [$start, $end], $clearanceMeters);
    }

    /**
     * @param  array{type: string, coordinates: array<int, mixed>}  $geometry
     * @param  array<int, array{longitude: float, latitude: float}>  $coordinates
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    public function clearWaypointBuffers(array $geometry, array $coordinates, float $clearanceMeters): array
    {
        if (($geometry['coordinates'] ?? []) === []) {
            return $geometry;
        }

        try {
            $clearBufferSql = implode(
                ', ',
                array_fill(
                    0,
                    count($coordinates),
                    'ST_Buffer(ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)::geometry',
                ),
            );
            $bindings = [json_encode($geometry)];

            foreach ($coordinates as $coordinate) {
                $bindings[] = $coordinate['longitude'];
                $bindings[] = $coordinate['latitude'];
                $bindings[] = $clearanceMeters;
            }

            $row = DB::selectOne(
                <<<SQL
                WITH zone AS (
                    SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)) AS geom
                ),
                clear_zone AS (
                    SELECT ST_Union(ARRAY[{$clearBufferSql}]) AS geom
                )
                SELECT ST_AsGeoJSON(
                    ST_Multi(
                        ST_CollectionExtract(
                            ST_Difference(zone.geom, clear_zone.geom),
                            3
                        )
                    )
                ) AS geojson
                FROM zone, clear_zone
                SQL,
                $bindings,
            );

            $cleared = json_decode($row->geojson ?? '', true);

            if (is_array($cleared)) {
                return $this->normalizeToMultiPolygon($cleared);
            }
        } catch (Throwable) {
            // A conservative fallback keeps routing available if PostGIS geometry
            // difference is unavailable in a local/test database.
        }

        return $this->removeWaypointBufferIntersectingPolygons($geometry, $coordinates, $clearanceMeters);
    }

    /**
     * @param  array<int, array<int, float>>  $coordinates
     * @param  array{west: float, south: float, east: float, north: float}  $bounds
     */
    public function routeInsideBounds(array $coordinates, array $bounds): bool
    {
        foreach ($coordinates as $coordinate) {
            if (count($coordinate) < 2) {
                return false;
            }

            $longitude = (float) $coordinate[0];
            $latitude = (float) $coordinate[1];

            if ($latitude < $bounds['south'] || $latitude > $bounds['north']) {
                return false;
            }

            if ($bounds['west'] <= $bounds['east']) {
                if ($longitude < $bounds['west'] || $longitude > $bounds['east']) {
                    return false;
                }
            } elseif ($longitude < $bounds['west'] && $longitude > $bounds['east']) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<int, PointOfInterest>  $pois
     * @param  array<int, array<int, float>>  $coordinates
     */
    public function countPoisAlongRoute(array $pois, array $coordinates, float $bufferMeters): int
    {
        $seen = [];

        foreach ($pois as $index => $poi) {
            if (! $this->poiIsNearRoute($poi, $coordinates, $bufferMeters)) {
                continue;
            }

            $key = $poi->id === null
                ? sprintf('coord:%0.7f,%0.7f,%d', $poi->longitude, $poi->latitude, $index)
                : sprintf('id:%s', (string) $poi->id);

            $seen[$key] = true;
        }

        return count($seen);
    }

    /**
     * @return array<int, array<int, float>>
     */
    private function coneRing(PointOfInterest $poi, DirectionRange $direction, float $distanceMeters, float $coneAngleDegrees, int $segments): array
    {
        if ($direction->isRange) {
            $start = $direction->start;
            $end = $direction->end < $direction->start ? $direction->end + 360 : $direction->end;
        } else {
            $halfCone = $coneAngleDegrees / 2;
            $start = $direction->start - $halfCone;
            $end = $direction->start + $halfCone;
        }

        $segments = max(1, $segments);
        $ring = [[$poi->longitude, $poi->latitude]];

        for ($index = 0; $index <= $segments; $index++) {
            $bearing = $start + (($end - $start) * ($index / $segments));
            $ring[] = $this->destinationPoint($poi->longitude, $poi->latitude, $distanceMeters, $bearing);
        }

        $ring[] = [$poi->longitude, $poi->latitude];

        return $ring;
    }

    /**
     * @return array<int, array<int, float>>
     */
    private function circleRing(float $longitude, float $latitude, float $radiusMeters): array
    {
        $ring = [];

        for ($bearing = 0; $bearing < 360; $bearing += 360 / 32) {
            $ring[] = $this->destinationPoint($longitude, $latitude, $radiusMeters, $bearing);
        }

        $ring[] = $ring[0];

        return $ring;
    }

    /**
     * @return array{0: float, 1: float}
     */
    private function destinationPoint(float $longitude, float $latitude, float $distanceMeters, float $bearingDegrees): array
    {
        $angularDistance = $distanceMeters / self::EARTH_RADIUS_METERS;
        $bearing = deg2rad($bearingDegrees);
        $lat1 = deg2rad($latitude);
        $lon1 = deg2rad($longitude);

        $lat2 = asin(sin($lat1) * cos($angularDistance) + cos($lat1) * sin($angularDistance) * cos($bearing));
        $lon2 = $lon1 + atan2(
            sin($bearing) * sin($angularDistance) * cos($lat1),
            cos($angularDistance) - sin($lat1) * sin($lat2)
        );

        return [$this->normalizeLongitude(rad2deg($lon2)), rad2deg($lat2)];
    }

    private function normalizeLongitude(float $longitude): float
    {
        $longitude = fmod($longitude + 540, 360);

        return $longitude - 180;
    }

    /**
     * @param  array<int, array<int, float>>  $ring
     */
    private function pointInRing(float $longitude, float $latitude, array $ring): bool
    {
        $inside = false;
        $count = count($ring);

        for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
            $xi = (float) ($ring[$i][0] ?? 0);
            $yi = (float) ($ring[$i][1] ?? 0);
            $xj = (float) ($ring[$j][0] ?? 0);
            $yj = (float) ($ring[$j][1] ?? 0);

            $intersects = (($yi > $latitude) !== ($yj > $latitude))
                && ($longitude < ($xj - $xi) * ($latitude - $yi) / (($yj - $yi) ?: 1e-12) + $xi);

            if ($intersects) {
                $inside = ! $inside;
            }
        }

        return $inside;
    }

    /**
     * @param  array{type: string, coordinates: array<int, mixed>}  $geometry
     * @param  array<int, array{longitude: float, latitude: float}>  $coordinates
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    private function removeWaypointBufferIntersectingPolygons(array $geometry, array $coordinates, float $clearanceMeters): array
    {
        $polygons = array_values(array_filter(
            $geometry['coordinates'] ?? [],
            fn (array $polygon) => ! collect($coordinates)
                ->contains(fn (array $coordinate): bool => $this->polygonIntersectsEndpointBuffer($polygon, $coordinate, $clearanceMeters))
        ));

        return ['type' => 'MultiPolygon', 'coordinates' => $polygons];
    }

    /**
     * @param  array<int, array<int, array<int, float>>>  $polygon
     * @param  array{longitude: float, latitude: float}  $endpoint
     */
    private function polygonIntersectsEndpointBuffer(array $polygon, array $endpoint, float $clearanceMeters): bool
    {
        $outerRing = $polygon[0] ?? [];

        if ($this->pointInRing($endpoint['longitude'], $endpoint['latitude'], $outerRing)) {
            return true;
        }

        for ($index = 1; $index < count($outerRing); $index++) {
            if (
                $this->pointToSegmentDistanceMeters(
                    $endpoint['longitude'],
                    $endpoint['latitude'],
                    (float) ($outerRing[$index - 1][0] ?? 0),
                    (float) ($outerRing[$index - 1][1] ?? 0),
                    (float) ($outerRing[$index][0] ?? 0),
                    (float) ($outerRing[$index][1] ?? 0),
                ) <= $clearanceMeters
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $geometry
     * @return array{type: string, coordinates: array<int, mixed>}
     */
    private function normalizeToMultiPolygon(array $geometry): array
    {
        return match ($geometry['type'] ?? null) {
            'Polygon' => ['type' => 'MultiPolygon', 'coordinates' => [$geometry['coordinates'] ?? []]],
            'MultiPolygon' => ['type' => 'MultiPolygon', 'coordinates' => $geometry['coordinates'] ?? []],
            default => ['type' => 'MultiPolygon', 'coordinates' => []],
        };
    }

    /**
     * @param  array<int, array<int, float>>  $coordinates
     */
    private function poiIsNearRoute(PointOfInterest $poi, array $coordinates, float $bufferMeters): bool
    {
        if (count($coordinates) < 2) {
            return false;
        }

        for ($index = 1; $index < count($coordinates); $index++) {
            if (
                $this->pointToSegmentDistanceMeters(
                    $poi->longitude,
                    $poi->latitude,
                    (float) ($coordinates[$index - 1][0] ?? 0),
                    (float) ($coordinates[$index - 1][1] ?? 0),
                    (float) ($coordinates[$index][0] ?? 0),
                    (float) ($coordinates[$index][1] ?? 0),
                ) <= $bufferMeters
            ) {
                return true;
            }
        }

        return false;
    }

    private function pointToSegmentDistanceMeters(
        float $longitude,
        float $latitude,
        float $startLongitude,
        float $startLatitude,
        float $endLongitude,
        float $endLatitude,
    ): float {
        $averageLatitude = deg2rad(($latitude + $startLatitude + $endLatitude) / 3);
        $metersPerDegreeLongitude = max(1.0, 111320 * cos($averageLatitude));
        $px = $longitude * $metersPerDegreeLongitude;
        $py = $latitude * 111320;
        $ax = $startLongitude * $metersPerDegreeLongitude;
        $ay = $startLatitude * 111320;
        $bx = $endLongitude * $metersPerDegreeLongitude;
        $by = $endLatitude * 111320;
        $dx = $bx - $ax;
        $dy = $by - $ay;

        if (abs($dx) < 1e-9 && abs($dy) < 1e-9) {
            return hypot($px - $ax, $py - $ay);
        }

        $projection = (($px - $ax) * $dx + ($py - $ay) * $dy) / ($dx * $dx + $dy * $dy);
        $projection = max(0, min(1, $projection));
        $closestX = $ax + $projection * $dx;
        $closestY = $ay + $projection * $dy;

        return hypot($px - $closestX, $py - $closestY);
    }
}
