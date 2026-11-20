<?php

namespace App\Services\PoliceAlerts;

use App\Services\Directions\DirectionsException;
use Illuminate\Http\JsonResponse;

class PoliceAlertsUnavailable extends DirectionsException
{
    public function __construct(public readonly int $retryAfter, int $status = 200)
    {
        parent::__construct('Police alerts are temporarily unavailable.', $status);
    }

    /** @param array<string, int|string> $headers */
    public function toResponse(array $headers = []): JsonResponse
    {
        return response()->json([
            'ok' => false,
            'error' => $this->getMessage(),
        ], $this->status, [
            ...$headers,
            'Retry-After' => (string) $this->retryAfter,
            'Cache-Control' => 'no-store',
        ]);
    }
}
