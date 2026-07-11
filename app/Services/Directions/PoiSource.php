<?php

namespace App\Services\Directions;

interface PoiSource
{
    /**
     * @param  array{west: float, south: float, east: float, north: float}  $bounds
     * @param  array<int, array<string, mixed>>  $profiles
     * @return array<int, PointOfInterest>
     */
    public function find(array $bounds, array $profiles): array;
}
