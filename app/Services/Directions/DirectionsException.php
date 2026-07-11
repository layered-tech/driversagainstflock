<?php

namespace App\Services\Directions;

use RuntimeException;

class DirectionsException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 500)
    {
        parent::__construct($message);
    }

    public static function badRequest(string $message): self
    {
        return new self($message, 400);
    }

    public static function upstream(string $message): self
    {
        return new self($message, 502);
    }
}
