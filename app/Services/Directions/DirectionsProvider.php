<?php

namespace App\Services\Directions;

interface DirectionsProvider
{
    public function name(): string;

    /**
     * @param  array<int, array{longitude: float, latitude: float}>  $coordinates
     * @param  array{type: string, coordinates: array<int, mixed>}  $exclusionZone
     * @return array{coordinates: array<int, array<int, float>>, distance: float|null, duration: float|null, maneuvers: array<int, array<string, mixed>>}
     */
    public function route(array $coordinates, array $exclusionZone, bool $continueStraight = true): array;
}
