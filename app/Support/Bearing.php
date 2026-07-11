<?php

namespace App\Support;

class Bearing
{
    public static function normalize(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (! is_numeric($value)) {
            return null;
        }

        $bearing = (float) $value;

        if (! is_finite($bearing) || $bearing < -360 || $bearing > 360) {
            return null;
        }

        $bearing = (int) $bearing;

        if ($bearing < 0) {
            $bearing += 360;
        }

        if ($bearing === 360) {
            return 0;
        }

        return $bearing;
    }
}
