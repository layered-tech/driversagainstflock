<?php

namespace App\Services\Directions;

class PoiSourceFactory
{
    public function __construct(
        private readonly DatabasePoiSource $databasePoiSource,
        private readonly OverpassPoiSource $overpassPoiSource,
    ) {}

    public function make(?string $backend = null): PoiSource
    {
        return match ($backend ?? config('directions.poi_backend')) {
            'overpass' => $this->overpassPoiSource,
            default => $this->databasePoiSource,
        };
    }
}
