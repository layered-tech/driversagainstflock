<?php

namespace App\Services\Directions;

class GraphHopperException extends DirectionsException
{
    public static function upstream(string $message): self
    {
        return new self($message, 502);
    }
}
