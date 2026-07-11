<?php

namespace App\Services\Directions;

interface RouteAwarePoiSource extends PoiSource
{
    /**
     * @param  array<int, array<int, float>>  $coordinates
     * @param  array<int, array<string, mixed>>  $profiles
     */
    public function countAlongRoute(array $coordinates, float $bufferMeters, array $profiles): int;
}
