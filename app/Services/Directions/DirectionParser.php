<?php

namespace App\Services\Directions;

class DirectionParser
{
    private const NAMED_DIRECTIONS = [
        'n' => 0.0,
        'nne' => 22.5,
        'ne' => 45.0,
        'ene' => 67.5,
        'e' => 90.0,
        'ese' => 112.5,
        'se' => 135.0,
        'sse' => 157.5,
        's' => 180.0,
        'ssw' => 202.5,
        'sw' => 225.0,
        'wsw' => 247.5,
        'w' => 270.0,
        'wnw' => 292.5,
        'nw' => 315.0,
        'nnw' => 337.5,
        'north' => 0.0,
        'northeast' => 45.0,
        'east' => 90.0,
        'southeast' => 135.0,
        'south' => 180.0,
        'southwest' => 225.0,
        'west' => 270.0,
        'northwest' => 315.0,
        'nb' => 0.0,
        'eb' => 90.0,
        'sb' => 180.0,
        'wb' => 270.0,
    ];

    /**
     * @return array<int, DirectionRange|null>
     */
    public function parseMany(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [null];
        }

        return collect(explode(';', (string) $value))
            ->map(fn (string $direction) => $this->parse($direction))
            ->values()
            ->all();
    }

    public function parse(string $value): ?DirectionRange
    {
        $value = trim($value);

        if ($value === '') {
            return null;
        }

        if ($this->looksLikeRange($value)) {
            $parts = explode('-', $value);

            if (count($parts) !== 2) {
                return null;
            }

            $start = $this->parseAngle($parts[0]);
            $end = $this->parseAngle($parts[1]);

            if ($start === null || $end === null) {
                return null;
            }

            return new DirectionRange($start, $end, true);
        }

        $angle = $this->parseAngle($value);

        return $angle === null ? null : new DirectionRange($angle, $angle);
    }

    private function parseAngle(string $value): ?float
    {
        $value = trim($value);
        $lower = strtolower($value);

        if (array_key_exists($lower, self::NAMED_DIRECTIONS)) {
            return self::NAMED_DIRECTIONS[$lower];
        }

        if (! is_numeric($value)) {
            return null;
        }

        $angle = fmod((float) $value, 360.0);

        return $angle < 0 ? $angle + 360.0 : $angle;
    }

    private function looksLikeRange(string $value): bool
    {
        return str_contains(substr(trim($value), 1), '-');
    }
}
