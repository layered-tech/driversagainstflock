<?php

namespace App\Services\Directions;

class PointOfInterest
{
    /**
     * @param  array<int, DirectionRange|null>  $directions
     * @param  array<string, mixed>  $tags
     */
    public function __construct(
        public readonly string|int|null $id,
        public readonly float $longitude,
        public readonly float $latitude,
        public readonly array $directions,
        public readonly array $tags = [],
    ) {}
}
