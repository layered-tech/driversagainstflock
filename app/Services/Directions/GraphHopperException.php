<?php

namespace App\Services\Directions;

class GraphHopperException extends DirectionsException
{
    public function __construct(string $message, public readonly string $diagnosticCode)
    {
        parent::__construct($message, 502);
    }

    public static function connection(): self
    {
        return new self('GraphHopper could not be reached.', 'connection');
    }

    public static function requestException(): self
    {
        return new self('GraphHopper could not load directions.', 'request-exception');
    }

    public static function response(int $status): self
    {
        return new self('GraphHopper could not load directions.', 'http-'.$status);
    }

    public static function avoidanceLimits(): self
    {
        return new self('GraphHopper avoidance limits were exceeded.', 'avoidance-limits');
    }

    public static function invalidResponse(): self
    {
        return new self('GraphHopper returned an invalid route.', 'invalid-response');
    }

    /**
     * @return array{graphhopper_diagnostic_code: string}
     */
    public function context(): array
    {
        return ['graphhopper_diagnostic_code' => $this->diagnosticCode];
    }
}
