<?php

namespace App\Services\Directions;

class DirectionRange
{
    public function __construct(
        public readonly float $start,
        public readonly float $end,
        public readonly bool $isRange = false,
    ) {}
}
