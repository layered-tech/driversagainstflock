<?php

namespace App\Services\Directions;

interface RouteAwarePoiSource extends PoiSource
{
    /**
     * @param  array<int, array<int, float>>  $coordinates
     * @param  array<int, array<string, mixed>>  $profiles
     * @return array<int, PointOfInterest>
     */
    public function findAlongRoute(array $coordinates, float $bufferMeters, array $profiles): array;
}
