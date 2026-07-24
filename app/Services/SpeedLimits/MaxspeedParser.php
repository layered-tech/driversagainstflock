<?php

namespace App\Services\SpeedLimits;

class MaxspeedParser
{
    public function toMph(mixed $maxspeed): ?int
    {
        if (! is_string($maxspeed) && ! is_numeric($maxspeed)) {
            return null;
        }

        $value = strtolower(trim((string) $maxspeed));

        if ($value === '' || preg_match('/^(none|signals|variable|walk)$/', $value)) {
            return null;
        }

        if (preg_match('/[;|]/', $value)) {
            return null;
        }

        if (preg_match('/^(\d+(?:\.\d+)?)\s*mph$/', $value, $matches)) {
            if ((float) $matches[1] <= 0) {
                return null;
            }

            return max(1, (int) round((float) $matches[1]));
        }

        if (preg_match('/^(\d+(?:\.\d+)?)\s*(?:km\/h|kph|kmh)$/', $value, $matches)) {
            if ((float) $matches[1] <= 0) {
                return null;
            }

            return max(1, (int) round((float) $matches[1] / 1.609344));
        }

        if (preg_match('/^\d+(?:\.\d+)?$/', $value)) {
            if ((float) $value <= 0) {
                return null;
            }

            return max(1, (int) round((float) $value / 1.609344));
        }

        return null;
    }
}
